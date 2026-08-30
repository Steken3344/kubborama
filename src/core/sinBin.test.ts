import { describe, expect, it } from 'vitest';
import { sinBinSlotPosition } from './sinBin.js';
import type { SinBinConfig } from './sinBin.js';

const config: SinBinConfig = { xM: 3.3, startZM: -0.3, spacingM: 0.14 };
const kubbHeightM = 0.15;

describe('sinBinSlotPosition', () => {
  it('places the first slot at the configured start position', () => {
    expect(sinBinSlotPosition(0, kubbHeightM, config)).toEqual([
      3.3, 0.075, -0.3,
    ]);
  });

  it('stands each kubb at half its height, never at ground level', () => {
    const [, y] = sinBinSlotPosition(4, kubbHeightM, config);
    expect(y).toBe(kubbHeightM / 2);
  });

  it('spaces consecutive slots evenly along Z, same X', () => {
    const first = sinBinSlotPosition(0, kubbHeightM, config);
    const second = sinBinSlotPosition(1, kubbHeightM, config);
    const third = sinBinSlotPosition(2, kubbHeightM, config);
    expect(second[0]).toBe(first[0]);
    expect(third[0]).toBe(first[0]);
    expect(first[2] - second[2]).toBeCloseTo(config.spacingM);
    expect(second[2] - third[2]).toBeCloseTo(config.spacingM);
  });

  // No clamping by design — bounding the index (max 10 kubbs today)
  // is the caller's (SimpleRulesSystem's) job, not this pure
  // function's. These document that contract rather than leave it
  // implicit (M5 adversarial review gate, docs/DECISIONS.md): the
  // formula stays linear and well-defined past the current design's
  // 10-slot assumption, so a future rule change (e.g. more kubbs)
  // wouldn't hit a surprise here.
  it('keeps extrapolating linearly well past the 10-kubb design (no clamp)', () => {
    const slot20 = sinBinSlotPosition(20, kubbHeightM, config);
    expect(slot20).toEqual([3.3, 0.075, -0.3 - 20 * config.spacingM]);
  });

  it('extrapolates the same way for a negative index (still no clamp)', () => {
    const slotNeg1 = sinBinSlotPosition(-1, kubbHeightM, config);
    expect(slotNeg1).toEqual([3.3, 0.075, -0.3 + config.spacingM]);
  });
});
