import { describe, expect, it } from 'vitest';
import { courtHalves } from './inkast.js';
import { inkastGuideRect } from './inkastGuide.js';
import { initialMatchState } from './match.js';
import type { MatchState } from './match.js';

const halves = courtHalves({ widthM: 3, lengthM: 6 });
const inkast = (turn: 'host' | 'guest'): MatchState => ({
  ...initialMatchState(),
  currentTurn: turn,
  phase: 'inkast',
  inkastQueue: [{ kubbId: 'kubb-0', attempt: 1 }],
});
const modes = ['simple'];

describe('inkastGuideRect', () => {
  it('outlines the opponent half during my own inkast', () => {
    expect(
      inkastGuideRect(inkast('host'), 'host', 'simple', halves, modes),
    ).toEqual({ minX: -1.5, maxX: 1.5, minZ: -6, maxZ: -3 });
    expect(
      inkastGuideRect(inkast('guest'), 'guest', 'simple', halves, modes),
    ).toEqual({ minX: -1.5, maxX: 1.5, minZ: -3, maxZ: 0 });
  });

  it('shows nothing during the other player’s inkast', () => {
    expect(
      inkastGuideRect(inkast('guest'), 'host', 'simple', halves, modes),
    ).toBeNull();
  });

  it('shows nothing while throwing, after the match, or off the listed modes', () => {
    expect(
      inkastGuideRect(initialMatchState(), 'host', 'simple', halves, modes),
    ).toBeNull();
    expect(
      inkastGuideRect(
        { ...inkast('host'), winner: 'guest', endReason: 'kingFelledEarly' },
        'host',
        'simple',
        halves,
        modes,
      ),
    ).toBeNull();
    expect(
      inkastGuideRect(inkast('host'), 'host', 'advanced', halves, modes),
    ).toBeNull();
    expect(inkastGuideRect(null, 'host', 'simple', halves, modes)).toBeNull();
  });
});
