import { z } from 'zod';

/**
 * MP3a (spec review C2): the GUEST's "Ny runda" must abort the match
 * too, but only the host is authoritative — so the guest's local
 * Reset{manual} is relayed to the host as this message, and the host
 * performs the real reset (which it then broadcasts as fresh match
 * state). Carries nothing but a version: the request IS the payload.
 */
export const RESET_RELAY_SCHEMA_VERSION = 1;

const resetRequestSchema = z.object({
  version: z.literal(RESET_RELAY_SCHEMA_VERSION),
});
export type ResetRequestMessage = z.infer<typeof resetRequestSchema>;

export function buildResetRequest(): ResetRequestMessage {
  return { version: RESET_RELAY_SCHEMA_VERSION };
}

/** Never throws — same boundary rule as every other message type. */
export function parseResetRequest(data: unknown): ResetRequestMessage | null {
  const result = resetRequestSchema.safeParse(data);
  return result.success ? result.data : null;
}
