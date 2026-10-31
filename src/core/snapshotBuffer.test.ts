import { describe, expect, it } from 'vitest';
import type { PieceTransform } from './pieceSync.js';
import { fromAxisAngle, slerpInto } from './quat.js';
import type { Quat } from './quat.js';
import { InterpolationClock, SnapshotBuffer } from './snapshotBuffer.js';
import type { Vec3 } from './vec3.js';

const ID: Quat = [0, 0, 0, 1];
const piece = (
  x: number,
  quaternion: Quat = ID,
  id = 'stick-0',
): PieceTransform => ({ id, position: [x, 1, 0], quaternion });
const out = () => ({
  position: [0, 0, 0] as Vec3,
  quaternion: [0, 0, 0, 1] as Quat,
});

describe('slerpInto', () => {
  it('is halfway at t=0.5 (90° → 45° about y)', () => {
    const q: Quat = [0, 0, 0, 1];
    slerpInto(ID, fromAxisAngle([0, 1, 0], Math.PI / 2), 0.5, q);
    const expected = fromAxisAngle([0, 1, 0], Math.PI / 4);
    q.forEach((v, i) => expect(v).toBeCloseTo(expected[i] ?? NaN, 6));
  });

  it('takes the short way round (b given as its negative)', () => {
    const b = fromAxisAngle([0, 1, 0], Math.PI / 2).map((v) => -v) as Quat;
    const q: Quat = [0, 0, 0, 1];
    slerpInto(ID, b, 0.5, q);
    const expected = fromAxisAngle([0, 1, 0], Math.PI / 4);
    // Same rotation, either sign.
    const dot = q.reduce((s, v, i) => s + v * (expected[i] ?? 0), 0);
    expect(Math.abs(dot)).toBeCloseTo(1, 6);
  });
});

describe('SnapshotBuffer', () => {
  it('interpolates position and rotation between the bracketing snapshots', () => {
    const buffer = new SnapshotBuffer();
    buffer.push(0, [piece(0)]);
    buffer.push(3, [piece(0.9, fromAxisAngle([1, 0, 0], 1))]); // 18 m/s
    const o = out();
    expect(buffer.sample('stick-0', 1.5, o)).toBe(true);
    expect(o.position[0]).toBeCloseTo(0.45);
    const half = fromAxisAngle([1, 0, 0], 0.5);
    o.quaternion.forEach((v, i) => expect(v).toBeCloseTo(half[i] ?? NaN, 6));
  });

  it('holds the newest pose past the newest snapshot (no extrapolation)', () => {
    const buffer = new SnapshotBuffer();
    buffer.push(0, [piece(0)]);
    buffer.push(3, [piece(1)]);
    const o = out();
    buffer.sample('stick-0', 10, o);
    expect(o.position[0]).toBe(1);
  });

  it('holds the oldest pose before the oldest snapshot', () => {
    const buffer = new SnapshotBuffer();
    buffer.push(6, [piece(6)]);
    buffer.push(9, [piece(9)]);
    const o = out();
    buffer.sample('stick-0', 2, o);
    expect(o.position[0]).toBe(6);
  });

  it('jumps instead of sweeping across a teleport', () => {
    const buffer = new SnapshotBuffer();
    buffer.push(0, [piece(0)]);
    buffer.push(3, [piece(8)]); // back to the rack
    const o = out();
    buffer.sample('stick-0', 1, o);
    expect(o.position[0]).toBe(8);
  });

  it('ignores an old or repeated tick and keeps a bounded history', () => {
    const buffer = new SnapshotBuffer(3);
    for (const t of [0, 3, 6, 9]) buffer.push(t, [piece(t)]);
    buffer.push(6, [piece(100)]);
    expect(buffer.latestTick()).toBe(9);
    const o = out();
    buffer.sample('stick-0', 0, o); // tick 0 was dropped: oldest is 3
    expect(o.position[0]).toBe(3);
  });

  it('reports an unknown piece', () => {
    const buffer = new SnapshotBuffer();
    buffer.push(0, [piece(0)]);
    expect(buffer.sample('king', 0, out())).toBe(false);
  });

  it('a reset forgets everything', () => {
    const buffer = new SnapshotBuffer();
    buffer.push(30, [piece(0)]);
    buffer.reset();
    expect(buffer.latestTick()).toBeNull();
    buffer.push(3, [piece(1)]); // a restarted server counts from 0 again
    expect(buffer.latestTick()).toBe(3);
  });
});

describe('InterpolationClock', () => {
  it('starts delayTicks behind the newest snapshot', () => {
    const clock = new InterpolationClock();
    expect(clock.advance(1 / 72, 30, 60, 6)).toBe(24);
  });

  it('runs at the tick rate when snapshots keep pace', () => {
    const clock = new InterpolationClock();
    clock.advance(0, 30, 60, 6);
    expect(clock.advance(0.05, 33, 60, 6)).toBeCloseTo(27, 5);
  });

  it('drifts smoothly toward the target, snaps after a big gap', () => {
    const clock = new InterpolationClock();
    clock.advance(0, 30, 60, 6); // 24
    // 1/60 s later: advanced 25, target 26 — corrected part of the way.
    const t = clock.advance(1 / 60, 32, 60, 6);
    expect(t).toBeGreaterThan(25);
    expect(t).toBeLessThan(26);
    expect(clock.advance(0, 300, 60, 6)).toBe(294);
  });
});
