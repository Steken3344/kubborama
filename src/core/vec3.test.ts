import { describe, expect, it } from 'vitest';
import { add, cross, distance, length, scale, sub } from './vec3.js';

describe('vec3', () => {
  it('add sums componentwise', () => {
    expect(add([1, 2, 3], [4, 5, 6])).toEqual([5, 7, 9]);
  });

  it('sub subtracts componentwise', () => {
    expect(sub([4, 5, 6], [1, 2, 3])).toEqual([3, 3, 3]);
  });

  it('scale multiplies by a scalar', () => {
    expect(scale([1, 2, 3], 2)).toEqual([2, 4, 6]);
  });

  it('cross computes the right-handed cross product', () => {
    expect(cross([1, 0, 0], [0, 1, 0])).toEqual([0, 0, 1]);
    expect(cross([0, 1, 0], [1, 0, 0])).toEqual([0, 0, -1]);
  });

  it('cross of parallel vectors is zero', () => {
    expect(cross([2, 0, 0], [5, 0, 0])).toEqual([0, 0, 0]);
  });

  it('distance matches length(sub(a, b)) without allocating the difference', () => {
    const a: [number, number, number] = [4, 5, 6];
    const b: [number, number, number] = [1, 2, 3];
    expect(distance(a, b)).toBeCloseTo(length(sub(a, b)), 10);
  });

  it('distance is zero for identical vectors', () => {
    expect(distance([1, 2, 3], [1, 2, 3])).toBe(0);
  });
});
