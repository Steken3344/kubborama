import { describe, expect, it } from 'vitest';
import { clampToWalkArea } from './walkArea.js';

const area = { halfWidthM: 5, minZ: -10, maxZ: 3 };

describe('clampToWalkArea', () => {
  it('leaves a point inside the area alone (returns false)', () => {
    const p = { x: 1, z: -4 };
    expect(clampToWalkArea(p, area)).toBe(false);
    expect(p).toEqual({ x: 1, z: -4 });
  });

  it('pulls a point outside back onto the edge (returns true)', () => {
    const p = { x: -7, z: 4 };
    expect(clampToWalkArea(p, area)).toBe(true);
    expect(p).toEqual({ x: -5, z: 3 });
  });

  it('clamps each axis on its own', () => {
    const p = { x: 2, z: -12 };
    expect(clampToWalkArea(p, area)).toBe(true);
    expect(p).toEqual({ x: 2, z: -10 });
  });
});
