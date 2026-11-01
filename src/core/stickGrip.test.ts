import { describe, expect, it } from 'vitest';
import { fromAxisAngle, rotateVectorByQuaternion } from './quat.js';
import type { Quat } from './quat.js';
import { flipStickEnds, stickEndsAgree, stickInHand } from './stickGrip.js';
import type { Vec3 } from './vec3.js';

const opts = { lengthM: 0.3, holdFromEndM: 0.04, pitchDownDeg: 20 };
const out = () => ({
  position: [0, 0, 0] as Vec3,
  quaternion: [0, 0, 0, 1] as Quat,
});

describe('stickInHand', () => {
  it('puts one end in the fist and the shaft forward, tilted down', () => {
    const o = out();
    stickInHand([0, 1, 0], [0, 0, 0, 1], opts, o);
    const axis = rotateVectorByQuaternion([0, 1, 0], o.quaternion);
    const pitch = (20 * Math.PI) / 180;
    expect(axis[1]).toBeCloseTo(-Math.sin(pitch));
    expect(axis[2]).toBeCloseTo(-Math.cos(pitch));
    // The near end (centre − axis·L/2) sits 4 cm behind the grip point.
    const near = [0, 1, 2].map(
      (i) => (o.position[i] ?? 0) - (axis[i] ?? 0) * 0.15,
    );
    const [nx = 0, ny = 0, nz = 0] = near;
    expect(Math.hypot(nx, ny - 1, nz)).toBeCloseTo(0.04);
  });

  it('turns with the hand', () => {
    const turn = fromAxisAngle([0, 1, 0], Math.PI / 2); // facing −X
    const o = out();
    stickInHand([0, 1, 0], turn, opts, o);
    const axis = rotateVectorByQuaternion([0, 1, 0], o.quaternion);
    expect(axis[0]).toBeLessThan(-0.9);
    expect(o.position[0]).toBeLessThan(0);
  });

  it('gives a unit quaternion', () => {
    const o = out();
    stickInHand([0, 0, 0], fromAxisAngle([1, 0.3, 0.2], 1.1), opts, o);
    expect(Math.hypot(...o.quaternion)).toBeCloseTo(1);
  });
});

describe('either end in the hand (Erik, 2026-11-01: the stick turned half a turn when picked up from one side of the table)', () => {
  const up = (q: Quat) => rotateVectorByQuaternion([0, 1, 0], q);

  it('flipStickEnds keeps the shaft on its line but swaps the ends', () => {
    const q = fromAxisAngle([0.6, 0.0, 0.8], 0.8);
    const f: Quat = [0, 0, 0, 1];
    flipStickEnds(q, f);
    const [ax, ay, az] = up(q);
    const [bx, by, bz] = up(f);
    expect(bx).toBeCloseTo(-ax);
    expect(by).toBeCloseTo(-ay);
    expect(bz).toBeCloseTo(-az);
    expect(Math.hypot(...f)).toBeCloseTo(1);
  });

  it('stickEndsAgree: the same end leads when the long axes point the same way', () => {
    const lyingTowardField = fromAxisAngle([1, 0, 0], -Math.PI / 2); // +Y → −Z
    const inHandForward = fromAxisAngle([1, 0, 0], -Math.PI / 2 + 0.3);
    const lyingTowardPlayer = fromAxisAngle([1, 0, 0], Math.PI / 2); // +Y → +Z
    expect(stickEndsAgree(lyingTowardField, inHandForward)).toBe(true);
    expect(stickEndsAgree(lyingTowardPlayer, inHandForward)).toBe(false);
  });
});
