import { describe, expect, it } from 'vitest';
import { computeWindForce } from './wind.js';

describe('computeWindForce', () => {
  it('scales the wind vector by the drag factor', () => {
    expect(computeWindForce([1, 0, 0], 0.02)).toEqual([0.02, 0, 0]);
  });

  it('is zero with zero wind', () => {
    expect(computeWindForce([0, 0, 0], 0.02)).toEqual([0, 0, 0]);
  });

  it('scales each axis independently', () => {
    expect(computeWindForce([2, 0, -3], 0.5)).toEqual([1, 0, -1.5]);
  });
});
