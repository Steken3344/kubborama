import type { Language } from './i18n.js';
import type { MatchSide, MatchState } from './match.js';
import type { RoundResult } from './scoring.js';
import type { Settings } from './settings.js';
import type { Vec3 } from './vec3.js';
import type { ThrowStyle } from './underhandClassifier.js';

export type EventHandler<T> = (payload: T) => void;
export type Unsubscribe = () => void;

/**
 * The one event bus. Scoring, stats, audio, haptics, network — every
 * system that reacts to game events subscribes here; nothing
 * count/triggers ad hoc. Generic over an app-specific event map so the
 * bus itself stays pure and reusable.
 */
export class EventBus<Events extends object> {
  private handlers: {
    [K in keyof Events]?: Set<EventHandler<Events[K]>>;
  } = {};

  on<K extends keyof Events>(
    event: K,
    handler: EventHandler<Events[K]>,
  ): Unsubscribe {
    let set = this.handlers[event];
    if (set === undefined) {
      set = new Set();
      this.handlers[event] = set;
    }
    set.add(handler);
    return () => {
      set.delete(handler);
    };
  }

  emit<K extends keyof Events>(event: K, payload: Events[K]): void {
    const set = this.handlers[event];
    if (set === undefined) {
      return;
    }
    for (const handler of set) {
      handler(payload);
    }
  }
}

/**
 * The app's typed game events. Grows as milestones add producers (M3
 * adds KubbFelled/KingFelled/RoundEnded, etc.) — only define an event
 * here once something actually emits it.
 */
export interface GameEvents {
  Thrown: {
    stickId: string;
    handId: 'left' | 'right';
    releaseSpeedMps: number;
    releaseVelocity: Vec3;
    angularVelocity: Vec3;
    releasePosition: Vec3;
    style: ThrowStyle;
    flipQualityScore: number;
    presetId: 'A' | 'B' | 'C';
    timeS: number;
  };
  Settled: {
    stickId: string;
    position: Vec3;
    timeS: number;
  };
  Impact: {
    entityId: string;
    forceMagnitude: number;
    position: Vec3;
    timeS: number;
  };
  Reset: {
    timeS: number;
    // 'roundEnd' is RoundSystem's own auto-continuation (MenuSystem's
    // RoundEnded handler resets pieces for the next round) — distinct
    // from a genuine 'manual' reset (Reset button, or a mode-switch
    // relayout) so a listener that owns cross-round state (e.g.
    // MultiplayerSystem's MatchState) can tell "next round" apart from
    // "wipe everything." See docs/DECISIONS.md, 2026-09-02.
    cause: 'manual' | 'roundEnd';
  };
  KubbFelled: {
    entityId: string;
    position: Vec3;
    timeS: number;
  };
  KingFelled: {
    position: Vec3;
    timeS: number;
  };
  RoundEnded: {
    result: RoundResult;
    sticksThrownThisRound: number;
    longestThrowM: number;
    longestFellingThrowM: number | null;
    roundDurationS: number;
    timeS: number;
  };
  LanguageChanged: {
    language: Language;
  };
  GameModeChanged: {
    gameMode: Settings['gameMode'];
  };
  /** MP2 phase 3 — only emitted once an actual multiplayer peer is
   * connected (see systems/multiplayer.ts), never during solo play.
   * `mySide` is which side the LOCAL player is on, so a listener
   * (HudSystem) never needs to ask MultiplayerSystem who's host. */
  MatchStateChanged: {
    state: MatchState;
    mySide: MatchSide;
  };
  /** The room emptied out (the last multiplayer peer left) — a listener
   * showing anything gated on an opponent being present (HudSystem's
   * match-row/role-row) must hide it again, or it goes stale into
   * subsequent solo play. Code review, 2026-09-02 (gh#10): MatchState-
   * Changed alone can't express "no match anymore," it only ever
   * carries a real state. */
  MultiplayerPeerDisconnected: Record<string, never>;
}

export const gameEvents = new EventBus<GameEvents>();
