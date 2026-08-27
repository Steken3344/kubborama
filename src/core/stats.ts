import { z } from 'zod';
import type { RoundResult } from './scoring.js';

export const STATS_SCHEMA_VERSION = 1;

const personalBestsSchema = z.object({
  fewestSticksToFellKing: z.number().int().positive().nullable(),
  mostFelledInRound: z.number().int().nonnegative(),
  longestKingFellingStreak: z.number().int().nonnegative(),
  longestThrowM: z.number().nonnegative(),
  longestFellingThrowM: z.number().nonnegative(),
});

const lifetimeTotalsSchema = z.object({
  roundsPlayed: z.number().int().nonnegative(),
  sticksThrown: z.number().int().nonnegative(),
  kubbsFelled: z.number().int().nonnegative(),
  kingsFelled: z.number().int().nonnegative(),
  playTimeS: z.number().nonnegative(),
});

const statsSchema = z.object({
  version: z.literal(STATS_SCHEMA_VERSION),
  // Reserved for post-POC accounts/match history (docs/PLAN.md's
  // stats.ts note) — unused by the POC, kept so a future schema bump
  // doesn't need a data migration for the shape itself.
  userId: z.string().nullable(),
  matches: z.array(z.unknown()),
  personalBests: personalBestsSchema,
  lifetimeTotals: lifetimeTotalsSchema,
  currentKingFellStreak: z.number().int().nonnegative(),
});
export type Stats = z.infer<typeof statsSchema>;

export function emptyStats(): Stats {
  return {
    version: STATS_SCHEMA_VERSION,
    userId: null,
    matches: [],
    personalBests: {
      fewestSticksToFellKing: null,
      mostFelledInRound: 0,
      longestKingFellingStreak: 0,
      longestThrowM: 0,
      longestFellingThrowM: 0,
    },
    lifetimeTotals: {
      roundsPlayed: 0,
      sticksThrown: 0,
      kubbsFelled: 0,
      kingsFelled: 0,
      playTimeS: 0,
    },
    currentKingFellStreak: 0,
  };
}

export interface RoundStatsInput {
  result: RoundResult;
  sticksThrownThisRound: number;
  longestThrowThisRoundM: number;
  longestFellingThrowThisRoundM: number | null;
  roundDurationS: number;
}

/** Folds one finished round into lifetime totals + personal bests.
 * PBs only ever improve — a worse round never overwrites one. */
export function recordRound(stats: Stats, input: RoundStatsInput): Stats {
  const { result } = input;
  const currentKingFellStreak = result.kingFelled
    ? stats.currentKingFellStreak + 1
    : 0;
  const totalFelledThisRound = result.kubbsFelled + (result.kingFelled ? 1 : 0);

  return {
    ...stats,
    lifetimeTotals: {
      roundsPlayed: stats.lifetimeTotals.roundsPlayed + 1,
      sticksThrown:
        stats.lifetimeTotals.sticksThrown + input.sticksThrownThisRound,
      kubbsFelled: stats.lifetimeTotals.kubbsFelled + result.kubbsFelled,
      kingsFelled:
        stats.lifetimeTotals.kingsFelled + (result.kingFelled ? 1 : 0),
      playTimeS: stats.lifetimeTotals.playTimeS + input.roundDurationS,
    },
    personalBests: {
      fewestSticksToFellKing: minIgnoringNull(
        stats.personalBests.fewestSticksToFellKing,
        result.kingFelled ? result.sticksThrownWhenKingFelled : null,
      ),
      mostFelledInRound: Math.max(
        stats.personalBests.mostFelledInRound,
        totalFelledThisRound,
      ),
      longestKingFellingStreak: Math.max(
        stats.personalBests.longestKingFellingStreak,
        currentKingFellStreak,
      ),
      longestThrowM: Math.max(
        stats.personalBests.longestThrowM,
        input.longestThrowThisRoundM,
      ),
      longestFellingThrowM: Math.max(
        stats.personalBests.longestFellingThrowM,
        input.longestFellingThrowThisRoundM ?? 0,
      ),
    },
    currentKingFellStreak,
  };
}

function minIgnoringNull(a: number | null, b: number | null): number | null {
  if (a === null) {
    return b;
  }
  if (b === null) {
    return a;
  }
  return Math.min(a, b);
}

/** Lifetime pieces-felled-per-stick-thrown ratio, 0 with no throws yet. */
export function accuracy(stats: Stats): number {
  if (stats.lifetimeTotals.sticksThrown === 0) {
    return 0;
  }
  const felled =
    stats.lifetimeTotals.kubbsFelled + stats.lifetimeTotals.kingsFelled;
  return felled / stats.lifetimeTotals.sticksThrown;
}

export function encodeStats(stats: Stats): string {
  return JSON.stringify(stats, null, 2);
}

/** Never throws — corrupt JSON, a missing/unknown schema version, or a
 * wrong shape all fall back to fresh empty stats. */
export function decodeStats(json: string): Stats {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return emptyStats();
  }
  const result = statsSchema.safeParse(parsed);
  return result.success ? result.data : emptyStats();
}
