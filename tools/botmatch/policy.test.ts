import { describe, expect, it } from 'vitest';
import { courtHalves } from '../../src/core/inkast.js';
import { initialMatchState } from '../../src/core/match.js';
import type { Vec3 } from '../../src/core/vec3.js';
import {
  chooseTarget,
  isFreshMatch,
  jitter,
  planInkast,
  planStick,
  releasePoint,
} from './policy.js';
import { createRng } from '../../src/core/rng.js';
import type { PolicyView } from './policy.js';

const halves = courtHalves({ widthM: 5, lengthM: 8 });
const start = initialMatchState();
const positions = new Map<string, Vec3>([
  ...start.baselineKubbs.guest.map((id, i): [string, Vec3] => [
    id,
    [-2 + i, 0.15, -8],
  ]),
  ...start.baselineKubbs.host.map((id, i): [string, Vec3] => [
    id,
    [-2 + i, 0.15, 0],
  ]),
  ['king', [0, 0.15, -4]],
]);
const view = (over: Partial<PolicyView> = {}): PolicyView => ({
  state: initialMatchState(),
  halves,
  positions,
  racked: ['stick-0', 'stick-1'],
  ...over,
});

describe('policy', () => {
  it("hits the opponent's baseline kubbs when no field kubb stands", () => {
    expect(chooseTarget(view(), 'hit')[2]).toBeCloseTo(-8, 5);
  });

  it('hits a field kubb in the opponent half before the baseline', () => {
    const state = {
      ...initialMatchState(),
      fieldKubbs: [{ kubbId: 'kubb-x', half: 'guest' as const, x: 1, z: -6 }],
    };
    const withField = new Map(positions);
    withField.set('kubb-x', [1, 0.15, -6]);
    expect(chooseTarget(view({ state, positions: withField }), 'hit')).toEqual([
      1, 0.15, -6,
    ]);
  });

  it('misses beside the court', () => {
    expect(Math.abs(chooseTarget(view(), 'miss')[0])).toBeGreaterThan(
      halves.halfWidthM + 1,
    );
  });

  it('aims at the king when asked', () => {
    expect(chooseTarget(view(), 'king')).toEqual([0, 0.15, -4]);
  });

  it('the host releases behind its line (+z), or past it for a foot fault', () => {
    const z = releasePoint(view(), 'hit', 0)[2];
    expect(z).toBeGreaterThan(halves.nearBaselineZ);
    expect(z).toBeLessThan(halves.nearBaselineZ + 0.9);
    expect(releasePoint(view(), 'footFault', 0)[2]).toBeLessThan(-0.9);
  });

  it('the guest releases behind its own far line (−z)', () => {
    const state = { ...initialMatchState(), currentTurn: 'guest' as const };
    const z = releasePoint(view({ state }), 'hit', 0)[2];
    expect(z).toBeLessThan(halves.farBaselineZ);
    expect(z).toBeGreaterThan(halves.farBaselineZ - 0.9);
  });

  it('plans the next racked stick, none when the rack is empty', () => {
    expect(planStick(view(), 'hit')?.pieceId).toBe('stick-0');
    expect(planStick(view({ racked: [] }), 'hit')).toBeNull();
  });

  it('tosses inkast into the half, or outside it', () => {
    const state = {
      ...initialMatchState(),
      currentTurn: 'guest' as const,
      phase: 'inkast' as const,
      inkastQueue: [{ kubbId: 'kubb-1', attempt: 1 as const }],
    };
    const legal = planInkast(view({ state }), true);
    const out = planInkast(view({ state }), false);
    expect(legal?.pieceId).toBe('kubb-1');
    // The guest tosses into the HOST half: z between centre and near.
    expect(legal?.target[2]).toBeGreaterThan(halves.centreZ);
    expect(legal?.target[2]).toBeLessThan(halves.nearBaselineZ);
    expect(Math.abs(out?.target[0] ?? 0)).toBeGreaterThan(halves.halfWidthM);
  });

  it('spreads the aim within the given radius, the same way for a seed', () => {
    const target: Vec3 = [0, 0.15, -8];
    const a = createRng(7);
    const b = createRng(7);
    let moved = 0;
    for (let i = 0; i < 50; i += 1) {
      const p = jitter(target, a, 0.3);
      expect(p).toEqual(jitter(target, b, 0.3));
      expect(
        Math.hypot(p[0] - target[0], p[2] - target[2]),
      ).toBeLessThanOrEqual(0.3 + 1e-9);
      expect(p[1]).toBe(target[1]);
      moved += Math.hypot(p[0], p[2] + 8) > 0.05 ? 1 : 0;
    }
    expect(moved).toBeGreaterThan(40);
  });

  it('knows a fresh match from one in play', () => {
    expect(isFreshMatch(initialMatchState())).toBe(true);
    expect(isFreshMatch(null)).toBe(false);
    expect(isFreshMatch({ ...initialMatchState(), currentTurn: 'guest' })).toBe(
      false,
    );
    expect(
      isFreshMatch({ ...initialMatchState(), felledThisTurn: ['kubb-0'] }),
    ).toBe(false);
  });
});
