import { describe, expect, it } from 'vitest';
import { GRAVITY_MPS2 } from './aim.js';
import { aimTargetIds, assistAim } from './aimAssist.js';
import { initialMatchState } from './match.js';
import type { Vec3 } from './vec3.js';

const opts = { strength: 0.5, radiusM: 1.5, aimHeightM: 0.15 };
const from: Vec3 = [0, 1, -0.3];

/** Where a release comes down to 0.15 m (the later root). */
function landing(v: Vec3): [number, number] {
  const g = GRAVITY_MPS2;
  const t = (v[1] + Math.sqrt(v[1] * v[1] + 2 * g * (from[1] - 0.15))) / g;
  return [from[0] + v[0] * t, from[2] + v[2] * t];
}

describe('assistAim (Erik, 2026-11-01: "lite lättare att träffa")', () => {
  it('moves the landing half way to a kubb it nearly hit', () => {
    const v: Vec3 = [0, 3, -5];
    const [lx, lz] = landing(v);
    const kubb: Vec3 = [lx + 0.6, 0.15, lz - 0.8];
    const [ax, az] = landing(assistAim(from, v, [kubb], opts));
    expect(ax).toBeCloseTo(lx + 0.3, 5);
    expect(az).toBeCloseTo(lz - 0.4, 5);
  });

  it('keeps the arc: same vertical speed', () => {
    const v: Vec3 = [0, 3, -5];
    const [lx, lz] = landing(v);
    expect(assistAim(from, v, [[lx + 1, 0.15, lz]], opts)[1]).toBe(3);
  });

  it('leaves a throw nowhere near a target alone', () => {
    const v: Vec3 = [0, 3, -5];
    const [lx, lz] = landing(v);
    expect(assistAim(from, v, [[lx + 3, 0.15, lz]], opts)).toEqual(v);
  });

  it('pulls towards the nearest of several', () => {
    const v: Vec3 = [0, 3, -5];
    const [lx, lz] = landing(v);
    const near: Vec3 = [lx + 0.4, 0.15, lz];
    const far: Vec3 = [lx - 1.2, 0.15, lz];
    const [ax] = landing(assistAim(from, v, [far, near], opts));
    expect(ax).toBeCloseTo(lx + 0.2, 5);
  });

  it('off does nothing', () => {
    const v: Vec3 = [0.3, 3, -5];
    expect(
      assistAim(from, v, [[0, 0.15, -5]], { ...opts, strength: 0 }),
    ).toEqual(v);
  });
});

describe('aimTargetIds', () => {
  it("aims at the other half's baseline kubbs at the start", () => {
    const s = initialMatchState();
    expect(aimTargetIds(s, 'host')).toEqual(s.baselineKubbs.guest);
    expect(aimTargetIds(s, 'guest')).toEqual(s.baselineKubbs.host);
  });

  it('field kubbs first, never the baseline then (rule 5)', () => {
    const s = {
      ...initialMatchState(),
      fieldKubbs: [
        { kubbId: 'kubb-5', half: 'guest' as const, x: 0, z: -4 },
        { kubbId: 'kubb-6', half: 'host' as const, x: 0, z: -1 },
      ],
    };
    expect(aimTargetIds(s, 'host')).toEqual(['kubb-5']);
  });

  it('the king only once the half is cleared — never an early king', () => {
    const s = {
      ...initialMatchState(),
      baselineKubbs: { host: ['kubb-5'], guest: [] },
    };
    expect(aimTargetIds(s, 'host')).toEqual(['king']);
    expect(aimTargetIds(initialMatchState(), 'host')).not.toContain('king');
  });
});
