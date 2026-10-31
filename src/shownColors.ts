import { avatarPalette } from './config.js';
import { shownAvatarColors } from './core/avatarColors.js';
import type { MatchSide } from './core/match.js';
import { settingsState } from './settingsState.js';

/** The avatar colors as shown on THIS headset — my settings choice and
 * the opponent's presence choice, a clash resolved by
 * core/avatarColors.ts. The one entry point for PeerAvatarSystem (the
 * body) and HudSystem (the score digits), so the two can never drift
 * apart (review, 2026-10-31). */
/** Through the game server the SERVER hands out the shown colours
 * (2026-10-31): set by ServerLinkSystem from its `colors` message,
 * null otherwise (serverless play resolves the clash locally). */
export const serverShownColors: {
  current: { host: number | null; guest: number | null } | null;
} = { current: null };

export function shownColorsFor(
  theirs: number | null,
  mySide: MatchSide | null,
): { mine: number; theirs: number | null } {
  const assigned = serverShownColors.current;
  if (assigned && mySide) {
    const mine = assigned[mySide];
    const other = assigned[mySide === 'host' ? 'guest' : 'host'];
    if (mine !== null) {
      return { mine, theirs: other ?? theirs };
    }
  }
  return shownAvatarColors({
    mine: settingsState.current.avatarColorIndex,
    theirs,
    mySide,
    paletteSize: avatarPalette.length,
  });
}
