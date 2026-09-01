import { createSystem } from '@iwsdk/core';
import { gameEvents } from '../core/events.js';
import type { Language } from '../core/i18n.js';
import {
  decodeSettings,
  defaultSettings,
  encodeSettings,
} from '../core/settings.js';
import type { Settings } from '../core/settings.js';
import { refreshTranslator } from '../i18nState.js';
import { settingsState } from '../settingsState.js';

const SETTINGS_STORAGE_KEY = 'kubborama.settings.v1';

function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
    return raw ? decodeSettings(raw) : defaultSettings();
  } catch {
    return defaultSettings();
  }
}

function saveSettings(settings: Settings): void {
  try {
    localStorage.setItem(SETTINGS_STORAGE_KEY, encodeSettings(settings));
  } catch {
    // localStorage unavailable (private mode, quota) — settings stay
    // in-memory only for this session.
  }
}

/**
 * Owns loading/persisting player settings into the shared
 * settingsState singleton (read directly by ToppleSystem, WindSystem,
 * ThrowingSystem/ImpactSystem's haptics) and the language ->
 * translator wiring. UI (MenuSystem's language/game-mode buttons)
 * calls the setters here directly, same pattern as HudSystem already
 * reading StatsSystem — this is a UI action dispatch, not the
 * scoring/stats/haptics event-bus traffic CLAUDE.md's "one event bus"
 * rule is about.
 */
export class SettingsSystem extends createSystem({}) {
  init(): void {
    settingsState.current = loadSettings();
    refreshTranslator();
  }

  private persist(): void {
    saveSettings(settingsState.current);
  }

  setLanguage(language: Language): void {
    settingsState.current = { ...settingsState.current, language };
    refreshTranslator();
    this.persist();
    gameEvents.emit('LanguageChanged', { language });
  }

  toggleLanguage(): void {
    this.setLanguage(settingsState.current.language === 'sv' ? 'en' : 'sv');
  }

  setGameMode(gameMode: Settings['gameMode']): void {
    settingsState.current = { ...settingsState.current, gameMode };
    this.persist();
    gameEvents.emit('GameModeChanged', { gameMode });
  }

  toggleGameMode(): void {
    this.setGameMode(
      settingsState.current.gameMode === 'simple' ? 'advanced' : 'simple',
    );
  }

  setHapticsEnabled(hapticsEnabled: boolean): void {
    settingsState.current = { ...settingsState.current, hapticsEnabled };
    this.persist();
  }

  setHapticsIntensityPercent(hapticsIntensityPercent: number): void {
    settingsState.current = {
      ...settingsState.current,
      hapticsIntensityPercent,
    };
    this.persist();
  }

  setMusicVolumePercent(musicVolumePercent: number): void {
    settingsState.current = { ...settingsState.current, musicVolumePercent };
    this.persist();
  }

  setSfxVolumePercent(sfxVolumePercent: number): void {
    settingsState.current = { ...settingsState.current, sfxVolumePercent };
    this.persist();
  }

  setCourtLinesVisible(courtLinesVisible: boolean): void {
    settingsState.current = { ...settingsState.current, courtLinesVisible };
    this.persist();
  }

  setProfileName(profileName: string | null): void {
    settingsState.current = { ...settingsState.current, profileName };
    this.persist();
  }

  setMicMuted(micMuted: boolean): void {
    settingsState.current = { ...settingsState.current, micMuted };
    this.persist();
  }
}
