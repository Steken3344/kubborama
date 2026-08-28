import { describe, expect, it } from 'vitest';
import { lerp, normalizedClamped } from './mathUtils.js';

describe('normalizedClamped', () => {
  it('maps 0..maxValue to 0..1', () => {
    expect(normalizedClamped(0, 10)).toBeCloseTo(0, 5);
    expect(normalizedClamped(5, 10)).toBeCloseTo(0.5, 5);
    expect(normalizedClamped(10, 10)).toBeCloseTo(1, 5);
  });

  it('clamps above maxValue to 1', () => {
    expect(normalizedClamped(1000, 10)).toBe(1);
  });

  it('clamps below 0 to 0', () => {
    expect(normalizedClamped(-5, 10)).toBe(0);
  });
});

describe('lerp', () => {
  it('returns min at t=0 and max at t=1', () => {
    expect(lerp(0, 2, 8)).toBe(2);
    expect(lerp(1, 2, 8)).toBe(8);
  });

  it('interpolates linearly at the midpoint', () => {
    expect(lerp(0.5, 2, 8)).toBe(5);
  });

  it("extrapolates outside [0,1] rather than clamping — caller's job", () => {
    expect(lerp(2, 0, 10)).toBe(20);
  });
});
