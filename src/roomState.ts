import type { MatchSide } from './core/match.js';
import type { BotLevelName, RoomRules } from './core/serverProtocol.js';

/** The game server's room settings beside the court (2026-11-01), as
 * ServerLinkSystem last heard them — the menu's labels and the HUD clock
 * read it. Same shared-singleton pattern as settingsState.ts. */
export const roomState: {
  timeLimitMin: number;
  bot: BotLevelName | null;
  rules: RoomRules;
  clock: { remainingS: number; timeUp: boolean } | null;
  /** My seat on the game server (welcome), null when not seated. */
  seatSide: MatchSide | null;
} = {
  timeLimitMin: 0,
  bot: null,
  rules: 'standard',
  seatSide: null,
  clock: null,
};
