import { describe, expect, it } from 'vitest';
import {
  courtLayout,
  defaultCourtPreset,
  getGameMode,
  kingMassKg,
  kubbMassKg,
  stickMassKg,
  windVectorForMode,
} from './config.js';

describe('piece masses (birch default, matches docs/PLAN.md §2)', () => {
  it('computes the documented stick mass (~0.29 kg)', () => {
    expect(stickMassKg()).toBeCloseTo(0.29, 2);
  });

  it('computes the documented kubb mass (~0.47 kg)', () => {
    expect(kubbMassKg()).toBeCloseTo(0.47, 2);
  });

  it('computes the documented king mass (~1.45 kg, crown cuts included)', () => {
    expect(kingMassKg()).toBeCloseTo(1.45, 1);
  });

  it('scales masses with the pine/rubberwood material presets', () => {
    expect(stickMassKg('pine')).toBeLessThan(stickMassKg('birch'));
    expect(stickMassKg('rubberwood')).toBeGreaterThan(stickMassKg('birch'));
  });
});

describe('courtLayout (default backyard preset)', () => {
  it('matches the backyard preset dimensions (6x3 m)', () => {
    const layout = courtLayout(defaultCourtPreset);
    expect(layout.kingPosition[2]).toBeCloseTo(-3);
    for (const [, , z] of layout.kubbPositions.slice(0, 5)) {
      expect(z).toBeCloseTo(-6);
    }
    for (const [, , z] of layout.kubbPositions.slice(5)) {
      expect(z).toBeLessThan(0);
    }
  });
});

describe('game modes (docs/sessions/M4.md)', () => {
  it('simple mode has no wind and the documented topple angle', () => {
    expect(getGameMode('simple').toppleAngleDeg).toBe(50);
    expect(windVectorForMode('simple')).toEqual([0, 0, 0]);
  });

  it('advanced mode has 1.5 m/s lateral wind and a steeper topple angle', () => {
    expect(getGameMode('advanced').toppleAngleDeg).toBe(60);
    expect(windVectorForMode('advanced')).toEqual([1.5, 0, 0]);
  });
});
