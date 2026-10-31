import { serverModeActive } from './core/settings.js';
import { serverConfig } from './serverConfig.js';
import { settingsState } from './settingsState.js';

/**
 * MP5: does this client play through the game server? 'auto' means yes
 * whenever the page came from a KubbOrama server (its /__kubb/config.json
 * answered — src/serverConfig.ts), where the
 * game server runs alongside Vite — Erik: "alltid en server om inget
 * annat är satt". The static GitHub Pages build has no server until
 * MP8, so there 'auto' keeps the serverless Trystero host.
 */
export function isServerModeOn(): boolean {
  return serverModeActive(
    settingsState.current.serverChoice,
    serverConfig.current !== null,
  );
}
