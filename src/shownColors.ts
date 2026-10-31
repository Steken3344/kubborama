import { avatarPalette } from './config.js';
import { shownAvatarColors } from './core/avatarColors.js';
import type { MatchSide } from './core/match.js';
import { settingsState } from './settingsState.js';

/** The avatar colors as shown on THIS headset — my settings choice and
 * the opponent's presence choice, a clash resolved by
 * core/avatarColors.ts. The one entry point for PeerAvatarSystem (the
 * body) and HudSystem (the score digits), so the two can never drift
 * apart (review, 2026-10-31). */
export function shownColorsFor(
  theirs: number | null,
  mySide: MatchSide | null,
): { mine: number; theirs: number | null } {
  return shownAvatarColors({
    mine: settingsState.current.avatarColorIndex,
    theirs,
    mySide,
    paletteSize: avatarPalette.length,
  });
}
