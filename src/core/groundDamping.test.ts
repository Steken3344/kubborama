import { describe, expect, it } from 'vitest';
import { isStickOnGround } from './groundDamping.js';

const t = { groundHeightM: 0.06 };

describe('isStickOnGround', () => {
  it('is true for a stick lying on the grass, however fast it rolls', () => {
    expect(isStickOnGround(0.022, t)).toBe(true);
  });

  it('is false in the air', () => {
    expect(isStickOnGround(0.5, t)).toBe(false);
  });
});
