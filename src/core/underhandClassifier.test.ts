import { describe, expect, it } from 'vitest';
import { classifyThrow } from './underhandClassifier.js';
import type { PoseSample } from './throwRelease.js';

const IDENTITY: [number, number, number, number] = [0, 0, 0, 1];

function posesMovingVertically(deltaYM: number): PoseSample[] {
  return [
    { timeS: 0, position: [0, 1.0, 0], orientation: IDENTITY },
    { timeS: 0.25, position: [0, 1.0 + deltaYM / 2, 0], orientation: IDENTITY },
    { timeS: 0.5, position: [0, 1.0 + deltaYM, 0], orientation: IDENTITY },
  ];
}

describe('classifyThrow', () => {
  it('classifies a textbook underhand flip: hand rising, spin axis horizontal + perpendicular to throw', () => {
    // Throwing along +Z; ideal flip axis for that is +X or -X (horizontal,
    // perpendicular to travel).
    const result = classifyThrow({
      poses: posesMovingVertically(0.4), // hand rose through the swing
      releaseVelocity: [0, 1, 8], // mostly forward, slight upward arc
      angularVelocity: [6, 0, 0], // spin around X = perpendicular to +Z travel
    });
    expect(result.style).toBe('underhand');
    expect(result.flipQualityScore).toBeGreaterThan(85);
  });

  it('classifies a helicopter spin: axis mostly vertical regardless of hand trend', () => {
    const result = classifyThrow({
      poses: posesMovingVertically(0.4),
      releaseVelocity: [0, 1, 8],
      angularVelocity: [0, 10, 0], // spin around world-up — illegal "helicopter"
    });
    expect(result.style).toBe('helicopter');
  });

  it('classifies overhand: hand falling through the swing, spin axis still horizontal', () => {
    const result = classifyThrow({
      poses: posesMovingVertically(-0.4), // hand descended (overhand motion)
      releaseVelocity: [0, -0.5, 8],
      angularVelocity: [6, 0, 0],
    });
    expect(result.style).toBe('overhand');
  });

  it('gives a lower flip-quality score when the spin axis is tilted between horizontal and vertical', () => {
    const clean = classifyThrow({
      poses: posesMovingVertically(0.4),
      releaseVelocity: [0, 1, 8],
      angularVelocity: [6, 0, 0],
    });
    const tilted = classifyThrow({
      poses: posesMovingVertically(0.4),
      releaseVelocity: [0, 1, 8],
      angularVelocity: [4.24, 4.24, 0], // 45 degrees toward vertical
    });
    expect(tilted.flipQualityScore).toBeLessThan(clean.flipQualityScore);
  });

  it('does not crash and returns a score of 0 with negligible spin', () => {
    const result = classifyThrow({
      poses: posesMovingVertically(0.4),
      releaseVelocity: [0, 1, 8],
      angularVelocity: [0, 0, 0],
    });
    expect(result.flipQualityScore).toBe(0);
    expect(['underhand', 'overhand', 'helicopter']).toContain(result.style);
  });
});
