import type { BotLevelName } from './core/serverProtocol.js';

/** The game server's room settings beside the court (2026-11-01), as
 * ServerLinkSystem last heard them — the menu's labels and the HUD clock
 * read it. Same shared-singleton pattern as settingsState.ts. */
export const roomState: {
  timeLimitMin: number;
  bot: BotLevelName | null;
  clock: { remainingS: number; timeUp: boolean } | null;
} = {
  timeLimitMin: 0,
  bot: null,
  clock: null,
};
