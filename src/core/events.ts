import type { Language } from './i18n.js';
import type { RoundResult } from './scoring.js';
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
  };
  KubbFelled: {
    entityId: string;
    timeS: number;
  };
  KingFelled: {
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
}

export const gameEvents = new EventBus<GameEvents>();
