import { describe, expect, it } from 'vitest';
import { initialMatchState, withTimeUp, withTurnAdvanced } from './match.js';
import type { MatchState } from './match.js';
import { clockText, remainingS } from './matchClock.js';

/** Guest's baseline down to `guestLeft` kubbs, host's to `hostLeft`. */
function withStanding(
  state: MatchState,
  hostLeft: number,
  guestLeft: number,
): MatchState {
  return {
    ...state,
    baselineKubbs: {
      host: state.baselineKubbs.host.slice(0, hostLeft),
      guest: state.baselineKubbs.guest.slice(0, guestLeft),
    },
  };
}

describe('time limit (tournament tiebreak)', () => {
  it('starts with time left', () => {
    expect(initialMatchState().timeUp).toBe(false);
  });

  it('marks time up without deciding anything yet', () => {
    const s = withTimeUp(initialMatchState());
    expect(s.timeUp).toBe(true);
    expect(s.winner).toBeNull();
    expect(withTimeUp(s)).toBe(s);
  });

  it('lets the guest finish the pair before deciding', () => {
    // Host's turn ends after time ran out: the guest still throws.
    const s = withTurnAdvanced(
      withStanding(withTimeUp(initialMatchState()), 5, 2),
    );
    expect(s.currentTurn).toBe('guest');
    expect(s.winner).toBeNull();
  });

  it('gives the win to the side with fewer kubbs left to knock down', () => {
    // Guest's turn ends: the host has 2 guest kubbs left to fell, the
    // guest still 5 host kubbs.
    const guestTurn = {
      ...withStanding(withTimeUp(initialMatchState()), 5, 2),
      currentTurn: 'guest' as const,
    };
    const s = withTurnAdvanced(guestTurn);
    expect(s.winner).toBe('host');
    expect(s.endReason).toBe('timeLimit');
  });

  it('plays on, pair by pair, while it is level (sudden death)', () => {
    const level = {
      ...withStanding(withTimeUp(initialMatchState()), 3, 3),
      currentTurn: 'guest' as const,
    };
    const s = withTurnAdvanced(level);
    expect(s.winner).toBeNull();
    expect(s.currentTurn).toBe('host');
    expect(s.timeUp).toBe(true);
  });

  it('counts field kubbs on a half as left to knock down', () => {
    const guestTurn: MatchState = {
      ...withStanding(withTimeUp(initialMatchState()), 2, 2),
      currentTurn: 'guest',
      fieldKubbs: [{ kubbId: 'kubb-9', half: 'guest', x: 0, z: -4 }],
    };
    const s = withTurnAdvanced(guestTurn);
    // Host must still fell 3 on the guest half, guest 2: guest wins.
    expect(s.winner).toBe('guest');
  });
});

describe('match clock', () => {
  it('counts down and never below zero', () => {
    expect(remainingS(1800, 600)).toBe(1200);
    expect(remainingS(1800, 2000)).toBe(0);
  });

  it('formats minutes and seconds', () => {
    expect(clockText(1200)).toBe('20:00');
    expect(clockText(65.4)).toBe('1:06');
    expect(clockText(0)).toBe('0:00');
  });
});
