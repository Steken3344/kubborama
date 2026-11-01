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

describe('sampleAhead (own throw, 2026-11-01)', () => {
  const opts = {
    maxAheadTicks: 9,
    gravityMps2: 9.81,
    tickHz: 60,
    groundY: 0.05,
  };
  const at = (z: number, y = 1): PieceTransform => ({
    id: 'stick-0',
    position: [0, y, z],
    quaternion: [0, 0, 0, 1],
  });

  it('samples normally inside the history', () => {
    const b = new SnapshotBuffer();
    b.push(3, [at(0)]);
    b.push(6, [at(-0.3)]);
    const out = {
      position: [0, 0, 0] as Vec3,
      quaternion: [0, 0, 0, 1] as Quat,
    };
    expect(b.sampleAhead('stick-0', 4.5, out, opts)).toBe(true);
    expect(out.position[2]).toBeCloseTo(-0.15);
  });

  it('extrapolates past the newest snapshot, with gravity while airborne', () => {
    const b = new SnapshotBuffer();
    b.push(3, [at(0)]);
    b.push(6, [at(-0.3)]);
    const out = {
      position: [0, 0, 0] as Vec3,
      quaternion: [0, 0, 0, 1] as Quat,
    };
    b.sampleAhead('stick-0', 12, out, opts);
    expect(out.position[2]).toBeCloseTo(-0.9); // 0.1 m per tick, 6 ticks on
    expect(out.position[1]).toBeLessThan(1);
  });

  it('looks only a little ahead at the ground, never below it', () => {
    const b = new SnapshotBuffer();
    b.push(3, [at(0, 0.06)]);
    b.push(6, [at(-0.3, 0.06)]);
    const out = {
      position: [0, 0, 0] as Vec3,
      quaternion: [0, 0, 0, 1] as Quat,
    };
    b.sampleAhead('stick-0', 100, out, opts);
    expect(out.position[2]).toBeCloseTo(-0.6); // at the ground: 3 ticks
    expect(out.position[1]).toBeGreaterThanOrEqual(0.05);
  });
});

describe('sampleAhead at touchdown', () => {
  it('a stick coming down is not extrapolated through the ground', () => {
    const b = new SnapshotBuffer();
    const pose = (y: number, z: number): PieceTransform => ({
      id: 's',
      position: [0, y, z],
      quaternion: [0, 0, 0, 1],
    });
    b.push(3, [pose(0.5, -5)]);
    b.push(6, [pose(0.03, -5.3)]);
    const out = {
      position: [0, 0, 0] as Vec3,
      quaternion: [0, 0, 0, 1] as Quat,
    };
    b.sampleAhead('s', 12, out, {
      maxAheadTicks: 9,
      gravityMps2: 9.81,
      tickHz: 60,
      groundY: 0.05,
    });
    expect(out.position[1]).toBeCloseTo(0.03);
  });
});

describe('sampleAhead in the air', () => {
  it('never runs further ahead than maxAheadTicks', () => {
    const b = new SnapshotBuffer();
    const pose = (z: number): PieceTransform => ({
      id: 's',
      position: [0, 2, z],
      quaternion: [0, 0, 0, 1],
    });
    b.push(3, [pose(0)]);
    b.push(6, [pose(-0.3)]);
    const out = {
      position: [0, 0, 0] as Vec3,
      quaternion: [0, 0, 0, 1] as Quat,
    };
    b.sampleAhead('s', 100, out, {
      maxAheadTicks: 9,
      gravityMps2: 9.81,
      tickHz: 60,
      groundY: 0.05,
    });
    expect(out.position[2]).toBeCloseTo(-1.2);
  });
});

describe('sampleAhead review fixes (2026-11-01)', () => {
  const opts = {
    maxAheadTicks: 12,
    gravityMps2: 9.81,
    tickHz: 60,
    groundY: 0.06,
  };
  const pose = (
    y: number,
    z: number,
    q: Quat = [0, 0, 0, 1],
  ): PieceTransform => ({
    id: 'k',
    position: [0, y, z],
    quaternion: q,
  });
  const out = () => ({
    position: [0, 0, 0] as Vec3,
    quaternion: [0, 0, 0, 1] as Quat,
  });

  it('a piece standing still above the ground stays exactly where it is', () => {
    const b = new SnapshotBuffer();
    b.push(3, [pose(0.075, -4)]);
    b.push(6, [pose(0.075, -4)]);
    const o = out();
    b.sampleAhead('k', 15, o, opts);
    expect(o.position).toEqual([0, 0.075, -4]);
  });

  it('near the ground the look-ahead keeps creeping instead of freezing', () => {
    const b = new SnapshotBuffer();
    b.push(3, [pose(0.03, -3)]);
    b.push(6, [pose(0.03, -3.3)]);
    const z = (tick: number) => {
      const o = out();
      b.sampleAhead('k', tick, o, opts);
      return o.position[2];
    };
    expect(z(9)).toBeLessThan(z(8));
    expect(z(12)).toBeLessThan(z(9));
    expect(z(40)).toBeGreaterThan(-3.3 - 0.1 * 3 - 1e-9); // saturates at 3 ticks
  });
});
