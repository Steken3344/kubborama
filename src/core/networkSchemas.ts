import { z } from 'zod';

/**
 * Shared zod primitives for every multiplayer wire format
 * (core/presence.ts, core/pieceSync.ts, core/throwRelay.ts) — DRY per
 * CLAUDE.md: this was about to be the third copy of the same two
 * schemas.
 */
export const vec3Schema = z.tuple([z.number(), z.number(), z.number()]);
export const quaternionSchema = z.tuple([
  z.number(),
  z.number(),
  z.number(),
  z.number(),
]);
