import { describe, expect, it } from 'vitest';
import { addFitSample, armEndToHandM, emptyFitWindow } from './avatarFit.js';
import { solveAvatarPose } from './avatarPose.js';
import type { AvatarDims } from './avatarPose.js';

const dims: AvatarDims = {
  neckM: 0.2,
  torsoHeightM: 0.5,
  torsoWidthM: 0.35,
  torsoDepthM: 0.2,
  shoulderWidthM: 0.4,
  armRadiusM: 0.03,
  headRadiusM: 0.1,
  handSizeM: 0.1,
  yawSmoothingS: 0.2,
};

describe('armEndToHandM', () => {
  it('equals the mitten inset for a normal reach', () => {
    const pose = solveAvatarPose(
      {
        head: { position: [0, 1.7, 0], quaternion: [0, 0, 0, 1] },
        leftHand: { position: [-0.4, 1.0, -0.4], quaternion: [0, 0, 0, 1] },
        rightHand: { position: [0.4, 1.0, -0.4], quaternion: [0, 0, 0, 1] },
        torsoYawRad: 0,
      },
      dims,
    );
    expect(
      armEndToHandM(pose.leftShoulder, pose.leftArm, [-0.4, 1.0, -0.4]),
    ).toBeCloseTo(dims.handSizeM / 2);
  });
});

describe('addFitSample', () => {
  it('tracks maxima and the torso yaw rate (wrapping at ±π)', () => {
    const w = emptyFitWindow();
    addFitSample(w, {
      atMs: 0,
      torsoYawRad: 3.1,
      headPitchRad: 0.2,
      leftArmEndToHandM: 0.05,
      rightArmEndToHandM: 0.04,
    });
    addFitSample(w, {
      atMs: 100,
      torsoYawRad: -3.1,
      headPitchRad: 1.1,
      leftArmEndToHandM: 0.03,
      rightArmEndToHandM: 0.06,
    });
    expect(w.startMs).toBe(0);
    expect(w.maxHeadPitchRad).toBeCloseTo(1.1);
    expect(w.maxLeftArmEndToHandM).toBeCloseTo(0.05);
    expect(w.maxRightArmEndToHandM).toBeCloseTo(0.06);
    // 3.1 → -3.1 is a 0.083 rad step the short way, over 0.1 s.
    expect(w.maxTorsoYawRateRadS).toBeCloseTo((2 * Math.PI - 6.2) / 0.1, 3);
  });
});
