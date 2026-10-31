import { isFinished, otherSide, standingKubbs } from './match.js';
import type { MatchPhase, MatchSide, MatchState } from './match.js';

/** One side as the spectator's scoreboard shows it. */
export interface ScoreboardSide {
  name: string | null;
  colorIndex: number | null;
  /** Kubbs this player still has to knock down before the king: the
   * ones standing in the OPPONENT's half (baseline + field). Showing the
   * own half's count read as the wrong player's progress (bot match,
   * 2026-10-31: field kubbs tossed into A's half made A look behind). */
  toFell: number;
}

export interface Scoreboard {
  host: ScoreboardSide;
  guest: ScoreboardSide;
  turn: MatchSide | null;
  phase: MatchPhase | null;
  winner: MatchSide | null;
}

export type PlayersInfo = Record<
  MatchSide,
  { name: string | null; colorIndex: number } | null
>;

/** What the TV scoreboard shows (docs/superpowers/specs/2026-10-31-
 * spectator-tv-design.md): pure, from the server's match state and the
 * players' profile names and shown colours. No match → just the names. */
export function scoreboardFor(
  state: MatchState | null,
  players: PlayersInfo,
): Scoreboard {
  const standing = state ? standingKubbs(state) : { host: 5, guest: 5 };
  const side = (s: MatchSide): ScoreboardSide => ({
    name: players[s]?.name ?? null,
    colorIndex: players[s]?.colorIndex ?? null,
    toFell: standing[otherSide(s)],
  });
  const finished = state ? isFinished(state) : false;
  return {
    host: side('host'),
    guest: side('guest'),
    turn: state && !finished ? state.currentTurn : null,
    phase: state && !finished ? state.phase : null,
    winner: state?.winner ?? null,
  };
}
