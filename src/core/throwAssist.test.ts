import { describe, expect, it } from 'vitest';
import { fromAxisAngle, multiply, rotateVectorByQuaternion } from './quat.js';
import { assistRelease } from './throwAssist.js';
import type { Vec3 } from './vec3.js';

const FULL = { spinAssist: 1, alignAssist: 1 };
const OFF = { spinAssist: 0, alignAssist: 0 };
// A host throw towards −z; the end-over-end axis is ±x.
const v: Vec3 = [0, 3, -6];
const stickForward = fromAxisAngle([1, 0, 0], -Math.PI / 2 + 0.4); // +Y → mostly −z, tilted up

describe('assistRelease: the swing decides (Erik, 2026-11-01)', () => {
  it('keeps the end-over-end spin of the swing untouched', () => {
    const r = assistRelease(v, [-12, 0, 0], stickForward, FULL);
    expect(r.angularVelocity[0]).toBeCloseTo(-12);
    expect(r.angularVelocity[1]).toBeCloseTo(0);
    expect(r.angularVelocity[2]).toBeCloseTo(0);
  });

  it('removes the helicopter (vertical) and roll parts of a wrist twist', () => {
    const r = assistRelease(v, [-12, -4, 3], stickForward, FULL);
    expect(r.angularVelocity[0]).toBeCloseTo(-12);
    expect(r.angularVelocity[1]).toBeCloseTo(0);
    expect(r.angularVelocity[2]).toBeCloseTo(0);
  });

  it('the same swing with a yawed wrist: same spin, stick back in the throwing plane', () => {
    const yawedQ = multiply(fromAxisAngle([0, 1, 0], 0.6), stickForward);
    const a = assistRelease(v, [-12, -4, 3], stickForward, FULL);
    const b = assistRelease(v, [-12, 5, -2], yawedQ, FULL);
    for (let i = 0; i < 3; i++) {
      expect(b.angularVelocity[i]).toBeCloseTo(a.angularVelocity[i] ?? 0, 5);
    }
    const axis = rotateVectorByQuaternion([0, 1, 0], b.quaternion);
    expect(axis[0]).toBeCloseTo(0, 5); // no sideways yaw left
    expect(axis[2]).toBeLessThan(0); // still pointing down the court
  });

  it('keeps the stick tilt in the throwing plane', () => {
    const r = assistRelease(v, [-12, 0, 0], stickForward, FULL);
    const before = rotateVectorByQuaternion([0, 1, 0], stickForward);
    const after = rotateVectorByQuaternion([0, 1, 0], r.quaternion);
    for (let i = 0; i < 3; i++) expect(after[i]).toBeCloseTo(before[i] ?? 0, 5);
  });

  it('with the assist off the release is untouched', () => {
    const w: Vec3 = [-12, -4, 3];
    const r = assistRelease(v, w, stickForward, OFF);
    expect(r.angularVelocity).toEqual(w);
    for (let i = 0; i < 4; i++) {
      expect(r.quaternion[i]).toBeCloseTo(stickForward[i] ?? 0, 6);
    }
  });

  it('works for the guest throwing towards +z too', () => {
    const r = assistRelease(
      [0.5, 3, 6],
      [12, 6, 1],
      fromAxisAngle([1, 0, 0], Math.PI / 2),
      FULL,
    );
    // lateral axis ⟂ to the horizontal throw direction, horizontal
    expect(r.angularVelocity[1]).toBeCloseTo(0);
    const [wx, , wz] = r.angularVelocity;
    expect(wx * 0.5 + wz * 6).toBeCloseTo(0);
  });
});
