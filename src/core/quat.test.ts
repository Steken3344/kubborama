import { describe, expect, it } from 'vitest';
import { angularVelocityBetween, fromAxisAngle } from './quat.js';

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
