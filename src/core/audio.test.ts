import { describe, expect, it } from 'vitest';
import { pickVariantIndex, stickImpactTier } from './audio.js';

describe('pickVariantIndex', () => {
  it('picks index 0 when rng returns 0', () => {
    expect(pickVariantIndex(() => 0, 3)).toBe(0);
  });

  it('picks the last index when rng returns just under 1', () => {
    expect(pickVariantIndex(() => 0.999999, 3)).toBe(2);
  });

  it('never returns an out-of-range index across the full rng domain', () => {
    for (let i = 0; i < 1000; i++) {
      const index = pickVariantIndex(() => i / 1000, 5);
      expect(index).toBeGreaterThanOrEqual(0);
      expect(index).toBeLessThan(5);
    }
  });

  it('picks the midpoint variant at rng=0.5 for an odd variant count', () => {
    expect(pickVariantIndex(() => 0.5, 3)).toBe(1);
  });
});

describe('stickImpactTier', () => {
  const softMax = 0.25;
  const lightMax = 0.6;

  it('classifies below softMax as soft', () => {
    expect(stickImpactTier(0, softMax, lightMax)).toBe('soft');
    expect(stickImpactTier(0.24, softMax, lightMax)).toBe('soft');
  });

  it('classifies [softMax, lightMax) as light', () => {
    expect(stickImpactTier(0.25, softMax, lightMax)).toBe('light');
    expect(stickImpactTier(0.59, softMax, lightMax)).toBe('light');
  });

  it('classifies lightMax and above as medium', () => {
    expect(stickImpactTier(0.6, softMax, lightMax)).toBe('medium');
    expect(stickImpactTier(1, softMax, lightMax)).toBe('medium');
  });
});
