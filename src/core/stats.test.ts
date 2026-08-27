import { describe, expect, it } from 'vitest';
import {
  accuracy,
  decodeStats,
  emptyStats,
  encodeStats,
  recordRound,
} from './stats.js';
import type { RoundStatsInput } from './stats.js';

function round(input: Partial<RoundStatsInput> = {}): RoundStatsInput {
  return {
    result: {
      roundNumber: 1,
      kubbsFelled: 0,
      kingFelled: false,
      sticksThrownWhenKingFelled: null,
    },
    sticksThrownThisRound: 6,
    longestThrowThisRoundM: 0,
    longestFellingThrowThisRoundM: null,
    roundDurationS: 30,
    ...input,
  };
}

describe('emptyStats', () => {
  it('starts at zero with no PBs set', () => {
    const stats = emptyStats();
    expect(stats.lifetimeTotals.roundsPlayed).toBe(0);
    expect(stats.personalBests.fewestSticksToFellKing).toBeNull();
    expect(stats.personalBests.longestThrowM).toBe(0);
    expect(stats.currentKingFellStreak).toBe(0);
  });
});

describe('recordRound — lifetime totals', () => {
  it('accumulates rounds, sticks, kubbs, kings and play time', () => {
    let stats = emptyStats();
    stats = recordRound(
      stats,
      round({
        result: {
          roundNumber: 1,
          kubbsFelled: 3,
          kingFelled: true,
          sticksThrownWhenKingFelled: 4,
        },
      }),
    );
    expect(stats.lifetimeTotals.roundsPlayed).toBe(1);
    expect(stats.lifetimeTotals.sticksThrown).toBe(6);
    expect(stats.lifetimeTotals.kubbsFelled).toBe(3);
    expect(stats.lifetimeTotals.kingsFelled).toBe(1);
    expect(stats.lifetimeTotals.playTimeS).toBe(30);

    stats = recordRound(stats, round());
    expect(stats.lifetimeTotals.roundsPlayed).toBe(2);
    expect(stats.lifetimeTotals.sticksThrown).toBe(12);
    expect(stats.lifetimeTotals.kubbsFelled).toBe(3);
    expect(stats.lifetimeTotals.kingsFelled).toBe(1);
    expect(stats.lifetimeTotals.playTimeS).toBe(60);
  });
});

describe('recordRound — personal bests only ever improve', () => {
  it('sets fewestSticksToFellKing on the first king fell, then only lowers it', () => {
    let stats = emptyStats();
    stats = recordRound(
      stats,
      round({
        result: {
          roundNumber: 1,
          kubbsFelled: 0,
          kingFelled: true,
          sticksThrownWhenKingFelled: 5,
        },
      }),
    );
    expect(stats.personalBests.fewestSticksToFellKing).toBe(5);

    // A worse (higher) result never overwrites the PB.
    stats = recordRound(
      stats,
      round({
        result: {
          roundNumber: 2,
          kubbsFelled: 0,
          kingFelled: true,
          sticksThrownWhenKingFelled: 6,
        },
      }),
    );
    expect(stats.personalBests.fewestSticksToFellKing).toBe(5);

    // A better (lower) result does.
    stats = recordRound(
      stats,
      round({
        result: {
          roundNumber: 3,
          kubbsFelled: 0,
          kingFelled: true,
          sticksThrownWhenKingFelled: 2,
        },
      }),
    );
    expect(stats.personalBests.fewestSticksToFellKing).toBe(2);
  });

  it('tracks mostFelledInRound as kubbs plus the king', () => {
    let stats = emptyStats();
    stats = recordRound(
      stats,
      round({
        result: {
          roundNumber: 1,
          kubbsFelled: 4,
          kingFelled: true,
          sticksThrownWhenKingFelled: 6,
        },
      }),
    );
    expect(stats.personalBests.mostFelledInRound).toBe(5);

    stats = recordRound(
      stats,
      round({
        result: {
          roundNumber: 2,
          kubbsFelled: 2,
          kingFelled: false,
          sticksThrownWhenKingFelled: null,
        },
      }),
    );
    expect(stats.personalBests.mostFelledInRound).toBe(5);
  });

  it('tracks the longest throw and longest felling throw independently', () => {
    let stats = emptyStats();
    stats = recordRound(
      stats,
      round({
        longestThrowThisRoundM: 5.2,
        longestFellingThrowThisRoundM: 4.1,
      }),
    );
    expect(stats.personalBests.longestThrowM).toBeCloseTo(5.2);
    expect(stats.personalBests.longestFellingThrowM).toBeCloseTo(4.1);

    stats = recordRound(
      stats,
      round({ longestThrowThisRoundM: 3, longestFellingThrowThisRoundM: null }),
    );
    // Neither regresses when this round's numbers are smaller/absent.
    expect(stats.personalBests.longestThrowM).toBeCloseTo(5.2);
    expect(stats.personalBests.longestFellingThrowM).toBeCloseTo(4.1);
  });
});

describe('recordRound — king-fell streak', () => {
  it('increments on consecutive king-felled rounds and tracks the longest', () => {
    let stats = emptyStats();
    stats = recordRound(
      stats,
      round({
        result: {
          roundNumber: 1,
          kubbsFelled: 0,
          kingFelled: true,
          sticksThrownWhenKingFelled: 6,
        },
      }),
    );
    expect(stats.currentKingFellStreak).toBe(1);
    stats = recordRound(
      stats,
      round({
        result: {
          roundNumber: 2,
          kubbsFelled: 0,
          kingFelled: true,
          sticksThrownWhenKingFelled: 6,
        },
      }),
    );
    expect(stats.currentKingFellStreak).toBe(2);
    expect(stats.personalBests.longestKingFellingStreak).toBe(2);

    stats = recordRound(
      stats,
      round({
        result: {
          roundNumber: 3,
          kubbsFelled: 0,
          kingFelled: false,
          sticksThrownWhenKingFelled: null,
        },
      }),
    );
    expect(stats.currentKingFellStreak).toBe(0);
    // The PB survives the streak breaking.
    expect(stats.personalBests.longestKingFellingStreak).toBe(2);
  });
});

describe('accuracy', () => {
  it('is 0 with no sticks thrown yet', () => {
    expect(accuracy(emptyStats())).toBe(0);
  });

  it('is felled pieces divided by sticks thrown', () => {
    let stats = emptyStats();
    stats = recordRound(
      stats,
      round({
        result: {
          roundNumber: 1,
          kubbsFelled: 3,
          kingFelled: false,
          sticksThrownWhenKingFelled: null,
        },
        sticksThrownThisRound: 6,
      }),
    );
    expect(accuracy(stats)).toBeCloseTo(0.5);
  });
});

describe('encode/decode', () => {
  it('round-trips through JSON', () => {
    const stats = recordRound(emptyStats(), round());
    const decoded = decodeStats(encodeStats(stats));
    expect(decoded).toEqual(stats);
  });

  it('never throws on corrupt or unversioned data — falls back to empty', () => {
    expect(decodeStats('not json')).toEqual(emptyStats());
    expect(decodeStats('{"version": 999}')).toEqual(emptyStats());
    expect(decodeStats('{}')).toEqual(emptyStats());
  });
});
