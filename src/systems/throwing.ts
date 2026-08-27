import {
  createSystem,
  eq,
  Grabbed,
  GrabSystem,
  PhysicsManipulation,
  Quaternion,
  Vector3,
} from '@iwsdk/core';
import type { Entity } from '@iwsdk/core';
import { StickPhase, StickState } from '../components/stick-state.js';
import { pieces } from '../config.js';
import { gameEvents } from '../core/events.js';
import { grabTick, releaseClick } from '../core/haptics.js';
import { log } from '../core/log.js';
import { isResting } from '../core/restState.js';
import { readBodySpeed } from './bodySpeed.js';
import {
  computeHandVelocity,
  computeReleaseVelocity,
} from '../core/throwRelease.js';
import type { PoseSample } from '../core/throwRelease.js';
import { activePreset, percentToReal, tuningParams } from '../core/tuning.js';
import { classifyThrow } from '../core/underhandClassifier.js';
import { length, scale } from '../core/vec3.js';
import type { HapticPulse } from '../core/haptics.js';
import type { Vec3 } from '../core/vec3.js';
import { presetBank } from '../tuningState.js';

type Hand = 'left' | 'right';

/**
 * The stick state machine (Racked -> Held -> Flying -> Settled) and the
 * throw-release adapter: samples the holding hand's grip pose every
 * frame, and on release calls core/throwRelease.ts's frame-averaged
 * velocity + lever-arm math, applying the result via
 * PhysicsManipulation (one-shot). No velocity transfer happens
 * anywhere else — the grab system does not do this on its own (see
 * docs/DECISIONS.md). The release-smoothing window and velocity/spin
 * multipliers come from the live tuning preset (src/tuningState.ts),
 * not a fixed constant, so the tuning lab can change throw feel live.
 */
export class ThrowingSystem extends createSystem({
  heldSticks: { required: [StickState, Grabbed] },
  flyingSticks: {
    required: [StickState],
    where: [eq(StickState, 'phase', StickPhase.Flying)],
  },
}) {
  private grabSystem!: GrabSystem;
  private poseBuffers = new Map<number, PoseSample[]>();
  private lastKnownHand = new Map<number, Hand>();
  private restTimerStartS = new Map<number, number>();
  private currentTimeS = 0;

  private tmpPos = new Vector3();
  private tmpQuat = new Quaternion();
  private tmpComPos = new Vector3();
  private tmpSpeed: [number, number] = [0, 0];

  init(): void {
    const grabSystem = this.world.getSystem(GrabSystem);
    if (!grabSystem) {
      throw new Error(
        'ThrowingSystem requires GrabSystem — enable the "grabbing" world feature in iwsdk.config.json',
      );
    }
    this.grabSystem = grabSystem;
    this.queries.heldSticks.subscribe('qualify', (entity) => {
      this.onGrabStart(entity);
    });
    this.queries.heldSticks.subscribe('disqualify', (entity) => {
      this.onRelease(entity);
    });
  }

  update(_delta: number, time: number): void {
    this.currentTimeS = time;
    for (const entity of this.queries.heldSticks.entities) {
      this.samplePose(entity, time);
    }
    for (const entity of this.queries.flyingSticks.entities) {
      this.checkForSettling(entity, time);
    }
  }

  private gripSpaceFor(hand: Hand) {
    return hand === 'left'
      ? this.player.gripSpaces.left
      : this.player.gripSpaces.right;
  }

  private poseWindowSize(): number {
    const preset = activePreset(presetBank);
    return Math.round(
      percentToReal(
        tuningParams.releaseSmoothingWindowFrames,
        preset.releaseSmoothingWindowFrames,
      ),
    );
  }

  private samplePose(entity: Entity, timeS: number): void {
    const hand = this.grabSystem.getHolderHand(entity);
    if (hand === null) {
      return;
    }
    this.lastKnownHand.set(entity.index, hand);
    const gripSpace = this.gripSpaceFor(hand);
    gripSpace.getWorldPosition(this.tmpPos);
    gripSpace.getWorldQuaternion(this.tmpQuat);

    const buffer = this.poseBuffers.get(entity.index) ?? [];
    buffer.push({
      timeS,
      position: [this.tmpPos.x, this.tmpPos.y, this.tmpPos.z],
      orientation: [
        this.tmpQuat.x,
        this.tmpQuat.y,
        this.tmpQuat.z,
        this.tmpQuat.w,
      ],
    });
    const windowSize = this.poseWindowSize();
    while (buffer.length > windowSize) {
      buffer.shift();
    }
    this.poseBuffers.set(entity.index, buffer);
  }

  private onGrabStart(entity: Entity): void {
    this.poseBuffers.set(entity.index, []);
    entity.setValue(StickState, 'phase', StickPhase.Held);
    const hand = this.grabSystem.getHolderHand(entity);
    if (hand !== null) {
      this.lastKnownHand.set(entity.index, hand);
    }
    this.pulseHaptic(hand, grabTick);
    log('debug', 'grab', 'stick grabbed', { entityIndex: entity.index, hand });
  }

  private onRelease(entity: Entity): void {
    const buffer = this.poseBuffers.get(entity.index) ?? [];
    const handVelocity = computeHandVelocity(buffer);

    const lastSample = buffer[buffer.length - 1];
    let leverArm: Vec3 = [0, 0, 0];
    let releasePosition: Vec3 = [0, 0, 0];
    const object3D = entity.object3D;
    if (object3D && lastSample) {
      object3D.getWorldPosition(this.tmpComPos);
      releasePosition = [this.tmpComPos.x, this.tmpComPos.y, this.tmpComPos.z];
      leverArm = [
        this.tmpComPos.x - lastSample.position[0],
        this.tmpComPos.y - lastSample.position[1],
        this.tmpComPos.z - lastSample.position[2],
      ];
    }

    const rawRelease = computeReleaseVelocity(handVelocity, leverArm);
    const preset = activePreset(presetBank);
    const velocityMultiplier = percentToReal(
      tuningParams.velocityTransferMultiplier,
      preset.velocityTransferMultiplier,
    );
    const angularMultiplier = percentToReal(
      tuningParams.angularMultiplier,
      preset.angularMultiplier,
    );
    const linearVelocity = scale(rawRelease.linearVelocity, velocityMultiplier);
    const angularVelocity = scale(
      rawRelease.angularVelocity,
      angularMultiplier,
    );

    entity.addComponent(PhysicsManipulation, {
      force: [0, 0, 0],
      linearVelocity,
      angularVelocity,
    });
    entity.setValue(StickState, 'phase', StickPhase.Flying);

    const hand = this.lastKnownHand.get(entity.index) ?? 'right';
    entity.setValue(StickState, 'lastThrowerHand', hand);
    this.pulseHaptic(hand, releaseClick);

    const classification = classifyThrow({
      poses: buffer,
      releaseVelocity: linearVelocity,
      angularVelocity,
    });
    const releaseSpeedMps = length(linearVelocity);

    gameEvents.emit('Thrown', {
      stickId: String(entity.index),
      handId: hand,
      releaseSpeedMps,
      releaseVelocity: linearVelocity,
      angularVelocity,
      releasePosition,
      style: classification.style,
      flipQualityScore: classification.flipQualityScore,
      presetId: presetBank.activePresetId,
      timeS: this.currentTimeS,
    });
    log('info', 'throw', 'release', {
      entityIndex: entity.index,
      hand,
      releaseSpeedMps,
      angularVelocity,
      style: classification.style,
      flipQualityScore: classification.flipQualityScore,
    });

    this.poseBuffers.delete(entity.index);
    this.restTimerStartS.delete(entity.index);
  }

  private checkForSettling(entity: Entity, timeS: number): void {
    readBodySpeed(entity, this.tmpSpeed);
    const resting = isResting(this.tmpSpeed[0], this.tmpSpeed[1], pieces.throw);

    if (!resting) {
      this.restTimerStartS.delete(entity.index);
      return;
    }

    const restStartS = this.restTimerStartS.get(entity.index);
    if (restStartS === undefined) {
      this.restTimerStartS.set(entity.index, timeS);
      return;
    }

    if (timeS - restStartS >= pieces.throw.restDurationS) {
      entity.setValue(StickState, 'phase', StickPhase.Settled);
      this.restTimerStartS.delete(entity.index);
      log('debug', 'state', 'stick settled', { entityIndex: entity.index });

      let position: Vec3 = [0, 0, 0];
      const object3D = entity.object3D;
      if (object3D) {
        object3D.getWorldPosition(this.tmpComPos);
        position = [this.tmpComPos.x, this.tmpComPos.y, this.tmpComPos.z];
      }
      gameEvents.emit('Settled', {
        stickId: String(entity.index),
        position,
        timeS,
      });
    }
  }

  private pulseHaptic(hand: Hand | null, pattern: HapticPulse): void {
    if (hand === null) {
      return;
    }
    const gamepad = this.input.xr.gamepads[hand];
    gamepad?.inputSource.gamepad?.hapticActuators?.[0]?.pulse(
      pattern.intensity,
      pattern.durationMs,
    );
  }
}
