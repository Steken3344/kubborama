import { describe, expect, it } from 'vitest';
import {
  STICKS_PER_ROUND,
  finishRound,
  initialRoundState,
  isRoundComplete,
  nextRoundState,
  scoringReducer,
} from './scoring.js';
import type { RoundState, ScoringEvent } from './scoring.js';

function apply(state: RoundState, events: ScoringEvent[]): RoundState {
  return events.reduce(scoringReducer, state);
}

describe('scoringReducer', () => {
  it('starts a fresh round at zero', () => {
    const state = initialRoundState();
    expect(state.roundNumber).toBe(1);
    expect(state.sticksThrownThisRound).toBe(0);
    expect(state.sticksSettledThisRound).toBe(0);
    expect(state.kubbsFelledThisRound).toEqual([]);
    expect(state.kingFelledThisRound).toBe(false);
  });

  it('counts StickThrown and StickSettled independently', () => {
    const state = apply(initialRoundState(), [
      { type: 'StickThrown' },
      { type: 'StickThrown' },
      { type: 'StickSettled' },
    ]);
    expect(state.sticksThrownThisRound).toBe(2);
    expect(state.sticksSettledThisRound).toBe(1);
  });

  it('records each distinct felled kubb once', () => {
    const state = apply(initialRoundState(), [
      { type: 'KubbFelled', entityId: 'kubb-0' },
      { type: 'KubbFelled', entityId: 'kubb-3' },
      { type: 'KubbFelled', entityId: 'kubb-0' }, // re-reported (e.g. jostled again) — not double counted
    ]);
    expect(state.kubbsFelledThisRound).toEqual(['kubb-0', 'kubb-3']);
  });

  it('records the king felled and how many sticks it took', () => {
    const state = apply(initialRoundState(), [
      { type: 'StickThrown' },
      { type: 'StickThrown' },
      { type: 'StickThrown' },
      { type: 'KingFelled' },
    ]);
    expect(state.kingFelledThisRound).toBe(true);
    expect(state.sticksThrownWhenKingFelled).toBe(3);
  });

  it('ignores a repeated KingFelled event', () => {
    const state = apply(initialRoundState(), [
      { type: 'StickThrown' },
      { type: 'KingFelled' },
      { type: 'StickThrown' },
      { type: 'KingFelled' },
    ]);
    expect(state.sticksThrownWhenKingFelled).toBe(1);
  });

  it('is not complete before all sticks per round have settled', () => {
    const state = apply(initialRoundState(), [
      { type: 'StickSettled' },
      { type: 'StickSettled' },
    ]);
    expect(isRoundComplete(state)).toBe(false);
  });

  it('is complete once STICKS_PER_ROUND sticks have settled', () => {
    const events: ScoringEvent[] = Array.from(
      { length: STICKS_PER_ROUND },
      () => ({ type: 'StickSettled' }) as const,
    );
    const state = apply(initialRoundState(), events);
    expect(isRoundComplete(state)).toBe(true);
  });

  it('summarizes a finished round', () => {
    const state = apply(initialRoundState(), [
      { type: 'KubbFelled', entityId: 'kubb-0' },
      { type: 'KubbFelled', entityId: 'kubb-1' },
      { type: 'KingFelled' },
    ]);
    const result = finishRound(state);
    expect(result).toEqual({
      roundNumber: 1,
      kubbsFelled: 2,
      kingFelled: true,
      sticksThrownWhenKingFelled: 0,
    });
  });

  it('starts the next round fresh, incrementing the round number', () => {
    const state = apply(initialRoundState(), [
      { type: 'StickThrown' },
      { type: 'KubbFelled', entityId: 'kubb-0' },
      { type: 'KingFelled' },
    ]);
    const next = nextRoundState(state);
    expect(next.roundNumber).toBe(2);
    expect(next.sticksThrownThisRound).toBe(0);
    expect(next.kubbsFelledThisRound).toEqual([]);
    expect(next.kingFelledThisRound).toBe(false);
    expect(next.sticksThrownWhenKingFelled).toBeNull();
  });
});
