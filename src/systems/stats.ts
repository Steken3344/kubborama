import { createSystem } from '@iwsdk/core';
import { gameEvents } from '../core/events.js';
import { log } from '../core/log.js';
import {
  decodeStats,
  emptyStats,
  encodeStats,
  recordRound,
} from '../core/stats.js';
import type { ClientProfile } from '../core/profiles.js';
import type { Stats } from '../core/stats.js';
import { isServerModeOn } from '../serverMode.js';

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

/** Folds every finished round (RoundSystem's RoundEnded) of the LOCAL
 * player (an opponent's relayed turn is skipped, gh#16) into
 * lifetime totals + personal bests, persisted to localStorage. The
 * HUD reads `stats` directly (same-frame, no event round-trip
 * needed). Through the game server the SERVER keeps them in the
 * player's profile (2026-10-31): this system then only shows the
 * server's numbers and never records or saves locally. */
export class StatsSystem extends createSystem({}) {
  stats: Stats = emptyStats();
  /** Results against each opponent (server mode only). */
  headToHead: ClientProfile['headToHead'] = [];
  /** Results against the bot per level (server mode only). */
  botRecord: ClientProfile['botRecord'] = {};
  private unsubscribeRoundEnded?: () => void;
  private unsubscribeServerProfile?: () => void;

  init(): void {
    const viaServer = isServerModeOn();
    this.stats = viaServer ? emptyStats() : loadStats();
    this.unsubscribeServerProfile = gameEvents.on('ServerProfile', (p) => {
      this.stats = p.stats;
      this.headToHead = p.headToHead;
      this.botRecord = p.botRecord;
    });
    this.unsubscribeRoundEnded = gameEvents.on('RoundEnded', (e) => {
      if (viaServer) {
        return; // the server records it into the profile
      }
      if (e.byOpponent) {
        // gh#16: the opponent's turn, relayed to this host — not ours.
        return;
      }
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
    this.unsubscribeServerProfile?.();
  }
}
