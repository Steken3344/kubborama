import { parseClientConfig } from './core/clientConfig.js';
import type { ClientConfig } from './core/clientConfig.js';

/** Give up on the config after this long (a static host may hang). */
const CONFIG_TIMEOUT_MS = 2000;
const CONFIG_URL = '__kubb/config.json';

/**
 * The server's answer to "is there a game server here?" — fetched once
 * at boot, BEFORE the world and its systems are built (src/index.ts), so
 * every system reads a settled value. null = no server (static build).
 * Erik, 2026-10-31: "surfa in på en adress, då skall headseten få själva
 * spelet och konfigurationen var servern är".
 */
export const serverConfig: { current: ClientConfig | null } = {
  current: null,
};

export async function loadServerConfig(): Promise<void> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CONFIG_TIMEOUT_MS);
  try {
    const response = await fetch(CONFIG_URL, {
      signal: controller.signal,
      cache: 'no-store',
    });
    serverConfig.current = response.ok
      ? parseClientConfig(await response.json())
      : null;
  } catch {
    serverConfig.current = null;
  } finally {
    clearTimeout(timer);
  }
}
