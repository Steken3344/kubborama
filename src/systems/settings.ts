import { createSystem } from '@iwsdk/core';
import { gameEvents } from '../core/events.js';
import type { Language } from '../core/i18n.js';
import {
  decodeSettings,
  defaultSettings,
  encodeSettings,
} from '../core/settings.js';
import type { Settings } from '../core/settings.js';
import { disableDebugRelay, enableDebugRelay } from '../debug/debugRelay.js';
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
  /** gh#15: the player's own game mode while a multiplayer guest plays
   * on the host's (adoptMatchGameMode) — null when no override is
   * active. persist() always writes this, never the borrowed mode. */
  private preferredGameMode: Settings['gameMode'] | null = null;

  init(): void {
    settingsState.current = loadSettings();
    refreshTranslator();
    // Debug mode persisted from the settings tab — a no-op in the
    // production build (see src/debug/debugRelay.ts).
    if (settingsState.current.debugRelay) {
      enableDebugRelay();
    }
  }

  setDebugRelay(debugRelay: boolean): void {
    settingsState.current = { ...settingsState.current, debugRelay };
    this.persist();
    if (debugRelay) {
      enableDebugRelay();
    } else {
      disableDebugRelay();
    }
  }

  private persist(): void {
    saveSettings(
      this.preferredGameMode === null
        ? settingsState.current
        : { ...settingsState.current, gameMode: this.preferredGameMode },
    );
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
    // An explicit choice replaces any borrowed match mode.
    this.preferredGameMode = null;
    settingsState.current = { ...settingsState.current, gameMode };
    this.persist();
    gameEvents.emit('GameModeChanged', { gameMode });
  }

  /** gh#15: a multiplayer guest plays on the host's court. Applied live
   * (same GameModeChanged relayout as the button) but never persisted;
   * releaseMatchGameMode() restores the player's own mode. */
  /** True while a borrowed match mode is active — MenuSystem locks the
   * game-mode button then too, since matchActivity only turns on a
   * network round trip AFTER the adoption (review, 2026-09-26). */
  isGameModeBorrowed(): boolean {
    return this.preferredGameMode !== null;
  }

  adoptMatchGameMode(gameMode: Settings['gameMode']): void {
    this.preferredGameMode ??= settingsState.current.gameMode;
    this.applyUnpersistedGameMode(gameMode);
  }

  releaseMatchGameMode(): void {
    const preferred = this.preferredGameMode;
    if (preferred === null) {
      return;
    }
    this.preferredGameMode = null;
    this.applyUnpersistedGameMode(preferred);
  }

  private applyUnpersistedGameMode(gameMode: Settings['gameMode']): void {
    if (settingsState.current.gameMode === gameMode) {
      return;
    }
    settingsState.current = { ...settingsState.current, gameMode };
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

  setAvatarColorIndex(avatarColorIndex: number): void {
    settingsState.current = { ...settingsState.current, avatarColorIndex };
    this.persist();
  }
}
