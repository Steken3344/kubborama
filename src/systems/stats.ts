import { createSystem } from '@iwsdk/core';
import { gameEvents } from '../core/events.js';
import { log } from '../core/log.js';
import {
  decodeStats,
  emptyStats,
  encodeStats,
  recordRound,
} from '../core/stats.js';
import type { Stats } from '../core/stats.js';

const STATS_STORAGE_KEY = 'kubborama.stats.v1';

function loadStats(): Stats {
  try {
    const raw = localStorage.getItem(STATS_STORAGE_KEY);
    return raw ? decodeStats(raw) : emptyStats();
  } catch {
    return emptyStats();
  }
}

function saveStats(stats: Stats): void {
  try {
    localStorage.setItem(STATS_STORAGE_KEY, encodeStats(stats));
  } catch {
    // localStorage unavailable (private mode, quota) — stats stay
    // in-memory only for this session.
  }
}

/** Folds every finished round (RoundSystem's RoundEnded) into
 * lifetime totals + personal bests, persisted to localStorage. The
 * HUD reads `stats` directly (same-frame, no event round-trip
 * needed). */
export class StatsSystem extends createSystem({}) {
  stats: Stats = emptyStats();
  private unsubscribeRoundEnded?: () => void;

  init(): void {
    this.stats = loadStats();
    this.unsubscribeRoundEnded = gameEvents.on('RoundEnded', (e) => {
      this.stats = recordRound(this.stats, {
        result: e.result,
        sticksThrownThisRound: e.sticksThrownThisRound,
        longestThrowThisRoundM: e.longestThrowM,
        longestFellingThrowThisRoundM: e.longestFellingThrowM,
        roundDurationS: e.roundDurationS,
      });
      saveStats(this.stats);
      log('info', 'state', 'stats recorded', {
        roundsPlayed: this.stats.lifetimeTotals.roundsPlayed,
        personalBests: this.stats.personalBests,
      });
    });
  }

  destroy(): void {
    this.unsubscribeRoundEnded?.();
  }
}
