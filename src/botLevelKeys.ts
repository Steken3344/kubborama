import type { BotLevel } from './config.js';

/** i18n key per bot level — the menu's opponent button and the TV
 * scoreboard's bot name both show it. */
export const BOT_LEVEL_KEYS = {
  easy: 'botLevelEasy',
  medium: 'botLevelMedium',
  hard: 'botLevelHard',
} as const satisfies Record<BotLevel, string>;
