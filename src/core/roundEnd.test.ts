import { describe, expect, it } from 'vitest';
import { shouldEndPendingRound } from './scoring.js';

const CFG = { quietCourtS: 0.6, maxWaitS: 3 };

describe('shouldEndPendingRound (gh#17: wait for a quiet court)', () => {
  it('does not end while pieces are still moving and the cap is not hit', () => {
    expect(shouldEndPendingRound(null, 1.2, CFG)).toBe(false);
  });

  it('does not end the instant the court goes quiet — needs quietCourtS', () => {
    expect(shouldEndPendingRound(0.1, 1.5, CFG)).toBe(false);
    expect(shouldEndPendingRound(0.59, 1.5, CFG)).toBe(false);
  });

  it('ends once the court has been quiet for quietCourtS', () => {
    expect(shouldEndPendingRound(0.6, 1.5, CFG)).toBe(true);
    expect(shouldEndPendingRound(2, 2.5, CFG)).toBe(true);
  });

  it('ends at the cap even if something never comes to rest', () => {
    expect(shouldEndPendingRound(null, 2.99, CFG)).toBe(false);
    expect(shouldEndPendingRound(null, 3, CFG)).toBe(true);
    expect(shouldEndPendingRound(0.2, 3.4, CFG)).toBe(true);
    // Cap beats insufficient quiet.
    expect(shouldEndPendingRound(0.59, 3.0, CFG)).toBe(true);
  });
});
