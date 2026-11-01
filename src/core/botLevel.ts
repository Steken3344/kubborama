import { z } from 'zod';

/** The single-player bot's levels (src/data/bot.json — a test keeps the
 * two in step). Its own module: the protocol and the profiles both use
 * it, and the protocol already imports the profiles. */
export const botLevelSchema = z.enum(['easy', 'medium', 'hard']);
export type BotLevelName = z.infer<typeof botLevelSchema>;
