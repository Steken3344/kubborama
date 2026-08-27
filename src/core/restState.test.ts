import { describe, expect, it } from 'vitest';
import { isResting } from './restState.js';

const config = {
  restLinearThresholdMps: 0.05,
  restAngularThresholdRadS: 0.1,
};

describe('isResting', () => {
  it('is true when both speeds are under their thresholds', () => {
    expect(isResting(0.01, 0.02, config)).toBe(true);
  });

  it('is false when linear speed is over its threshold', () => {
    expect(isResting(0.1, 0.02, config)).toBe(false);
  });

  it('is false when angular speed is over its threshold', () => {
    expect(isResting(0.01, 0.2, config)).toBe(false);
  });

  it('treats the exact threshold as not-yet-resting', () => {
    expect(isResting(0.05, 0.02, config)).toBe(false);
  });
});
