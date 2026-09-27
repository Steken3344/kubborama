import { createSystem, Grabbed } from '@iwsdk/core';
import { Resettable } from '../components/resettable.js';
import { StickState } from '../components/stick-state.js';
import { KUBB_COUNT } from '../core/court-layout.js';
import { gameEvents } from '../core/events.js';
import { standingKubbs } from '../core/match.js';
import type { MatchSide, MatchState } from '../core/match.js';
import { debugContext } from '../debug/debugContext.js';
import { settingsState } from '../settingsState.js';
import { StatsSystem } from './stats.js';
import { gateLog } from '../debug/gateLog.js';

const SNAPSHOT_INTERVAL_S = 1;

/** 0.05 m grid, two decimals so the JSON stays short. */
function round5cm(value: number): number {
  return Number((Math.round(value / 0.05) * 0.05).toFixed(2));
}

/**
 * Debug mode only: the gate-report probes that are pure consequences of
 * existing events (docs/superpowers/specs/2026-09-26-gate-report-
 * design.md). Nothing is logged unless the debug relay is on. Registered
 * after MultiplayerSystem ON PURPOSE: the host's king decision can be
 * emitted inside the Reset{roundEnd} cascade, and this system's own
 * Reset handler (which zeroes the stick count) must run after it so
 * `stickNumberInRound` is still that round's count.
 */
export class GateProbeSystem extends createSystem({
  // A piece in the local hand follows the hand, not the authority — it
  // would read as a host/guest disagreement (MP7 session: the guest
  // holding its inkast kubb), so held pieces are left out.
  pieces: { required: [Resettable], excluded: [StickState, Grabbed] },
  sticks: { required: [StickState], excluded: [Grabbed] },
}) {
  private statsSystem!: StatsSystem;
  private mySide: MatchSide | null = null;
  private lastState: MatchState | null = null;
  private sticksThisRound = 0;
  private roundsPlayedSeen = 0;
  private snapshotTimerS = 0;

  init(): void {
    const statsSystem = this.world.getSystem(StatsSystem);
    if (!statsSystem) {
      throw new Error(
        'GateProbeSystem requires StatsSystem to be registered first',
      );
    }
    this.statsSystem = statsSystem;
    this.roundsPlayedSeen = statsSystem.stats.lifetimeTotals.roundsPlayed;
    this.cleanupFuncs.push(
      gameEvents.on('Thrown', () => {
        this.sticksThisRound += 1;
      }),
      gameEvents.on('ThrowRelayed', () => {
        this.sticksThisRound += 1;
      }),
      gameEvents.on('RoundEnded', (e) => {
        // StatsSystem (registered earlier) has already folded this round.
        const after = this.statsSystem.stats.lifetimeTotals.roundsPlayed;
        if (debugContext.enabled) {
          gateLog('round summary', {
            mySide: this.mySide ?? 'solo',
            matchTurn: this.lastState?.currentTurn ?? null,
            byOpponent: e.byOpponent,
            statsRecorded: after > this.roundsPlayedSeen,
            roundsPlayedBefore: this.roundsPlayedSeen,
            roundsPlayedAfter: after,
            sticksThrown: e.sticksThrownThisRound,
            kubbsFelled: e.result.kubbsFelled,
            kingFelled: e.result.kingFelled,
          });
        }
        this.roundsPlayedSeen = after;
      }),
      gameEvents.on('Reset', () => {
        this.sticksThisRound = 0;
      }),
      gameEvents.on('MatchStateChanged', (e) => {
        const prev = this.lastState;
        this.mySide = e.mySide;
        this.lastState = e.state;
        if (!debugContext.enabled) {
          return;
        }
        const standing = standingKubbs(e.state);
        gateLog('match state', {
          mySide: e.mySide,
          turn: e.state.currentTurn,
          phase: e.state.phase,
          winner: e.state.winner,
          endReason: e.state.endReason,
          standingHost: standing.host,
          standingGuest: standing.guest,
          fieldKubbs: e.state.fieldKubbs.length,
          inkastQueue: e.state.inkastQueue.length,
          fresh:
            e.state.fieldKubbs.length === 0 &&
            e.state.felledThisTurn.length === 0 &&
            e.state.inkastQueue.length === 0 &&
            standing.host + standing.guest === KUBB_COUNT * 2 &&
            e.state.winner === null,
        });
        if ((prev?.winner ?? null) === null && e.state.winner !== null) {
          gateLog('king decision', {
            mySide: e.mySide,
            thrower: e.state.currentTurn,
            winner: e.state.winner,
            endReason: e.state.endReason,
            stickNumberInRound: this.sticksThisRound,
          });
        }
      }),
      gameEvents.on('MultiplayerPeerDisconnected', () => {
        this.mySide = null;
        this.lastState = null;
      }),
    );
  }

  update(delta: number): void {
    if (!debugContext.enabled || this.mySide === null || !this.lastState) {
      return;
    }
    this.snapshotTimerS += delta;
    if (this.snapshotTimerS < SNAPSHOT_INTERVAL_S) {
      return;
    }
    this.snapshotTimerS = 0;
    // One payload per second, debug only — the relay keeps the object
    // until it flushes, so it cannot be a reused buffer.
    gateLog('sync snapshot', {
      turn: this.lastState.currentTurn,
      winner: this.lastState.winner,
      phase: this.lastState.phase,
      score: standingKubbs(this.lastState),
      felled: {
        baselineKubbs: this.lastState.baselineKubbs,
        fieldKubbs: this.lastState.fieldKubbs,
        inkastQueue: this.lastState.inkastQueue,
      },
      gameMode: settingsState.current.gameMode,
      pieces: this.roundedPositions(this.queries.pieces.entities),
      // Not compared by the sync check (a guest predicts its own throws);
      // evidence for where sticks actually are on each headset.
      sticks: this.roundedPositions(this.queries.sticks.entities),
    });
  }

  private roundedPositions(
    entities: Iterable<{
      index: number;
      object3D?: { position: { x: number; y: number; z: number } } | null;
    }>,
  ): Record<string, [number, number, number]> {
    const out: Record<string, [number, number, number]> = {};
    for (const entity of entities) {
      const p = entity.object3D?.position;
      if (!p) {
        continue;
      }
      const id =
        debugContext.pieceIdByEntityIndex.get(entity.index) ??
        `entity-${entity.index}`;
      out[id] = [round5cm(p.x), round5cm(p.y), round5cm(p.z)];
    }
    return out;
  }
}
