import { describe, expect, it } from 'vitest';
import { nextInCycle } from './cycle.js';

describe('nextInCycle', () => {
  it('steps and wraps round', () => {
    expect(nextInCycle([0, 20, 30, 45], 45)).toBe(0);
    expect(nextInCycle([0, 20, 30, 45], 20)).toBe(30);
  });

  it('wraps onto a null choice (the opponent button: hard → person)', () => {
    const cycle = [null, 'easy', 'medium', 'hard'];
    expect(nextInCycle(cycle, 'hard')).toBeNull();
    expect(nextInCycle(cycle, null)).toBe('easy');
  });

  it('starts at the first choice for an unknown current one', () => {
    expect(nextInCycle([0, 20], 7)).toBe(0);
  });
});
