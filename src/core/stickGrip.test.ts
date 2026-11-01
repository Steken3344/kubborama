import { describe, expect, it } from 'vitest';
import { fromAxisAngle, rotateVectorByQuaternion } from './quat.js';
import type { Quat } from './quat.js';
import { stickInHand } from './stickGrip.js';
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
    expect(Math.hypot(near[0]!, near[1]! - 1, near[2]!)).toBeCloseTo(0.04);
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
