import {
  createSystem,
  Object3D,
  PhysicsSystem,
  Quaternion,
  Vector3,
} from '@iwsdk/core';
import type { Entity } from '@iwsdk/core';
import { joinRoom, selfId } from 'trystero';
import type { MessageAction, Room } from 'trystero';
import { defaultCourtPreset, getCourtPreset, multiplayer } from '../config.js';
import { KUBB_COUNT } from '../core/court-layout.js';
import { isHost } from '../core/multiplayerAuthority.js';
import type { PeerJoinInfo } from '../core/multiplayerAuthority.js';
import {
  buildPieceSyncMessage,
  parsePieceSyncMessage,
} from '../core/pieceSync.js';
import type { PieceSyncMessage, PieceTransform } from '../core/pieceSync.js';
import {
  buildPresenceMessage,
  defaultPose,
  mirrorPoseToFarBaseline,
  parsePresenceMessage,
} from '../core/presence.js';
import type { Pose, PresenceMessage } from '../core/presence.js';
import { log } from '../core/log.js';
import { settingsState } from '../settingsState.js';

// King + both kubb baselines — MP2 phase 1's shared court state (see
// class doc). NOT sticks: a stick is grabbed/thrown locally, and
// networking a grab needs relaying the throw through the host's
// physics (phase 2, not built yet) — sticks stay MP1-local for now.
const NETWORKED_PIECE_IDS = [
  'king',
  ...Array.from({ length: KUBB_COUNT * 2 }, (_, i) => `kubb-${i}`),
];

// The other headset spawns at the far baseline — the one you normally
// throw at — facing back toward you (Erik, 2026-09-01). Not preset-
// aware per game mode switch (MultiplayerSystem has no
// GameModeChanged subscription); good enough for MP1, revisit if the
// far baseline moves mid-session becomes something players actually
// do.
const FAR_Z = -getCourtPreset(defaultCourtPreset).lengthM;

/**
 * MP1 co-presence (docs/PLAN.md §10, Erik's 2 Quests, 2026-08-31):
 * broadcasts local head + hand transforms over Trystero and renders
 * every other peer as a placeholder avatar (`peer-avatar` asset — see
 * .claude/skills/iwsdk-scene-composer, materials.ts's avatarMaterial).
 * (Shared match state — king/kubb sync — arrived in MP2 phase 1,
 * documented further down; still true that sticks stay MP1-local.)
 *
 * Room: `?room=<code>` in the URL, defaulting to a fixed lobby id so
 * two headsets opening the plain deployed URL land in the same room
 * with zero setup — good enough for Erik's first test with 2 known
 * devices, not a real room/matchmaking UI (friend-link rooms are a
 * later step per the plan).
 *
 * Placement: both players' own tracked origin is (0,0,0) by default
 * (no authored player.transform, see CLAUDE.md), so a remote peer's
 * raw position would otherwise exactly coincide with the local
 * player's own body. Erik's 2026-09-01 decision: the other headset
 * appears at the far baseline (the one you normally throw at), facing
 * back toward you — see core/presence.ts's mirrorPoseToFarBaseline().
 *
 * Voice (docs/PLAN.md §10's "voice chat built in" — Trystero's
 * addStream/onPeerStream, not IWSDK's own AudioSystem, which only
 * plays pre-loaded clips through a private, unexposed AudioListener,
 * not live WebRTC MediaStreams). Deliberately NOT spatial audio for
 * this first pass — a plain hidden `<audio>` element per peer, global
 * stereo, not panned to the avatar's position — proper 3D voice needs
 * its own AudioListener wired to the camera, cut here to keep this
 * pass's scope to "can we hear each other" rather than reimplementing
 * part of IWSDK's audio pipeline. Muted by default
 * (settings.micMuted — plan's own "mute button mandatory"); toggled
 * live via the settings menu, checked every tick rather than only on
 * toggle since this system has no settings-changed subscription.
 *
 * MP2 phase 1 (Erik, 2026-09-01, interviewed for the design): shared
 * court state, using core/multiplayerAuthority.ts's "först in äger
 * spelet" rule — whichever peer joined the room first is the
 * authoritative host for king + kubb positions, broadcasting them
 * (core/pieceSync.ts) at the same ~20Hz as presence. The guest applies
 * every incoming snapshot directly via `PhysicsSystem.setBodyTransform`
 * (the same API MenuSystem's reset uses) rather than switching those
 * bodies to Kinematic — changing a body's motion state at runtime
 * needs "deliberate lifecycle handling" per the physics skill
 * reference (remove+recreate the body), which is real surgery on 11
 * pieces for a first pass; periodic snap-correction is simpler and
 * safe, at the cost of a small amount of visible drift between
 * network ticks while local gravity briefly acts on an otherwise-
 * mirrored body.
 *
 * Deliberately NOT phase 1: Erik asked for both players to throw AND
 * a real turn-based 1v1 match. That needs (a) relaying a guest's
 * stick release through the host's physics — the guest's own local
 * throw can't be authoritative once kubbs/king are host-owned, so a
 * release has to become a network request the host applies to ITS
 * copy of that stick — and (b) turn enforcement + per-baseline kubb
 * ownership in the rules engine (SimpleRulesSystem/ToppleSystem
 * currently assume one practicing player, not two sides). Both are
 * real next phases, not guessed at here — see docs/DECISIONS.md.
 */
export class MultiplayerSystem extends createSystem({}) {
  private room?: Room;
  private presenceAction?: MessageAction<PresenceMessage>;
  private pieceSyncAction?: MessageAction<PieceSyncMessage>;
  private helloAction?: MessageAction<{ joinedAtMs: number }>;
  private physicsSystem!: PhysicsSystem;
  private sendTimerS = 0;
  private peerAvatars = new Map<string, Entity>();
  private micTrack: MediaStreamTrack | null = null;
  private remoteAudioElements = new Map<string, HTMLAudioElement>();
  private readonly joinedAtMs = Date.now();
  private readonly peerJoinedAtMs = new Map<string, number>();
  private networkedPieces = new Map<string, Entity>();

  // Reused every send tick instead of allocated fresh — see
  // .claude/rules (never allocate in update()); the throttled ~20Hz
  // send path mutates these in place rather than building new objects.
  private readonly headPose: Pose = defaultPose();
  private readonly leftPose: Pose = defaultPose();
  private readonly rightPose: Pose = defaultPose();
  private readonly tmpPos = new Vector3();
  private readonly tmpQuat = new Quaternion();

  init(): void {
    const physicsSystem = this.world.getSystem(PhysicsSystem);
    if (!physicsSystem) {
      throw new Error(
        'MultiplayerSystem requires PhysicsSystem — enable the "physics" world feature in iwsdk.config.json',
      );
    }
    this.physicsSystem = physicsSystem;
    for (const id of NETWORKED_PIECE_IDS) {
      this.networkedPieces.set(id, this.world.requireSceneEntity(id));
    }

    const roomId = this.roomIdFromUrl();
    this.room = joinRoom({ appId: multiplayer.appId }, roomId);
    this.presenceAction = this.room.makeAction<PresenceMessage>('presence');
    this.presenceAction.onMessage = (data, { peerId }) => {
      const message = parsePresenceMessage(data);
      if (!message) {
        log('warn', 'net', 'dropped malformed presence message', { peerId });
        return;
      }
      this.applyPeerPresence(peerId, message);
    };
    this.helloAction = this.room.makeAction<{ joinedAtMs: number }>('hello');
    this.helloAction.onMessage = (data, { peerId }) => {
      this.peerJoinedAtMs.set(peerId, data.joinedAtMs);
    };
    this.pieceSyncAction = this.room.makeAction<PieceSyncMessage>('pieceSync');
    this.pieceSyncAction.onMessage = (data) => {
      const message = parsePieceSyncMessage(data);
      if (!message) {
        log('warn', 'net', 'dropped malformed piece-sync message', {});
        return;
      }
      this.applyPieceSync(message);
    };
    this.room.onPeerJoin = (peerId) => {
      log('info', 'net', 'peer joined', { peerId, roomId });
      void this.helloAction?.send(
        { joinedAtMs: this.joinedAtMs },
        { target: peerId },
      );
    };
    this.room.onPeerLeave = (peerId) => {
      log('info', 'net', 'peer left', { peerId });
      this.removePeerAvatar(peerId);
      this.removeRemoteAudio(peerId);
      this.peerJoinedAtMs.delete(peerId);
    };
    this.room.onPeerStream = (stream, peerId) => {
      this.playRemoteAudio(peerId, stream);
    };
    log('info', 'net', 'joined multiplayer room', {
      roomId,
      appId: multiplayer.appId,
    });
    void this.setUpMicrophone();
  }

  destroy(): void {
    this.room?.leave();
    for (const entity of this.peerAvatars.values()) {
      entity.dispose();
    }
    this.peerAvatars.clear();
    this.micTrack?.stop();
    this.micTrack = null;
    for (const peerId of [...this.remoteAudioElements.keys()]) {
      this.removeRemoteAudio(peerId);
    }
  }

  update(delta: number): void {
    if (this.micTrack) {
      this.micTrack.enabled = !settingsState.current.micMuted;
    }
    this.sendTimerS += delta;
    if (this.sendTimerS < multiplayer.sendIntervalS) {
      return;
    }
    this.sendTimerS = 0;
    this.sendPresence();
    if (this.isHostNow()) {
      this.sendPieceSync();
    }
  }

  /** Only meaningful once every currently-connected peer's `hello` has
   * arrived — see the class doc's phase-1 note. Alone in the room
   * (peers.length === 0) trivially counts as "known", so a solo
   * session still broadcasts (harmless — no one's listening). */
  private isHostNow(): boolean {
    const peerIds = Object.keys(this.room?.getPeers() ?? {});
    if (!peerIds.every((id) => this.peerJoinedAtMs.has(id))) {
      return false;
    }
    const peers: PeerJoinInfo[] = peerIds.map((id) => ({
      id,
      joinedAtMs: this.peerJoinedAtMs.get(id) ?? 0,
    }));
    return isHost({ id: selfId, joinedAtMs: this.joinedAtMs }, peers);
  }

  private sendPieceSync(): void {
    if (!this.pieceSyncAction) {
      return;
    }
    const pieces: PieceTransform[] = [];
    for (const [id, entity] of this.networkedPieces) {
      const object3D = entity.object3D;
      if (!object3D) {
        continue;
      }
      pieces.push({
        id,
        position: [
          object3D.position.x,
          object3D.position.y,
          object3D.position.z,
        ],
        quaternion: [
          object3D.quaternion.x,
          object3D.quaternion.y,
          object3D.quaternion.z,
          object3D.quaternion.w,
        ],
      });
    }
    void this.pieceSyncAction.send(buildPieceSyncMessage(pieces));
  }

  private applyPieceSync(message: PieceSyncMessage): void {
    for (const piece of message.pieces) {
      const entity = this.networkedPieces.get(piece.id);
      if (!entity) {
        continue;
      }
      this.physicsSystem.setBodyTransform(entity, {
        position: piece.position,
        quaternion: piece.quaternion,
      });
    }
  }

  private async setUpMicrophone(): Promise<void> {
    if (!this.room || !navigator.mediaDevices?.getUserMedia) {
      log('warn', 'net', 'microphone unavailable — voice chat disabled', {});
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
      });
      const [track] = stream.getAudioTracks();
      if (!track) {
        return;
      }
      track.enabled = !settingsState.current.micMuted;
      this.micTrack = track;
      this.room.addStream(stream);
      log('info', 'net', 'microphone connected', {});
    } catch (error) {
      log('warn', 'net', 'microphone permission denied or unavailable', {
        error: String(error),
      });
    }
  }

  private playRemoteAudio(peerId: string, stream: MediaStream): void {
    this.removeRemoteAudio(peerId);
    const audio = new Audio();
    audio.srcObject = stream;
    audio.autoplay = true;
    this.remoteAudioElements.set(peerId, audio);
    log('info', 'net', 'peer voice connected', { peerId });
  }

  private removeRemoteAudio(peerId: string): void {
    const audio = this.remoteAudioElements.get(peerId);
    if (!audio) {
      return;
    }
    audio.pause();
    audio.srcObject = null;
    this.remoteAudioElements.delete(peerId);
  }

  private roomIdFromUrl(): string {
    const params = new URLSearchParams(window.location.search);
    return params.get('room') || multiplayer.defaultRoomId;
  }

  private sendPresence(): void {
    if (!this.presenceAction) {
      return;
    }
    this.writePose(this.player.head, this.headPose);
    this.writePose(this.player.gripSpaces.left, this.leftPose);
    this.writePose(this.player.gripSpaces.right, this.rightPose);
    const message = buildPresenceMessage({
      head: this.headPose,
      leftHand: this.leftPose,
      rightHand: this.rightPose,
    });
    void this.presenceAction.send(message);
  }

  private writePose(object3D: Object3D, target: Pose): void {
    object3D.getWorldPosition(this.tmpPos);
    object3D.getWorldQuaternion(this.tmpQuat);
    target.position[0] = this.tmpPos.x;
    target.position[1] = this.tmpPos.y;
    target.position[2] = this.tmpPos.z;
    target.quaternion[0] = this.tmpQuat.x;
    target.quaternion[1] = this.tmpQuat.y;
    target.quaternion[2] = this.tmpQuat.z;
    target.quaternion[3] = this.tmpQuat.w;
  }

  private applyPeerPresence(peerId: string, message: PresenceMessage): void {
    const avatarEntity = this.peerAvatars.get(peerId);
    if (!avatarEntity) {
      // First message from a new peer — instantiate its avatar
      // asynchronously; messages that arrive before it resolves are
      // simply dropped (the next ~20Hz tick catches up).
      void this.createPeerAvatar(peerId, message);
      return;
    }
    const object3D = avatarEntity.object3D;
    if (!object3D) {
      return;
    }
    this.applyPoseToPart(object3D, 'head', message.head);
    this.applyPoseToPart(object3D, 'leftHand', message.leftHand);
    this.applyPoseToPart(object3D, 'rightHand', message.rightHand);
  }

  private applyPoseToPart(root: Object3D, name: string, pose: Pose): void {
    const part = root.getObjectByName(name);
    if (!part) {
      return;
    }
    const mirrored = mirrorPoseToFarBaseline(pose, FAR_Z);
    this.tmpPos.set(...mirrored.position);
    part.position.copy(this.tmpPos);
    part.quaternion.set(...mirrored.quaternion);
  }

  private async createPeerAvatar(
    peerId: string,
    firstMessage: PresenceMessage,
  ): Promise<void> {
    if (this.peerAvatars.has(peerId)) {
      return;
    }
    const object3D =
      await this.world.assets.instantiate<Object3D>('peer-avatar');
    const entity = this.world.createTransformEntity(object3D);
    this.peerAvatars.set(peerId, entity);
    log('info', 'net', 'peer avatar created', { peerId });
    this.applyPoseToPart(object3D, 'head', firstMessage.head);
    this.applyPoseToPart(object3D, 'leftHand', firstMessage.leftHand);
    this.applyPoseToPart(object3D, 'rightHand', firstMessage.rightHand);
  }

  private removePeerAvatar(peerId: string): void {
    const entity = this.peerAvatars.get(peerId);
    if (!entity) {
      return;
    }
    entity.dispose();
    this.peerAvatars.delete(peerId);
  }
}
