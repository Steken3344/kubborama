import { createSystem } from '@iwsdk/core';
import { gameEvents } from '../core/events.js';
import type { GameEvents } from '../core/events.js';
import { log } from '../core/log.js';
import type { VoiceSignal } from '../core/serverProtocol.js';
import { isServerModeOn } from '../serverMode.js';
import { settingsState } from '../settingsState.js';
import { ServerLinkSystem } from './serverLink.js';

/**
 * Voice between the two headsets when playing through the game server
 * (docs/superpowers/specs/2026-10-31-one-address-server-design.md): a
 * plain WebRTC audio connection, with the SERVER as the signaling
 * channel — it introduces the headsets, no Trystero/Nostr involved.
 * Side A makes the offer once both players are seated (the server's
 * `peers` count); side B answers. Home network only, so no STUN/TURN —
 * host candidates connect directly. The mute setting applies to the
 * mic track every frame, like MultiplayerSystem's Trystero voice.
 */
export class VoiceLinkSystem extends createSystem({}) {
  private serverLink: ServerLinkSystem | null = null;
  private pc: RTCPeerConnection | null = null;
  private micTrack: MediaStreamTrack | null = null;
  private micStream: MediaStream | null = null;
  private micReady: Promise<void> = Promise.resolve();
  private audio: HTMLAudioElement | null = null;
  private pendingIce: RTCIceCandidateInit[] = [];

  init(): void {
    if (!isServerModeOn()) {
      return;
    }
    this.serverLink = this.world.getSystem(ServerLinkSystem) ?? null;
    this.micReady = this.setUpMicrophone();
    this.cleanupFuncs.push(
      gameEvents.on('ServerPeers', (e) => {
        void this.onPeers(e);
      }),
      gameEvents.on('VoiceSignal', (e) => {
        void this.onSignal(e.data);
      }),
      () => {
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
      this.micStream = await navigator.mediaDevices.getUserMedia({
        audio: true,
      });
      this.micTrack = this.micStream.getAudioTracks()[0] ?? null;
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

  private async onPeers(e: GameEvents['ServerPeers']): Promise<void> {
    if (e.count < 2) {
      this.hangUp();
      return;
    }
    if (e.mySide !== 'host' || this.pc) {
      return; // side B waits for A's offer
    }
    await this.micReady;
    const pc = this.connection();
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    this.send({ kind: 'offer', sdp: offer.sdp ?? '' });
    log('info', 'net', 'voice offer sent', {});
  }

  private async onSignal(data: VoiceSignal): Promise<void> {
    if (data.kind === 'offer') {
      await this.micReady;
      this.hangUp(); // a fresh offer (A reconnected) replaces any old call
      const pc = this.connection();
      await pc.setRemoteDescription({ type: 'offer', sdp: data.sdp });
      await this.flushIce();
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      this.send({ kind: 'answer', sdp: answer.sdp ?? '' });
      return;
    }
    if (data.kind === 'answer') {
      if (this.pc && this.pc.signalingState === 'have-local-offer') {
        await this.pc.setRemoteDescription({ type: 'answer', sdp: data.sdp });
        await this.flushIce();
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
      if (event.candidate) {
        this.send({
          kind: 'ice',
          candidate: event.candidate.candidate,
          sdpMid: event.candidate.sdpMid,
          sdpMLineIndex: event.candidate.sdpMLineIndex,
        });
      }
    };
    pc.ontrack = (event) => {
      const [stream] = event.streams;
      this.audio?.pause();
      this.audio = new Audio();
      this.audio.srcObject = stream ?? new MediaStream([event.track]);
      this.audio.autoplay = true;
      log('info', 'net', 'peer voice connected', { via: 'game server' });
    };
    pc.onconnectionstatechange = () => {
      log('info', 'net', 'voice connection', { state: pc.connectionState });
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
