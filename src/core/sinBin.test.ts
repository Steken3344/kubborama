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
});
