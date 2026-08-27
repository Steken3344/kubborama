import { describe, expect, it } from 'vitest';
import { decodeSettings, defaultSettings, encodeSettings } from './settings.js';

describe('defaultSettings', () => {
  it('starts in Swedish, simple mode, haptics on, no profile name yet', () => {
    const settings = defaultSettings();
    expect(settings.language).toBe('sv');
    expect(settings.gameMode).toBe('simple');
    expect(settings.hapticsEnabled).toBe(true);
    expect(settings.profileName).toBeNull();
    expect(settings.courtLinesVisible).toBe(false);
  });
});

describe('encode/decode', () => {
  it('round-trips through JSON', () => {
    const settings = { ...defaultSettings(), language: 'en' as const };
    expect(decodeSettings(encodeSettings(settings))).toEqual(settings);
  });

  it('never throws on corrupt or unversioned data — falls back to defaults', () => {
    expect(decodeSettings('not json')).toEqual(defaultSettings());
    expect(decodeSettings('{"version": 999}')).toEqual(defaultSettings());
    expect(decodeSettings('{}')).toEqual(defaultSettings());
  });
});
