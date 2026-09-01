import { createSystem, Object3D, Quaternion, Vector3 } from '@iwsdk/core';
import type { Entity } from '@iwsdk/core';
import { joinRoom } from 'trystero';
import type { MessageAction, Room } from 'trystero';
import { defaultCourtPreset, getCourtPreset, multiplayer } from '../config.js';
import {
  buildPresenceMessage,
  defaultPose,
  mirrorPoseToFarBaseline,
  parsePresenceMessage,
} from '../core/presence.js';
import type { Pose, PresenceMessage } from '../core/presence.js';
import { log } from '../core/log.js';

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
 * No shared match state yet — each player still plays their own
 * pieces (that's MP2's authority handoff, deliberately not built here).
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
 */
export class MultiplayerSystem extends createSystem({}) {
  private room?: Room;
  private presenceAction?: MessageAction<PresenceMessage>;
  private sendTimerS = 0;
  private peerAvatars = new Map<string, Entity>();

  // Reused every send tick instead of allocated fresh — see
  // .claude/rules (never allocate in update()); the throttled ~20Hz
  // send path mutates these in place rather than building new objects.
  private readonly headPose: Pose = defaultPose();
  private readonly leftPose: Pose = defaultPose();
  private readonly rightPose: Pose = defaultPose();
  private readonly tmpPos = new Vector3();
  private readonly tmpQuat = new Quaternion();

  init(): void {
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
    this.room.onPeerJoin = (peerId) => {
      log('info', 'net', 'peer joined', { peerId, roomId });
    };
    this.room.onPeerLeave = (peerId) => {
      log('info', 'net', 'peer left', { peerId });
      this.removePeerAvatar(peerId);
    };
    log('info', 'net', 'joined multiplayer room', {
      roomId,
      appId: multiplayer.appId,
    });
  }

  destroy(): void {
    this.room?.leave();
    for (const entity of this.peerAvatars.values()) {
      entity.dispose();
    }
    this.peerAvatars.clear();
  }

  update(delta: number): void {
    this.sendTimerS += delta;
    if (this.sendTimerS < multiplayer.sendIntervalS) {
      return;
    }
    this.sendTimerS = 0;
    this.sendPresence();
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
