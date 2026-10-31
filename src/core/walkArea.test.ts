import { describe, expect, it } from 'vitest';
import {
  behindLineCorrectionZ,
  clampToWalkArea,
  isFootFault,
} from './walkArea.js';

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

describe('behindLineCorrectionZ', () => {
  const lean = 0.5;

  it('side A (facing -z) may lean up to the allowance past its line', () => {
    expect(behindLineCorrectionZ(1, 'host', 0, lean)).toBe(0);
    expect(behindLineCorrectionZ(-0.5, 'host', 0, lean)).toBe(0);
  });

  it('side A further forward is pushed back (+z) to the limit', () => {
    expect(behindLineCorrectionZ(-3, 'host', 0, lean)).toBeCloseTo(2.5);
    expect(behindLineCorrectionZ(-3, 'host', -2, lean)).toBeCloseTo(0.5);
  });

  it('side B (facing +z) is mirrored', () => {
    expect(behindLineCorrectionZ(-9, 'guest', -8, lean)).toBe(0);
    expect(behindLineCorrectionZ(-7.5, 'guest', -8, lean)).toBe(0);
    expect(behindLineCorrectionZ(-5, 'guest', -8, lean)).toBeCloseTo(-2.5);
  });
});

describe('isFootFault', () => {
  it('side A: a release within the reach past its line is fine', () => {
    expect(isFootFault(0.3, 'host', 0, 0.9)).toBe(false);
    expect(isFootFault(-0.8, 'host', 0, 0.9)).toBe(false);
    expect(isFootFault(-1.2, 'host', 0, 0.9)).toBe(true);
  });

  it('measures from the advantage line when throwing from it', () => {
    expect(isFootFault(-2.5, 'host', -2, 0.9)).toBe(false);
    expect(isFootFault(-3.1, 'host', -2, 0.9)).toBe(true);
  });

  it('side B is mirrored', () => {
    expect(isFootFault(-7.5, 'guest', -8, 0.9)).toBe(false);
    expect(isFootFault(-6.9, 'guest', -8, 0.9)).toBe(true);
  });
});
