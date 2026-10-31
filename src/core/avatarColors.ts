import type { MatchSide } from './match.js';

/**
 * Which avatar colors are SHOWN when both players picked the same one
 * (2026-10-31: both headsets on the default color made two red bodies).
 * Each player still sends their own choice; on a clash side B (guest)
 * wears the next palette color. Both headsets apply this same rule to
 * the same two inputs, so they always agree on who wears what — the
 * avatar (PeerAvatarSystem) and the HUD score digits both go through it.
 * The menu still names the player's own CHOICE.
 *
 * Indices are clamped onto the palette first, so an out-of-range remote
 * index clashes exactly when its displayed color would.
 */
export function shownAvatarColors(input: {
  mine: number;
  theirs: number | null;
  mySide: MatchSide | null;
  paletteSize: number;
}): { mine: number; theirs: number | null } {
  const last = Math.max(0, input.paletteSize - 1);
  const clamp = (i: number) => Math.min(Math.max(0, Math.trunc(i)), last);
  const mine = clamp(input.mine);
  if (input.theirs === null) {
    return { mine, theirs: null };
  }
  const theirs = clamp(input.theirs);
  if (input.mySide === null || mine !== theirs || input.paletteSize < 2) {
    return { mine, theirs };
  }
  const shifted = (mine + 1) % input.paletteSize;
  return input.mySide === 'guest'
    ? { mine: shifted, theirs }
    : { mine, theirs: shifted };
}
