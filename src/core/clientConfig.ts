import { z } from 'zod';

/**
 * What a KubbOrama server tells the headset at boot (GET
 * /__kubb/config.json — server/httpRoutes.ts). Its presence is the
 * signal "a game server lives here"; absent (the static GitHub Pages
 * build) the client keeps the serverless mode. Parsed like any other
 * network input.
 */
const clientConfigSchema = z.object({
  server: z.literal(true),
  protocol: z.number().int().positive(),
  room: z.string().min(1).max(64),
  debug: z.boolean(),
});
export type ClientConfig = z.infer<typeof clientConfigSchema>;

export function parseClientConfig(data: unknown): ClientConfig | null {
  const result = clientConfigSchema.safeParse(data);
  return result.success ? result.data : null;
}
