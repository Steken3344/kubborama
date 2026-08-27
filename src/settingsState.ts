import { defaultSettings } from './core/settings.js';
import type { Settings } from './core/settings.js';

/** Shared mutable settings singleton — same pattern as tuningState.ts's
 * presetBank. SettingsSystem owns loading/persisting it; any system
 * that needs a live setting (game mode, haptics, language) reads
 * `settingsState.current` directly. */
export const settingsState: { current: Settings } = {
  current: defaultSettings(),
};
