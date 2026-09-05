import { KUBB_COUNT } from './court-layout.js';

export type MatchSide = 'host' | 'guest';
export type MatchEndReason = 'allKubbsAndKing' | 'kingFelledEarly';

export interface MatchState {
  currentTurn: MatchSide;
  /** Scene ids (`kubb-N`) of felled kubbs, keyed by the SIDE that owns/
   * defends them, in felling order. `computeCourtLayout()` lays out
   * kubb-0..4 as the far baseline (guest's side, per MP1's
   * mirrorPoseToFarBaseline() decision) and kubb-5..9 as the near
   * baseline (host's side) — see `kubbSide()`. */
  felledKubbIds: { host: string[]; guest: string[] };
  winner: MatchSide | null;
  endReason: MatchEndReason | null;
}

/**
 * MP3a (Erik, 2026-09-05, see docs/superpowers/specs/2026-09-05-match-
 * rules-design.md): a real kubb match. Felled kubbs stay down for the
 * whole match, the score is how many OPPONENT kubbs each side has
 * felled, and the king decides: felled after every opponent kubb is
 * down = the thrower wins; felled while any still stands = the thrower
 * loses. Only the host calls these transitions; the guest receives
 * whole states (core/matchSync.ts). Every transition returns the input
 * object unchanged (same reference) when nothing applies, so callers
 * can skip a broadcast with `===`.
 */
export function initialMatchState(): MatchState {
  return {
    currentTurn: 'host',
    felledKubbIds: { host: [], guest: [] },
    winner: null,
    endReason: null,
  };
}

export function otherSide(side: MatchSide): MatchSide {
  return side === 'host' ? 'guest' : 'host';
}

/** kubb-0..(kubbsPerSide-1) are the far baseline (guest's side);
 * kubb-(kubbsPerSide)..(2*kubbsPerSide-1) the near baseline (host's).
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

/** Ignored (same reference back): not a kubb id, already felled, or on
 * the THROWER's own side — a ricochet into your own baseline neither
 * scores for the opponent nor goes to the sin-bin; the round-end reset
 * stands it back up, as in real kubb (spec review I2). */
export function withKubbFelled(
  state: MatchState,
  kubbId: string,
  kubbsPerSide: number = KUBB_COUNT,
): MatchState {
  if (isFinished(state)) {
    return state;
  }
  const index = kubbIndexFromId(kubbId);
  const side = index === null ? null : kubbSide(index, kubbsPerSide);
  if (side === null || side === state.currentTurn) {
    return state;
  }
  if (state.felledKubbIds[side].includes(kubbId)) {
    return state;
  }
  return {
    ...state,
    felledKubbIds: {
      ...state.felledKubbIds,
      [side]: [...state.felledKubbIds[side], kubbId],
    },
  };
}

/** The thrower is `currentTurn` (guaranteed today by locomotion being
 * off and sticks living at exactly one rack per turn — see the spec's
 * locked assumptions). */
export function withKingFelled(
  state: MatchState,
  kubbsPerSide: number = KUBB_COUNT,
): MatchState {
  if (isFinished(state)) {
    return state;
  }
  const thrower = state.currentTurn;
  const opponent = otherSide(thrower);
  const opponentCleared = state.felledKubbIds[opponent].length >= kubbsPerSide;
  return {
    ...state,
    winner: opponentCleared ? thrower : opponent,
    endReason: opponentCleared ? 'allKubbsAndKing' : 'kingFelledEarly',
  };
}

export function withTurnAdvanced(state: MatchState): MatchState {
  if (isFinished(state)) {
    return state;
  }
  return { ...state, currentTurn: otherSide(state.currentTurn) };
}

/** Each side's score is how many of the OPPONENT's kubbs it has felled. */
export function score(state: MatchState): { host: number; guest: number } {
  return {
    host: state.felledKubbIds.guest.length,
    guest: state.felledKubbIds.host.length,
  };
}
