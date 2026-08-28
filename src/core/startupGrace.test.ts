import { describe, expect, it } from 'vitest';
import { createStartupGate } from './startupGrace.js';

describe('createStartupGate', () => {
  it('is closed on the very first call, regardless of the timeS value', () => {
    const isPastGrace = createStartupGate(1.5);
    expect(isPastGrace(1000)).toBe(false);
  });

  it('stays closed until graceS has elapsed since the first call', () => {
    const isPastGrace = createStartupGate(1.5);
    isPastGrace(10);
    expect(isPastGrace(10.5)).toBe(false);
    expect(isPastGrace(11.49)).toBe(false);
  });

  it('opens once graceS has elapsed since the first call', () => {
    const isPastGrace = createStartupGate(1.5);
    isPastGrace(10);
    expect(isPastGrace(11.5)).toBe(true);
    expect(isPastGrace(50)).toBe(true);
  });

  it("anchors to the first call's timeS, not 0", () => {
    const isPastGrace = createStartupGate(1.5);
    isPastGrace(1_000_000);
    expect(isPastGrace(1_000_000.4)).toBe(false);
    expect(isPastGrace(1_000_001.6)).toBe(true);
  });
});
