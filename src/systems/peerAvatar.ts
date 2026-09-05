import { createSystem, MeshStandardMaterial, Object3D } from '@iwsdk/core';
import type { Entity, Mesh } from '@iwsdk/core';
import { avatar, avatarPaletteEntry } from '../config.js';
import { solveAvatarPose } from '../core/avatarPose.js';
import type { Segment } from '../core/avatarPose.js';
import { gameEvents } from '../core/events.js';
import type { GameEvents } from '../core/events.js';
import { log } from '../core/log.js';
import type { Pose } from '../core/presence.js';
import { yawFromQuaternion } from '../core/quat.js';

interface AvatarInstance {
  entity: Entity;
  root: Object3D;
  /** Per-instance clone so each peer can have its own color. */
  material: MeshStandardMaterial;
  colorIndex: number;
  smoothedYawRad: number;
  lastMessageAtMs: number;
}

/**
 * MP3b (Erik, 2026-09-05): owns every remote player's avatar — creation,
 * color, posing, disposal. Fed purely by the bus (`PeerPresence` /
 * `PeerLeft`, emitted by MultiplayerSystem, which owns the network and
 * nothing else about avatars any more). No `update()`: presence arrives
 * ~20 Hz and every step is event-driven with preallocated scratch.
 *
 * Body: core/avatarPose.ts derives torso, shoulders and straight arms
 * from the head + hands. The torso yaw follows the head yaw through an
 * exponential low-pass (`avatar.yawSmoothingS`) — bodies turn slower
 * than heads — using the wall-clock gap between messages, since this
 * system has no frame loop of its own.
 *
 * Color: the sender's `colorIndex` (its settings) is clamped onto the
 * palette by config.ts's avatarPaletteEntry(); the prototype's shared
 * material is replaced on every body mesh by one clone per instance
 * (the visor keeps its own dark material — see the scene asset).
 */
export class PeerAvatarSystem extends createSystem({}) {
  private avatars = new Map<string, AvatarInstance>();
  private inFlight = new Set<string>();
  /** Peers whose PeerLeft arrived while their instantiate() was pending. */
  private leftWhileInFlight = new Set<string>();

  init(): void {
    this.cleanupFuncs.push(
      gameEvents.on('PeerPresence', (event) => {
        this.onPeerPresence(event);
      }),
      gameEvents.on('PeerLeft', ({ peerId }) => {
        this.onPeerLeft(peerId);
      }),
    );
  }

  destroy(): void {
    for (const peerId of [...this.avatars.keys()]) {
      this.onPeerLeft(peerId);
    }
  }

  private onPeerPresence(event: GameEvents['PeerPresence']): void {
    const instance = this.avatars.get(event.peerId);
    if (!instance) {
      void this.createAvatar(event);
      return;
    }
    this.applyPresence(instance, event.message);
  }

  private onPeerLeft(peerId: string): void {
    if (this.inFlight.has(peerId)) {
      this.leftWhileInFlight.add(peerId);
      return;
    }
    const instance = this.avatars.get(peerId);
    if (!instance) {
      return;
    }
    instance.entity.dispose();
    instance.material.dispose();
    this.avatars.delete(peerId);
    log('info', 'net', 'peer avatar removed', { peerId });
  }

  /** In-flight guard set SYNCHRONOUSLY before the await, and a "left
   * while loading" check after it — the two ghost/duplicate paths the
   * MP1/MP2 reviews found (2026-09-02/03), carried over unchanged. */
  private async createAvatar(event: GameEvents['PeerPresence']): Promise<void> {
    const { peerId } = event;
    if (this.avatars.has(peerId) || this.inFlight.has(peerId)) {
      return;
    }
    this.inFlight.add(peerId);
    const root = await this.world.assets.instantiate<Object3D>('peer-avatar');
    this.inFlight.delete(peerId);
    if (this.avatars.has(peerId) || this.leftWhileInFlight.delete(peerId)) {
      // Route through an entity so GPU resources are released the same
      // way as any other avatar (CLAUDE.md: dispose(), never destroy()).
      this.world.createTransformEntity(root).dispose();
      return;
    }
    const material = this.tintBodyMaterial(root, event.message.colorIndex);
    const entity = this.world.createTransformEntity(root);
    const instance: AvatarInstance = {
      entity,
      root,
      material,
      colorIndex: event.message.colorIndex,
      smoothedYawRad: yawFromQuaternion(event.message.head.quaternion),
      lastMessageAtMs: performance.now(),
    };
    this.avatars.set(peerId, instance);
    log('info', 'net', 'peer avatar created', {
      peerId,
      color: avatarPaletteEntry(event.message.colorIndex).id,
    });
    this.applyPresence(instance, event.message);
  }

  /** One material clone per instance; every body mesh (not the visor)
   * points at it. Returns the clone so the instance can retint/dispose. */
  private tintBodyMaterial(
    root: Object3D,
    colorIndex: number,
  ): MeshStandardMaterial {
    const material = new MeshStandardMaterial({ roughness: 0.5 });
    material.color.set(avatarPaletteEntry(colorIndex).hex);
    root.traverse((child) => {
      if (child.name === 'visor' || !(child as Mesh).isMesh) {
        return;
      }
      (child as Mesh).material = material;
    });
    return material;
  }

  private applyPresence(
    instance: AvatarInstance,
    message: GameEvents['PeerPresence']['message'],
  ): void {
    if (message.colorIndex !== instance.colorIndex) {
      instance.colorIndex = message.colorIndex;
      instance.material.color.set(avatarPaletteEntry(message.colorIndex).hex);
    }

    const nowMs = performance.now();
    const dtS = Math.max(0, (nowMs - instance.lastMessageAtMs) / 1000);
    instance.lastMessageAtMs = nowMs;
    const targetYaw = yawFromQuaternion(message.head.quaternion);
    // Exponential smoothing on the shortest angular path.
    const alpha = 1 - Math.exp(-dtS / avatar.yawSmoothingS);
    let delta = targetYaw - instance.smoothedYawRad;
    delta = Math.atan2(Math.sin(delta), Math.cos(delta));
    instance.smoothedYawRad += delta * alpha;

    const solved = solveAvatarPose(
      {
        head: message.head,
        leftHand: message.leftHand,
        rightHand: message.rightHand,
        torsoYawRad: instance.smoothedYawRad,
      },
      avatar,
    );
    this.applyPose(instance.root, 'head', message.head);
    this.applyPose(instance.root, 'leftHand', message.leftHand);
    this.applyPose(instance.root, 'rightHand', message.rightHand);
    this.applyPose(instance.root, 'torso', solved.torso);
    this.applySegment(instance.root, 'leftArm', solved.leftArm);
    this.applySegment(instance.root, 'rightArm', solved.rightArm);
  }

  /** No mirroring (2026-09-02): both peers already send shared-world
   * coordinates once the guest's own rig has been repositioned. */
  private applyPose(root: Object3D, name: string, pose: Pose): void {
    const part = root.getObjectByName(name);
    if (!part) {
      return;
    }
    part.position.set(...pose.position);
    part.quaternion.set(...pose.quaternion);
  }

  private applySegment(root: Object3D, name: string, segment: Segment): void {
    const part = root.getObjectByName(name);
    if (!part) {
      return;
    }
    part.position.set(...segment.position);
    part.quaternion.set(...segment.quaternion);
    part.scale.set(1, segment.lengthM, 1);
  }
}
