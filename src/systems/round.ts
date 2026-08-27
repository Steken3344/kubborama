import { createSystem } from '@iwsdk/core';
import { StickPhase, StickState } from '../components/stick-state.js';
import { gameEvents } from '../core/events.js';
import { log } from '../core/log.js';
import {
  finishRound,
  initialRoundState,
  isRoundComplete,
  nextRoundState,
  scoringReducer,
} from '../core/scoring.js';
import type { RoundState } from '../core/scoring.js';
import { sub } from '../core/vec3.js';
import type { Vec3 } from '../core/vec3.js';

interface PendingThrow {
  releasePosition: Vec3;
}

/**
 * Drives core/scoring.ts's round reducer from the game events every
 * throw already produces — no new detection logic, only bookkeeping.
 * A round ends once all 6 sticks have settled (not "thrown", so the
 * reset never happens mid-flight); ending a round emits RoundEnded
 * (StatsSystem consumes it) and immediately starts the next one.
 *
 * "Longest felling throw" attribution: whichever stick(s) are
 * currently Flying when a KubbFelled/KingFelled event fires get
 * credited once they settle. In this game's actual flow (one stick
 * thrown at a time) that's almost always exactly the stick that hit
 * the piece; a rare multi-stick-in-flight edge case over-credits
 * rather than under-credits, which is the safer direction for a
 * personal-best stat.
 *
 * A manual Reset (the menu's "Ny runda" button, mid-round) abandons
 * the in-progress round rather than banking its partial progress —
 * the button's own label is literally "new round," and abandon-and-
 * retry-same-number avoids a player being able to farm partial credit
 * by resetting repeatedly. Without this, ToppleSystem's felled-piece
 * tracking clears on Reset (a piece can topple again) but this
 * system's round-scoped state didn't, so a kubb felled before a
 * manual reset stayed in `kubbsFelledThisRound` forever and silently
 * swallowed a legitimate re-fell via the reducer's own dedup guard.
 */
export class RoundSystem extends createSystem({
  sticks: { required: [StickState] },
}) {
  private roundState: RoundState = initialRoundState();
  private roundStartTimeS: number | undefined;
  private pendingThrows = new Map<string, PendingThrow>();
  private causedFellingThisThrow = new Set<string>();
  private longestThrowThisRoundM = 0;
  private longestFellingThrowThisRoundM: number | null = null;
  private unsubs: Array<() => void> = [];

  init(): void {
    this.unsubs.push(
      gameEvents.on('Thrown', (e) => {
        this.roundState = scoringReducer(this.roundState, {
          type: 'StickThrown',
        });
        this.pendingThrows.set(e.stickId, {
          releasePosition: e.releasePosition,
        });
      }),
    );
    this.unsubs.push(
      gameEvents.on('Settled', (e) => {
        this.roundState = scoringReducer(this.roundState, {
          type: 'StickSettled',
        });
        const pending = this.pendingThrows.get(e.stickId);
        if (pending) {
          const delta = sub(e.position, pending.releasePosition);
          const distanceM = Math.hypot(delta[0], delta[2]);
          this.longestThrowThisRoundM = Math.max(
            this.longestThrowThisRoundM,
            distanceM,
          );
          if (this.causedFellingThisThrow.has(e.stickId)) {
            this.longestFellingThrowThisRoundM = Math.max(
              this.longestFellingThrowThisRoundM ?? 0,
              distanceM,
            );
          }
          this.pendingThrows.delete(e.stickId);
          this.causedFellingThisThrow.delete(e.stickId);
        }
        this.maybeEndRound(e.timeS);
      }),
    );
    this.unsubs.push(
      gameEvents.on('KubbFelled', (e) => {
        this.markFlyingSticksAsCausing();
        this.roundState = scoringReducer(this.roundState, {
          type: 'KubbFelled',
          entityId: e.entityId,
        });
      }),
    );
    this.unsubs.push(
      gameEvents.on('KingFelled', () => {
        this.markFlyingSticksAsCausing();
        this.roundState = scoringReducer(this.roundState, {
          type: 'KingFelled',
        });
      }),
    );
    this.unsubs.push(
      gameEvents.on('Reset', (e) => {
        this.abandonRound(e.timeS);
      }),
    );
  }

  destroy(): void {
    for (const unsub of this.unsubs) {
      unsub();
    }
  }

  update(_delta: number, timeS: number): void {
    this.roundStartTimeS ??= timeS;
  }

  private markFlyingSticksAsCausing(): void {
    for (const entity of this.queries.sticks.entities) {
      if (entity.getValue(StickState, 'phase') === StickPhase.Flying) {
        this.causedFellingThisThrow.add(String(entity.index));
      }
    }
  }

  private maybeEndRound(timeS: number): void {
    if (!isRoundComplete(this.roundState)) {
      return;
    }
    const result = finishRound(this.roundState);
    const sticksThrownThisRound = this.roundState.sticksThrownThisRound;
    const longestThrowM = this.longestThrowThisRoundM;
    const longestFellingThrowM = this.longestFellingThrowThisRoundM;
    const roundDurationS = timeS - (this.roundStartTimeS ?? timeS);

    // Advance to the next round BEFORE emitting: MenuSystem's
    // RoundEnded handler auto-resets synchronously, which re-fires
    // our own Reset handler (abandonRound) nested inside this emit
    // call. Advancing first means that nested call re-derives from
    // the already-advanced round number (a harmless no-op) instead of
    // the just-finished one (which would abandon the round we're in
    // the middle of ending).
    this.resetRoundScopedState(nextRoundState(this.roundState), timeS);

    log('info', 'state', 'round ended', result);
    gameEvents.emit('RoundEnded', {
      result,
      sticksThrownThisRound,
      longestThrowM,
      longestFellingThrowM,
      roundDurationS,
      timeS,
    });
  }

  /** A manual reset restarts the same round number from scratch — see
   * the class doc comment for why. */
  private abandonRound(timeS: number): void {
    this.resetRoundScopedState(
      initialRoundState(this.roundState.roundNumber),
      timeS,
    );
  }

  private resetRoundScopedState(roundState: RoundState, timeS: number): void {
    this.roundState = roundState;
    this.roundStartTimeS = timeS;
    this.longestThrowThisRoundM = 0;
    this.longestFellingThrowThisRoundM = null;
    this.pendingThrows.clear();
    this.causedFellingThisThrow.clear();
  }
}
