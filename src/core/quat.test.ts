import { describe, expect, it } from 'vitest';
import {
  angularVelocityBetween,
  fromAxisAngle,
  quaternionAligningY,
  quaternionFromYaw,
  rotateVectorByQuaternion,
  yawFromQuaternion,
} from './quat.js';
import type { Quat } from './quat.js';

describe('quat', () => {
  it('returns zero angular velocity between identical orientations', () => {
    const identity: [number, number, number, number] = [0, 0, 0, 1];
    const omega = angularVelocityBetween(identity, identity, 1 / 72);
    expect(omega[0]).toBeCloseTo(0);
    expect(omega[1]).toBeCloseTo(0);
    expect(omega[2]).toBeCloseTo(0);
  });

  it('recovers a known angular velocity around a single axis (Z)', () => {
    const identity: [number, number, number, number] = [0, 0, 0, 1];
    const angleRad = Math.PI / 2; // 90 degrees
    const dtS = 0.5;
    const q2 = fromAxisAngle([0, 0, 1], angleRad);
    const omega = angularVelocityBetween(identity, q2, dtS);
    // omega = axis * angle / dt = [0, 0, (PI/2) / 0.5]
    expect(omega[0]).toBeCloseTo(0, 5);
    expect(omega[1]).toBeCloseTo(0, 5);
    expect(omega[2]).toBeCloseTo(angleRad / dtS, 5);
  });

  it('recovers a known angular velocity around a tilted axis (X+Y)', () => {
    const identity: [number, number, number, number] = [0, 0, 0, 1];
    const axis: [number, number, number] = [1 / Math.SQRT2, 1 / Math.SQRT2, 0];
    const angleRad = 0.3;
    const dtS = 1 / 72;
    const q2 = fromAxisAngle(axis, angleRad);
    const omega = angularVelocityBetween(identity, q2, dtS);
    const expectedMagnitude = angleRad / dtS;
    const magnitude = Math.sqrt(
      omega[0] * omega[0] + omega[1] * omega[1] + omega[2] * omega[2],
    );
    expect(magnitude).toBeCloseTo(expectedMagnitude, 3);
    // Direction should be parallel to the rotation axis.
    expect(omega[0] / magnitude).toBeCloseTo(axis[0], 3);
    expect(omega[1] / magnitude).toBeCloseTo(axis[1], 3);
  });

  it('picks the shortest-path rotation (handles the double-cover sign flip)', () => {
    const identity: [number, number, number, number] = [0, 0, 0, 1];
    const q2 = fromAxisAngle([0, 1, 0], 0.05);
    // A negated quaternion represents the SAME rotation.
    const q2Negated: [number, number, number, number] = [
      -q2[0],
      -q2[1],
      -q2[2],
      -q2[3],
    ];
    const dtS = 1 / 72;
    const omegaA = angularVelocityBetween(identity, q2, dtS);
    const omegaB = angularVelocityBetween(identity, q2Negated, dtS);
    expect(omegaB[1]).toBeCloseTo(omegaA[1], 5);
  });
});

const close = (a: readonly number[], b: readonly number[]) => {
  expect(a).toHaveLength(b.length);
  a.forEach((v, i) => expect(v).toBeCloseTo(b[i] ?? NaN, 6));
};

describe('rotateVectorByQuaternion (MP3b)', () => {
  it('identity leaves the vector alone', () => {
    close(rotateVectorByQuaternion([1, 2, 3], [0, 0, 0, 1]), [1, 2, 3]);
  });
  it('90° about +Y takes -Z to -X (turning left)', () => {
    close(
      rotateVectorByQuaternion([0, 0, -1], quaternionFromYaw(Math.PI / 2)),
      [-1, 0, 0],
    );
  });
  it('180° about +X flips Y and Z', () => {
    const q: Quat = [1, 0, 0, 0];
    close(rotateVectorByQuaternion([0, 1, 2], q), [0, -1, -2]);
  });
  it('agrees with fromAxisAngle for an arbitrary rotation', () => {
    const q = fromAxisAngle([0, 0, 1], Math.PI / 2);
    close(rotateVectorByQuaternion([1, 0, 0], q), [0, 1, 0]);
  });
});

describe('quaternionAligningY (MP3b)', () => {
  const cases: [string, [number, number, number]][] = [
    ['+Y', [0, 1, 0]],
    ['-Y', [0, -1, 0]],
    ['+X', [1, 0, 0]],
    ['diagonal', [0.6, 0, 0.8]],
    ['down-forward', [0, -Math.SQRT1_2, -Math.SQRT1_2]],
  ];
  for (const [name, dir] of cases) {
    it(`maps +Y onto ${name}`, () => {
      const q = quaternionAligningY(dir);
      close(rotateVectorByQuaternion([0, 1, 0], q), dir);
      expect(Math.hypot(...q)).toBeCloseTo(1, 6);
    });
  }
});

describe('yawFromQuaternion (MP3b)', () => {
  it('round-trips quaternionFromYaw', () => {
    for (const yaw of [0, 0.3, Math.PI / 2, -1.2, 2.9]) {
      expect(yawFromQuaternion(quaternionFromYaw(yaw))).toBeCloseTo(yaw, 6);
    }
  });
  it('is 0 for facing -Z and ignores pitch', () => {
    const pitch: Quat = [Math.sin(0.15), 0, 0, Math.cos(0.15)];
    expect(yawFromQuaternion(pitch)).toBeCloseTo(0, 6);
  });
});
