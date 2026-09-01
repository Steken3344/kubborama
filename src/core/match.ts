import { KUBB_COUNT } from './court-layout.js';

export type MatchSide = 'host' | 'guest';

export interface MatchState {
  currentTurn: MatchSide;
  /** Kubbs defending each side, still standing. `computeCourtLayout()`
   * lays out kubb-0..4 as the far baseline and kubb-5..9 as the near
   * baseline; per MP1's mirrorPoseToFarBaseline() decision the guest
   * appears at the far baseline, so guest defends kubb-0..4 and host
   * defends kubb-5..9 — see `kubbSide()`. */
  hostKubbsRemaining: number;
  guestKubbsRemaining: number;
  winner: MatchSide | null;
}

/**
 * MP2 phase 3 (Erik, 2026-09-01: "riktig match, varsin sida"). A
 * DELIBERATE simplification, not an oversight: real kubb's win move is
 * felling the king, but the king is protected GLOBALLY (all 10 kubbs,
 * both sides) by the existing `SimpleRulesSystem`/`KingProtected` —
 * built for one practicing player, with no notion of "which side" is
 * attacking. Reworking that into a per-side protection model is a
 * separate, careful piece of work, not something to improvise on top
 * of the whole multiplayer stack in one pass. Phase 3 v1's win
 * condition is instead "clear the opponent's kubbs first" — still a
 * real, understandable win, and a documented, honest cut rather than a
 * silently-missing feature. See docs/DECISIONS.md.
 */
export function initialMatchState(
  kubbsPerSide: number = KUBB_COUNT,
): MatchState {
  return {
    currentTurn: 'host',
    hostKubbsRemaining: kubbsPerSide,
    guestKubbsRemaining: kubbsPerSide,
    winner: null,
  };
}

export function otherSide(side: MatchSide): MatchSide {
  return side === 'host' ? 'guest' : 'host';
}

/** kubb-0..(kubbsPerSide-1) are the far baseline (guest's side);
 * kubb-(kubbsPerSide)..(2*kubbsPerSide-1) are the near baseline
 * (host's side) — see MatchState's doc comment. `null` for an
 * out-of-range index (defensive; every real kubb id is in range). */
export function kubbSide(
  kubbIndex: number,
  kubbsPerSide: number = KUBB_COUNT,
): MatchSide | null {
  if (kubbIndex < 0 || kubbIndex >= kubbsPerSide * 2) {
    return null;
  }
  return kubbIndex < kubbsPerSide ? 'guest' : 'host';
}

/** A felled kubb only ever counts once — calling this again for a
 * kubb whose side is already at 0 is a safe no-op (defensive against
 * a duplicate event, not expected in normal play). */
export function withKubbFelled(state: MatchState, side: MatchSide): MatchState {
  if (state.winner) {
    return state;
  }
  if (side === 'host') {
    if (state.hostKubbsRemaining <= 0) {
      return state;
    }
    const hostKubbsRemaining = state.hostKubbsRemaining - 1;
    return {
      ...state,
      hostKubbsRemaining,
      winner: hostKubbsRemaining === 0 ? 'guest' : state.winner,
    };
  }
  if (state.guestKubbsRemaining <= 0) {
    return state;
  }
  const guestKubbsRemaining = state.guestKubbsRemaining - 1;
  return {
    ...state,
    guestKubbsRemaining,
    winner: guestKubbsRemaining === 0 ? 'host' : state.winner,
  };
}

export function withTurnAdvanced(state: MatchState): MatchState {
  if (state.winner) {
    return state;
  }
  return { ...state, currentTurn: otherSide(state.currentTurn) };
}
