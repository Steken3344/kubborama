import { KUBB_COUNT } from './court-layout.js';
import {
  clampIntoHalf,
  halfBounds,
  isLegalLanding,
  nudgeClear,
} from './inkast.js';
import type { CourtHalves, CourtPoint } from './inkast.js';

export type MatchSide = 'host' | 'guest';
export type MatchPhase = 'inkast' | 'throwing';
export type MatchEndReason =
  'allKubbsAndKing' | 'kingFelledEarly' | 'kingFelledByInkast';
/** Why a kubb is stood up again — carried to the gate log. */
export type RaiseReason =
  'inkast' | 'inkastClamped' | 'inkastHit' | 'earlyBaseline' | 'rebound';

/** A standing kubb that was tossed in; belongs to the half it stands on. */
export interface FieldKubb {
  kubbId: string;
  half: MatchSide;
  x: number;
  z: number;
}

export interface InkastItem {
  kubbId: string;
  attempt: 1 | 2;
}

export interface MatchState {
  currentTurn: MatchSide;
  phase: MatchPhase;
  /** STANDING baseline kubbs, keyed by the half whose baseline they are
   * on. `computeCourtLayout()` lays out kubb-0..4 on the far baseline
   * (guest half) and kubb-5..9 on the near one (host half). */
  baselineKubbs: { host: string[]; guest: string[] };
  fieldKubbs: FieldKubb[];
  /** Kubbs the current thrower has legitimately felled on the target
   * half this turn — the next thrower's inkast queue. */
  felledThisTurn: string[];
  /** Kubbs the current thrower still has to toss (phase 'inkast'). */
  inkastQueue: InkastItem[];
  winner: MatchSide | null;
  endReason: MatchEndReason | null;
}

/** Physical instructions for the host's MatchRulesSystem: the reducer
 * decides, the adapter moves bodies. */
export type MatchEffect =
  | { type: 'raise'; kubbId: string; x: number; z: number; reason: RaiseReason }
  | { type: 'restoreHome'; kubbId: string; reason: RaiseReason }
  | { type: 'returnToRack'; kubbId: string };

export interface MatchStep {
  state: MatchState;
  effects: readonly MatchEffect[];
}

export interface InkastOptions {
  insetM: number;
  minSeparationM: number;
}

const NO_EFFECTS: readonly MatchEffect[] = Object.freeze([]);

function unchanged(state: MatchState): MatchStep {
  return { state, effects: NO_EFFECTS };
}

/**
 * MP4 (docs/superpowers/specs/2026-09-26-field-kubbs-design.md, rule
 * numbers below refer to its "Rules as implemented"): the real kubb turn
 * loop. A turn is an inkast of the kubbs felled last turn, then six
 * batons at the TARGET half (the opponent's). Kubbs belong to the half
 * they stand on. Only the host calls these transitions; the guest
 * receives whole states (core/matchSync.ts). Every transition returns
 * the input object unchanged (same reference) when nothing applies, so
 * callers can skip a broadcast with `===`.
 */
export function initialMatchState(
  kubbsPerSide: number = KUBB_COUNT,
): MatchState {
  const guest: string[] = [];
  const host: string[] = [];
  for (let i = 0; i < kubbsPerSide * 2; i++) {
    (kubbSide(i, kubbsPerSide) === 'guest' ? guest : host).push(kubbId(i));
  }
  return {
    currentTurn: 'host',
    phase: 'throwing',
    baselineKubbs: { host, guest },
    fieldKubbs: [],
    felledThisTurn: [],
    inkastQueue: [],
    winner: null,
    endReason: null,
  };
}

export function otherSide(side: MatchSide): MatchSide {
  return side === 'host' ? 'guest' : 'host';
}

/** True only on the broadcast where the turn flips TO `side` — a repeat
 * of the same turn, a flip away, or the very first known turn (`prev`
 * null) are all false. RoundSystem uses it to start `side`'s own round
 * clean (gh#16): kubbs felled during the opponent's turn must not be
 * credited to the next local round. */
export function turnPassedTo(
  prev: MatchSide | null,
  next: MatchSide,
  side: MatchSide,
): boolean {
  return prev !== null && prev !== next && next === side;
}

/** kubb-0..(kubbsPerSide-1) start on the far baseline (guest half);
 * kubb-(kubbsPerSide)..(2*kubbsPerSide-1) on the near one (host half).
 * `null` for an out-of-range index. */
export function kubbSide(
  kubbIndex: number,
  kubbsPerSide: number = KUBB_COUNT,
): MatchSide | null {
  if (kubbIndex < 0 || kubbIndex >= kubbsPerSide * 2) {
    return null;
  }
  return kubbIndex < kubbsPerSide ? 'guest' : 'host';
}

/** The scene id of the Nth kubb — the one place the `kubb-N` naming
 * lives, paired with kubbIndexFromId() below. */
export function kubbId(index: number): string {
  return `kubb-${index}`;
}

/** `kubb-7` → 7; anything that isn't a kubb scene id → null. */
export function kubbIndexFromId(id: string): number | null {
  const match = /^kubb-(\d+)$/u.exec(id);
  return match ? Number(match[1]) : null;
}

export function isFinished(state: MatchState): boolean {
  return state.winner !== null;
}

/** Standing kubbs per half (baseline + field) — the HUD's per-side
 * number, and 0 on the target half is what makes the king a win. */
export function standingKubbs(state: MatchState): {
  host: number;
  guest: number;
} {
  const count = (side: MatchSide) =>
    state.baselineKubbs[side].length +
    state.fieldKubbs.filter((k) => k.half === side).length;
  return { host: count('host'), guest: count('guest') };
}

/** Where a standing kubb is: a baseline of some half, a field kubb, or
 * nowhere (felled, queued, or not a kubb id). */
function locate(
  state: MatchState,
  id: string,
): { kind: 'baseline' | 'field'; half: MatchSide } | null {
  for (const side of ['host', 'guest'] as const) {
    if (state.baselineKubbs[side].includes(id)) {
      return { kind: 'baseline', half: side };
    }
  }
  const field = state.fieldKubbs.find((k) => k.kubbId === id);
  return field ? { kind: 'field', half: field.half } : null;
}

function withFieldKubbMoved(
  state: MatchState,
  id: string,
  x: number,
  z: number,
): MatchState {
  return {
    ...state,
    fieldKubbs: state.fieldKubbs.map((k) =>
      k.kubbId === id ? { ...k, x, z } : k,
    ),
  };
}

/** Rules 4–6. `x`/`z` is where the kubb came to rest. */
export function withKubbFelled(
  state: MatchState,
  id: string,
  x: number,
  z: number,
): MatchStep {
  if (isFinished(state)) {
    return unchanged(state);
  }
  const where = locate(state, id);
  if (!where) {
    return unchanged(state);
  }
  const target = otherSide(state.currentTurn);
  // Rule 4 (inkast hit) and rule 6 (own-side rebound): stand it back up,
  // count nothing. A field kubb is raised where it lies, a baseline kubb
  // goes back to its baseline spot.
  const reraise: RaiseReason | null =
    state.phase === 'inkast'
      ? 'inkastHit'
      : where.half !== target
        ? 'rebound'
        : null;
  if (reraise !== null) {
    return where.kind === 'field'
      ? {
          state: withFieldKubbMoved(state, id, x, z),
          effects: [{ type: 'raise', kubbId: id, x, z, reason: reraise }],
        }
      : {
          state,
          effects: [{ type: 'restoreHome', kubbId: id, reason: reraise }],
        };
  }
  if (where.kind === 'field') {
    return {
      state: {
        ...state,
        fieldKubbs: state.fieldKubbs.filter((k) => k.kubbId !== id),
        felledThisTurn: [...state.felledThisTurn, id],
      },
      effects: NO_EFFECTS,
    };
  }
  // Rule 5: field kubbs first.
  if (state.fieldKubbs.some((k) => k.half === target)) {
    return {
      state,
      effects: [{ type: 'restoreHome', kubbId: id, reason: 'earlyBaseline' }],
    };
  }
  return {
    state: {
      ...state,
      baselineKubbs: {
        ...state.baselineKubbs,
        [target]: state.baselineKubbs[target].filter((k) => k !== id),
      },
      felledThisTurn: [...state.felledThisTurn, id],
    },
    effects: NO_EFFECTS,
  };
}

/** Rules 2–3: a tossed kubb came to rest at `x`/`z`. `standing` are the
 * positions of every other standing piece, for the raise nudge. */
export function withInkastLanded(
  state: MatchState,
  id: string,
  x: number,
  z: number,
  halves: CourtHalves,
  standing: ReadonlyArray<CourtPoint>,
  opts: InkastOptions,
): MatchStep {
  if (isFinished(state) || state.phase !== 'inkast') {
    return unchanged(state);
  }
  const item = state.inkastQueue.find((i) => i.kubbId === id);
  if (!item) {
    return unchanged(state);
  }
  const target = otherSide(state.currentTurn);
  const legal = isLegalLanding(halves, target, x, z);
  if (!legal && item.attempt === 1) {
    return {
      state: {
        ...state,
        inkastQueue: state.inkastQueue.map((i) =>
          i.kubbId === id ? { kubbId: id, attempt: 2 } : i,
        ),
      },
      effects: [{ type: 'returnToRack', kubbId: id }],
    };
  }
  const spot = legal
    ? { x, z }
    : clampIntoHalf(halves, target, x, z, opts.insetM);
  const raised = nudgeClear(spot, standing, opts.minSeparationM, halves);
  const inkastQueue = state.inkastQueue.filter((i) => i.kubbId !== id);
  return {
    state: {
      ...state,
      fieldKubbs: [
        ...state.fieldKubbs,
        { kubbId: id, half: target, x: raised.x, z: raised.z },
      ],
      inkastQueue,
      phase: inkastQueue.length === 0 ? 'throwing' : 'inkast',
    },
    effects: [
      {
        type: 'raise',
        kubbId: id,
        x: raised.x,
        z: raised.z,
        reason: legal ? 'inkast' : 'inkastClamped',
      },
    ],
  };
}

/** Rules 4 and 9. The thrower is `currentTurn` (locomotion is off and
 * sticks live at exactly one rack per turn); during the inkast the
 * thrower IS the tosser. `phaseWhenFelled` is the phase at the moment
 * the king fell: the host defers the decision, and the last tossed kubb
 * can land (phase → throwing) inside that grace (review, 2026-09-26). */
export function withKingFelled(
  state: MatchState,
  phaseWhenFelled: MatchPhase = state.phase,
): MatchState {
  if (isFinished(state)) {
    return state;
  }
  const thrower = state.currentTurn;
  const opponent = otherSide(thrower);
  if (phaseWhenFelled === 'inkast') {
    return { ...state, winner: opponent, endReason: 'kingFelledByInkast' };
  }
  const cleared = standingKubbs(state)[opponent] === 0;
  return {
    ...state,
    winner: cleared ? thrower : opponent,
    endReason: cleared ? 'allKubbsAndKing' : 'kingFelledEarly',
  };
}

/** Rule 10: the felled kubbs become the next thrower's inkast queue. */
export function withTurnAdvanced(state: MatchState): MatchState {
  if (isFinished(state)) {
    return state;
  }
  const inkastQueue: InkastItem[] = state.felledThisTurn.map((kubbId) => ({
    kubbId,
    attempt: 1,
  }));
  return {
    ...state,
    currentTurn: otherSide(state.currentTurn),
    phase: inkastQueue.length > 0 ? 'inkast' : 'throwing',
    felledThisTurn: [],
    inkastQueue,
  };
}

/** Rule 8: the z of `side`'s own-half field kubb closest to the centre
 * line, or null when none stands there. */
export function advantageLineZ(
  state: MatchState,
  side: MatchSide,
  halves: CourtHalves,
): number | null {
  let best: number | null = null;
  for (const k of state.fieldKubbs) {
    if (k.half !== side) {
      continue;
    }
    if (
      best === null ||
      Math.abs(k.z - halves.centreZ) < Math.abs(best - halves.centreZ)
    ) {
      best = k.z;
    }
  }
  if (best === null) {
    return null;
  }
  // Keep the line on the court even for a field kubb raised on a line.
  const { minZ, maxZ } = halfBounds(halves, side);
  return Math.min(maxZ, Math.max(minZ, best));
}
