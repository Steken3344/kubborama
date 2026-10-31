import { createSystem } from '@iwsdk/core';
import { gameEvents } from '../core/events.js';
import type { GameEvents } from '../core/events.js';
import { log } from '../core/log.js';
import type { VoiceSignal } from '../core/serverProtocol.js';
import { isServerModeOn } from '../serverMode.js';
import { settingsState } from '../settingsState.js';
import { ServerLinkSystem } from './serverLink.js';

/** Don't let an unanswered mic prompt hold the call hostage: after this
 * long the call goes ahead receive-only (review, 2026-10-31). */
const MIC_WAIT_MS = 3000;

/**
 * Voice between the two headsets when playing through the game server
 * (docs/superpowers/specs/2026-10-31-one-address-server-design.md): a
 * plain WebRTC audio connection, with the SERVER as the signaling
 * channel — it introduces the headsets, no Trystero/Nostr involved.
 * Side A offers whenever the server's seat `generation` changes with two
 * players seated (a join, or B reconnecting into its seat) and when the
 * connection fails; side B answers every offer, replacing any old call.
 * Home network only, so no STUN/TURN — host candidates connect directly.
 * The mute setting applies to the mic track every frame, like
 * MultiplayerSystem's Trystero voice.
 */
export class VoiceLinkSystem extends createSystem({}) {
  private serverLink: ServerLinkSystem | null = null;
  private pc: RTCPeerConnection | null = null;
  private micTrack: MediaStreamTrack | null = null;
  private micStream: MediaStream | null = null;
  private micReady: Promise<void> = Promise.resolve();
  private audio: HTMLAudioElement | null = null;
  private pendingIce: RTCIceCandidateInit[] = [];
  /** The latest seat state from the server. */
  private peers: GameEvents['ServerPeers'] = {
    count: 0,
    mySide: null,
    generation: -1,
  };
  /** The seat generation our current call was made for. */
  private callGeneration = -2;
  /** Bumped by every incoming offer: only the newest one is answered. */
  private offerSeq = 0;
  private destroyed = false;

  init(): void {
    if (!isServerModeOn()) {
      return;
    }
    this.serverLink = this.world.getSystem(ServerLinkSystem) ?? null;
    this.micReady = this.setUpMicrophone();
    this.cleanupFuncs.push(
      gameEvents.on('ServerPeers', (e) => {
        this.peers = e;
        void this.maybeCall();
      }),
      gameEvents.on('VoiceSignal', (e) => {
        void this.onSignal(e.data);
      }),
      () => {
        this.destroyed = true;
        this.hangUp();
        this.micTrack?.stop();
      },
    );
  }

  update(): void {
    if (this.micTrack) {
      this.micTrack.enabled = !settingsState.current.micMuted;
    }
  }

  private async setUpMicrophone(): Promise<void> {
    if (!navigator.mediaDevices?.getUserMedia) {
      log('warn', 'net', 'microphone unavailable — voice chat disabled', {});
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (this.destroyed) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      this.micStream = stream;
      this.micTrack = stream.getAudioTracks()[0] ?? null;
      if (this.micTrack) {
        this.micTrack.enabled = !settingsState.current.micMuted;
      }
      log('info', 'net', 'microphone connected', {});
    } catch (error) {
      log('warn', 'net', 'microphone permission denied or unavailable', {
        error: String(error),
      });
    }
  }

  /** The mic, or a receive-only call after MIC_WAIT_MS. */
  private async micOrTimeout(): Promise<void> {
    await Promise.race([
      this.micReady,
      new Promise<void>((done) => setTimeout(done, MIC_WAIT_MS)),
    ]);
  }

  /** Side A: (re)call when two players are seated and our call is for an
   * older seat generation. Re-checked after every await, so overlapping
   * seat updates can never start two calls. */
  private async maybeCall(): Promise<void> {
    const { count, mySide, generation } = this.peers;
    if (count < 2) {
      this.hangUp();
      this.callGeneration = -2;
      return;
    }
    if (mySide !== 'host' || this.callGeneration === generation) {
      return; // side B waits for A's offer; this generation is handled
    }
    this.callGeneration = generation;
    await this.micOrTimeout();
    if (this.peers.generation !== generation || this.destroyed) {
      return; // a newer seat change will make its own call
    }
    this.hangUp();
    const pc = this.connection();
    try {
      const offer = await pc.createOffer();
      if (this.pc !== pc) {
        return;
      }
      await pc.setLocalDescription(offer);
      if (this.pc !== pc) {
        return;
      }
      this.send({ kind: 'offer', sdp: offer.sdp ?? '' });
      log('info', 'net', 'voice offer sent', { generation });
    } catch (error) {
      this.signalingFailed(pc, 'offer', error);
    }
  }

  /** A WebRTC call failed mid-signaling — only worth a word if it is
   * still the current call (an old one closing throws by design). */
  private signalingFailed(
    pc: RTCPeerConnection,
    step: string,
    error: unknown,
  ): void {
    if (this.pc === pc) {
      log('warn', 'net', 'voice signaling failed', {
        step,
        error: String(error),
      });
    }
  }

  private async onSignal(data: VoiceSignal): Promise<void> {
    if (data.kind === 'offer') {
      // Hang up FIRST: the ICE candidates that follow this offer then
      // queue for the new call instead of being wiped after the mic wait
      // (review, 2026-10-31). Only the newest offer is answered.
      const seq = ++this.offerSeq;
      this.hangUp();
      await this.micOrTimeout();
      if (this.destroyed || seq !== this.offerSeq) {
        return;
      }
      const pc = this.connection();
      try {
        await pc.setRemoteDescription({ type: 'offer', sdp: data.sdp });
        if (this.pc !== pc) {
          return;
        }
        await this.flushIce();
        const answer = await pc.createAnswer();
        if (this.pc !== pc) {
          return;
        }
        await pc.setLocalDescription(answer);
        if (this.pc !== pc) {
          return;
        }
        this.send({ kind: 'answer', sdp: answer.sdp ?? '' });
      } catch (error) {
        this.signalingFailed(pc, 'answer', error);
      }
      return;
    }
    if (data.kind === 'answer') {
      const pc = this.pc;
      if (!pc || pc.signalingState !== 'have-local-offer') {
        return;
      }
      try {
        await pc.setRemoteDescription({ type: 'answer', sdp: data.sdp });
        await this.flushIce();
      } catch (error) {
        // An answer to an older offer — the next generation re-calls.
        this.signalingFailed(pc, 'apply answer', error);
      }
      return;
    }
    const candidate: RTCIceCandidateInit = {
      candidate: data.candidate,
      sdpMid: data.sdpMid,
      sdpMLineIndex: data.sdpMLineIndex,
    };
    if (this.pc?.remoteDescription) {
      await this.pc.addIceCandidate(candidate).catch(() => undefined);
    } else {
      this.pendingIce.push(candidate);
    }
  }

  private connection(): RTCPeerConnection {
    const pc = new RTCPeerConnection({ iceServers: [] });
    this.pc = pc;
    if (this.micTrack && this.micStream) {
      pc.addTrack(this.micTrack, this.micStream);
    } else {
      pc.addTransceiver('audio', { direction: 'recvonly' });
    }
    pc.onicecandidate = (event) => {
      if (event.candidate && this.pc === pc) {
        this.send({
          kind: 'ice',
          candidate: event.candidate.candidate,
          sdpMid: event.candidate.sdpMid,
          sdpMLineIndex: event.candidate.sdpMLineIndex,
        });
      }
    };
    pc.ontrack = (event) => {
      if (this.pc !== pc) {
        return;
      }
      const [stream] = event.streams;
      this.audio?.pause();
      const audio = new Audio();
      audio.srcObject = stream ?? new MediaStream([event.track]);
      audio.autoplay = true;
      // Autoplay can be refused before a user gesture (entering VR gives
      // one); try explicitly and say so if it is still blocked.
      void audio.play().catch((error: unknown) => {
        log('warn', 'net', 'voice playback blocked', { error: String(error) });
      });
      this.audio = audio;
      log('info', 'net', 'peer voice connected', { via: 'game server' });
    };
    pc.onconnectionstatechange = () => {
      if (this.pc !== pc) {
        return; // an old call closing
      }
      log('info', 'net', 'voice connection', { state: pc.connectionState });
      if (pc.connectionState === 'failed' && this.peers.mySide === 'host') {
        // Side A calls again (e.g. a blip broke ICE).
        this.callGeneration = -2;
        void this.maybeCall();
      }
    };
    return pc;
  }

  private async flushIce(): Promise<void> {
    const queued = this.pendingIce;
    this.pendingIce = [];
    for (const candidate of queued) {
      await this.pc?.addIceCandidate(candidate).catch(() => undefined);
    }
  }

  private hangUp(): void {
    this.pc?.close();
    this.pc = null;
    this.pendingIce = [];
    if (this.audio) {
      this.audio.pause();
      this.audio.srcObject = null;
      this.audio = null;
    }
  }

  private send(data: VoiceSignal): void {
    this.serverLink?.sendSignal(data);
  }
}
