import type { Pose } from './presence.js';
import { quaternionAligningY, quaternionFromYaw } from './quat.js';
import type { Quat } from './quat.js';
import type { Vec3 } from './vec3.js';

/** All in metres / seconds; loaded from src/data/avatar.json via
 * src/config.ts — starting values to tune in the headset, never
 * literals in code. */
export interface AvatarDims {
  neckM: number;
  torsoHeightM: number;
  torsoWidthM: number;
  torsoDepthM: number;
  shoulderWidthM: number;
  armRadiusM: number;
  headRadiusM: number;
  handSizeM: number;
  /** Time constant for smoothing the torso yaw toward the head yaw —
   * applied by the system, not here (see solveAvatarPose's doc). */
  yawSmoothingS: number;
}

/** A straight limb: centre, orientation (+Y along the limb) and length,
 * so a unit-length capsule can be posed with position/quaternion/scale.y. */
export interface Segment {
  position: Vec3;
  quaternion: Quat;
  lengthM: number;
}

export interface AvatarPose {
  torso: Pose;
  leftShoulder: Vec3;
  rightShoulder: Vec3;
  leftArm: Segment;
  rightArm: Segment;
}

export interface AvatarPoseInput {
  head: Pose;
  leftHand: Pose;
  rightHand: Pose;
  /** Smoothed torso yaw — derived from the head by yawFromQuaternion()
   * and low-pass filtered in the system, so bodies turn slower than
   * heads. Kept as an input so this function stays stateless. */
  torsoYawRad: number;
}

/**
 * MP3b (Erik, 2026-09-05): a procedural body from ONLY what is tracked —
 * head and two hands. The torso hangs straight below the head (world
 * -Y, not along the head's tilt: nodding must not move the body), the
 * shoulders sit at neck height either side of it along the torso's
 * right axis, and each arm is one straight segment from shoulder to
 * hand — no elbow IK ("spaghetti arms" are the standard for VR avatars
 * without arm tracking and read better than guessed elbows), no legs.
 * See docs/superpowers/specs/2026-09-05-avatars-design.md.
 */
export function solveAvatarPose(
  input: AvatarPoseInput,
  dims: AvatarDims,
): AvatarPose {
  const [hx, hy, hz] = input.head.position;
  const neckY = hy - dims.neckM;
  const torsoQuaternion = quaternionFromYaw(input.torsoYawRad);
  const torso: Pose = {
    position: [hx, neckY - dims.torsoHeightM / 2, hz],
    quaternion: torsoQuaternion,
  };
  // Right axis of a body facing -Z rotated by yaw about +Y.
  const rightX = Math.cos(input.torsoYawRad);
  const rightZ = -Math.sin(input.torsoYawRad);
  const half = dims.shoulderWidthM / 2;
  const rightShoulder: Vec3 = [hx + rightX * half, neckY, hz + rightZ * half];
  const leftShoulder: Vec3 = [hx - rightX * half, neckY, hz - rightZ * half];
  return {
    torso,
    leftShoulder,
    rightShoulder,
    leftArm: segment(leftShoulder, input.leftHand.position, dims.armRadiusM),
    rightArm: segment(rightShoulder, input.rightHand.position, dims.armRadiusM),
  };
}

function segment(from: Vec3, to: Vec3, minLengthM: number): Segment {
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  const dz = to[2] - from[2];
  const distance = Math.hypot(dx, dy, dz);
  // A hand exactly at the shoulder (tracking glitch, arm folded) must not
  // collapse the capsule to a point or feed a zero vector to the aligner.
  const lengthM = Math.max(distance, minLengthM);
  const quaternion =
    distance === 0 ? ([0, 0, 0, 1] as Quat) : quaternionAligningY([dx, dy, dz]);
  return {
    position: [
      (from[0] + to[0]) / 2,
      (from[1] + to[1]) / 2,
      (from[2] + to[2]) / 2,
    ],
    quaternion,
    lengthM,
  };
}
