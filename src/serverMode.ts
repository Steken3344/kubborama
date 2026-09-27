import { serverModeActive } from './core/settings.js';
import { settingsState } from './settingsState.js';

/**
 * MP5: does this client play through the game server? 'auto' means yes
 * when running from the dev server (`import.meta.env.DEV`), where the
 * game server runs alongside Vite — Erik: "alltid en server om inget
 * annat är satt". The static GitHub Pages build has no server until
 * MP8, so there 'auto' keeps the serverless Trystero host.
 */
export function isServerModeOn(): boolean {
  return serverModeActive(
    settingsState.current.serverChoice,
    import.meta.env.DEV,
  );
}
