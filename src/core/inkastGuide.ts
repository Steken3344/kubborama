import { halfBounds } from './inkast.js';
import type { CourtHalves } from './inkast.js';
import { isFinished, otherSide } from './match.js';
import type { MatchSide, MatchState } from './match.js';

export interface GuideRect {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

/**
 * Backyard inkast aid (Erik approved, 2026-11-01, from the 20-match bot
 * series: 28% of backyard inkast tosses landed out against 4% on the
 * tournament court). While it is MY inkast, the half I must toss into —
 * the opponent's — is outlined on the grass. Only in the listed game
 * modes (src/data/inkast-guide.json); null means "hide it".
 */
export function inkastGuideRect(
  state: MatchState | null,
  mySide: MatchSide | null,
  gameMode: string,
  halves: CourtHalves,
  gameModes: readonly string[],
): GuideRect | null {
  if (
    !state ||
    mySide === null ||
    isFinished(state) ||
    state.phase !== 'inkast' ||
    state.currentTurn !== mySide ||
    !gameModes.includes(gameMode)
  ) {
    return null;
  }
  const { minZ, maxZ } = halfBounds(halves, otherSide(mySide));
  return { minX: -halves.halfWidthM, maxX: halves.halfWidthM, minZ, maxZ };
}
