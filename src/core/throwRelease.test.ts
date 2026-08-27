import { describe, expect, it } from 'vitest';
import { computeHandVelocity, computeReleaseVelocity } from './throwRelease.js';
import { fromAxisAngle } from './quat.js';
import type { PoseSample } from './throwRelease.js';

const IDENTITY: [number, number, number, number] = [0, 0, 0, 1];

describe('computeHandVelocity', () => {
  it('returns zero for fewer than 2 samples', () => {
    const one: PoseSample[] = [
      { timeS: 0, position: [0, 0, 0], orientation: IDENTITY },
    ];
    expect(computeHandVelocity([])).toEqual({
      linearVelocity: [0, 0, 0],
      angularVelocity: [0, 0, 0],
    });
    expect(computeHandVelocity(one)).toEqual({
      linearVelocity: [0, 0, 0],
      angularVelocity: [0, 0, 0],
    });
  });

  it('recovers constant linear velocity with no rotation', () => {
    const dtS = 1 / 72;
    const speedMps = 4; // moving along +X at 4 m/s
    const samples: PoseSample[] = Array.from({ length: 5 }, (_, i) => ({
      timeS: i * dtS,
      position: [speedMps * i * dtS, 0, 0],
      orientation: IDENTITY,
    }));
    const { linearVelocity, angularVelocity } = computeHandVelocity(samples);
    expect(linearVelocity[0]).toBeCloseTo(speedMps, 4);
    expect(linearVelocity[1]).toBeCloseTo(0, 4);
    expect(linearVelocity[2]).toBeCloseTo(0, 4);
    expect(angularVelocity[0]).toBeCloseTo(0, 4);
    expect(angularVelocity[1]).toBeCloseTo(0, 4);
    expect(angularVelocity[2]).toBeCloseTo(0, 4);
  });

  it('recovers constant angular velocity around one axis', () => {
    const dtS = 1 / 72;
    const angularSpeedRadS = 6; // spinning around Z at 6 rad/s
    const samples: PoseSample[] = Array.from({ length: 5 }, (_, i) => ({
      timeS: i * dtS,
      position: [0, 0, 0],
      orientation: fromAxisAngle([0, 0, 1], angularSpeedRadS * i * dtS),
    }));
    const { angularVelocity } = computeHandVelocity(samples);
    expect(angularVelocity[2]).toBeCloseTo(angularSpeedRadS, 2);
  });

  it('is recency-weighted: an accelerating swing biases toward the latest (fastest) segment', () => {
    const dtS = 1 / 72;
    // Slow for the first 3 samples, then a fast final segment — the
    // classic "wind-up then snap" swing shape.
    const positions: [number, number, number][] = [
      [0, 0, 0],
      [0.1 * dtS, 0, 0],
      [0.2 * dtS, 0, 0],
      [0.3 * dtS, 0, 0],
      [10 * dtS, 0, 0], // big final jump = fast last segment
    ];
    const samples: PoseSample[] = positions.map((position, i) => ({
      timeS: i * dtS,
      position,
      orientation: IDENTITY,
    }));
    const { linearVelocity } = computeHandVelocity(samples);
    const firstX = positions[0];
    const lastX = positions[positions.length - 1];
    if (firstX === undefined || lastX === undefined) {
      throw new Error('unreachable: positions is non-empty');
    }
    const plainAverageSpeed =
      (lastX[0] - firstX[0]) / ((positions.length - 1) * dtS);
    // Recency-weighted result must be closer to the fast final segment's
    // speed (10 m/s) than a plain unweighted average across the window.
    expect(linearVelocity[0]).toBeGreaterThan(plainAverageSpeed);
  });
});

describe('computeReleaseVelocity (lever-arm correction)', () => {
  it('equals hand velocity exactly when there is no spin', () => {
    const result = computeReleaseVelocity(
      { linearVelocity: [3, 1, -2], angularVelocity: [0, 0, 0] },
      [0.1, 0, 0],
    );
    expect(result.linearVelocity).toEqual([3, 1, -2]);
    expect(result.angularVelocity).toEqual([0, 0, 0]);
  });

  it('adds omega x leverArm to the hand velocity', () => {
    // Spinning at 1 rad/s around Z, CoM offset 1m along local +X from
    // the hand: the CoM's extra velocity from rotation is +Y (right-hand
    // rule), independent of any linear hand velocity.
    const result = computeReleaseVelocity(
      { linearVelocity: [0, 0, 0], angularVelocity: [0, 0, 1] },
      [1, 0, 0],
    );
    expect(result.linearVelocity[0]).toBeCloseTo(0);
    expect(result.linearVelocity[1]).toBeCloseTo(1);
    expect(result.linearVelocity[2]).toBeCloseTo(0);
  });

  it('demonstrates the classic VR throwing bug: naive v_hand differs from the corrected v_com under spin', () => {
    const naiveLinearVelocity: [number, number, number] = [5, 0, 0];
    // Flip spin around X (perpendicular to the stick), lever arm along
    // the stick's own length (Z) — exactly the end-over-end throw case
    // this correction exists for.
    const angularVelocity: [number, number, number] = [8, 0, 0];
    const leverArm: [number, number, number] = [0, 0, -0.1]; // CoM 10cm "ahead" of the grip
    const corrected = computeReleaseVelocity(
      { linearVelocity: naiveLinearVelocity, angularVelocity },
      leverArm,
    );
    // The two must differ once there is real spin and a real lever arm —
    // copying raw hand velocity to the CoM is exactly the bug being
    // prevented here.
    expect(corrected.linearVelocity).not.toEqual(naiveLinearVelocity);
  });

  it('passes angularVelocity through unchanged (release spin = hand spin)', () => {
    const result = computeReleaseVelocity(
      { linearVelocity: [0, 0, 0], angularVelocity: [2, -3, 5] },
      [0.05, 0, 0],
    );
    expect(result.angularVelocity).toEqual([2, -3, 5]);
  });
});
