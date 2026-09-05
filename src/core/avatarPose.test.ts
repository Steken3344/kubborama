import { describe, expect, it } from 'vitest';
import { solveAvatarPose } from './avatarPose.js';
import type { AvatarDims } from './avatarPose.js';
import type { Pose } from './presence.js';
import { quaternionFromYaw, rotateVectorByQuaternion } from './quat.js';

const DIMS: AvatarDims = {
  neckM: 0.12,
  torsoHeightM: 0.45,
  torsoWidthM: 0.36,
  torsoDepthM: 0.18,
  shoulderWidthM: 0.4,
  armRadiusM: 0.04,
  headRadiusM: 0.11,
  handSizeM: 0.09,
  yawSmoothingS: 0.25,
};

const pose = (
  position: [number, number, number],
  quaternion: [number, number, number, number] = [0, 0, 0, 1],
): Pose => ({ position, quaternion });

const close = (a: readonly number[], b: readonly number[]) => {
  expect(a).toHaveLength(b.length);
  a.forEach((v, i) => expect(v).toBeCloseTo(b[i] ?? NaN, 6));
};

describe('solveAvatarPose', () => {
  const head = pose([0.5, 1.6, -0.2]);
  const left = pose([0.2, 1.1, -0.5]);
  const right = pose([0.9, 1.0, -0.4]);

  it('puts the torso straight below the head, regardless of head tilt', () => {
    const tilted = pose(head.position, [Math.sin(0.4), 0, 0, Math.cos(0.4)]);
    const a = solveAvatarPose(
      { head, leftHand: left, rightHand: right, torsoYawRad: 0 },
      DIMS,
    );
    const b = solveAvatarPose(
      { head: tilted, leftHand: left, rightHand: right, torsoYawRad: 0 },
      DIMS,
    );
    close(a.torso.position, [0.5, 1.6 - 0.12 - 0.225, -0.2]);
    close(b.torso.position, a.torso.position);
    close(a.torso.quaternion, [0, 0, 0, 1]);
  });

  it('places shoulders symmetrically at neck height along the torso right axis', () => {
    const r = solveAvatarPose(
      { head, leftHand: left, rightHand: right, torsoYawRad: 0 },
      DIMS,
    );
    // Facing -Z: right axis is +X, so the RIGHT shoulder is at +X.
    close(r.rightShoulder, [0.7, 1.48, -0.2]);
    close(r.leftShoulder, [0.3, 1.48, -0.2]);
  });

  it('mirrors the shoulders when the torso faces the other way', () => {
    const r = solveAvatarPose(
      { head, leftHand: left, rightHand: right, torsoYawRad: Math.PI },
      DIMS,
    );
    close(r.rightShoulder, [0.3, 1.48, -0.2]);
    close(r.leftShoulder, [0.7, 1.48, -0.2]);
    close(r.torso.quaternion, quaternionFromYaw(Math.PI));
  });

  it('makes each arm a straight segment from shoulder toward the hand, stopping at its surface', () => {
    const r = solveAvatarPose(
      { head, leftHand: left, rightHand: right, torsoYawRad: 0 },
      DIMS,
    );
    const [sx, sy, sz] = r.rightShoulder;
    const [hx, hy, hz] = right.position;
    const distance = Math.hypot(hx - sx, hy - sy, hz - sz);
    const inset = DIMS.handSizeM / 2;
    expect(r.rightArm.lengthM).toBeCloseTo(distance - inset, 6);
    // Centre sits half a (shortened) length along the shoulder→hand line.
    const u = [
      (hx - sx) / distance,
      (hy - sy) / distance,
      (hz - sz) / distance,
    ];
    const half = r.rightArm.lengthM / 2;
    close(r.rightArm.position, [
      sx + (u[0] ?? 0) * half,
      sy + (u[1] ?? 0) * half,
      sz + (u[2] ?? 0) * half,
    ]);
    // The segment's +Y axis points from shoulder to hand.
    close(rotateVectorByQuaternion([0, 1, 0], r.rightArm.quaternion), u);
  });

  it('never produces a zero-length arm', () => {
    const r = solveAvatarPose(
      {
        head,
        leftHand: pose([0.3, 1.48, -0.2]), // exactly at the left shoulder
        rightHand: right,
        torsoYawRad: 0,
      },
      DIMS,
    );
    expect(r.leftArm.lengthM).toBeGreaterThanOrEqual(DIMS.armRadiusM);
    expect(Number.isFinite(r.leftArm.quaternion[3])).toBe(true);
  });
});
