import { describe, expect, it } from 'vitest';
import { detectImpact } from './impactDetector.js';

describe('detectImpact', () => {
  it('flags no impact when velocity barely changes', () => {
    const result = detectImpact([1, 0, 0], [1.05, 0, 0], 1.0);
    expect(result.isImpact).toBe(false);
  });

  it('flags an impact when |delta v| crosses the threshold', () => {
    const result = detectImpact([0, -3, 0], [0, 0.5, 0], 1.0);
    expect(result.isImpact).toBe(true);
    expect(result.deltaVMps).toBeCloseTo(3.5, 5);
  });

  it('is exactly at the boundary when |delta v| equals the threshold', () => {
    const result = detectImpact([0, 0, 0], [2, 0, 0], 2.0);
    expect(result.isImpact).toBe(true);
    expect(result.deltaVMps).toBeCloseTo(2.0, 5);
  });

  it('computes |delta v| as a true 3D vector magnitude, not per-axis', () => {
    // 3-4-0 triangle -> magnitude 5, even though no single axis alone
    // reaches a naive per-axis threshold of 4.5.
    const result = detectImpact([0, 0, 0], [3, 4, 0], 4.5);
    expect(result.deltaVMps).toBeCloseTo(5, 5);
    expect(result.isImpact).toBe(true);
  });
});
