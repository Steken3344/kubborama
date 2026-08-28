import { describe, expect, it } from 'vitest';
import { accumulateHeldDuration, isResting } from './restState.js';

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

describe('accumulateHeldDuration', () => {
  it('adds a normal frame delta in full', () => {
    expect(accumulateHeldDuration(0, 0.016)).toBeCloseTo(0.016, 5);
  });

  it('accumulates across repeated normal frames', () => {
    let accum = 0;
    for (let i = 0; i < 30; i++) {
      accum = accumulateHeldDuration(accum, 0.016);
    }
    expect(accum).toBeCloseTo(0.48, 5);
  });

  it('caps a single huge delta (a loading stall) instead of counting it in full', () => {
    // The exact bug this guards against: a multi-second stall handing
    // one update() call a multi-second delta shouldn't alone satisfy a
    // half-second "held continuously" check.
    expect(accumulateHeldDuration(0, 5)).toBeLessThan(0.5);
  });

  it('never lets one capped frame exceed the cap', () => {
    expect(accumulateHeldDuration(0, 1000)).toBeCloseTo(0.1, 5);
  });
});
