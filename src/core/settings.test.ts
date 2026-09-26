import { describe, expect, it } from 'vitest';
import {
  decodeSettings,
  defaultSettings,
  encodeSettings,
  urlSettingOverrides,
} from './settings.js';

describe('defaultSettings', () => {
  it('starts in Swedish, simple mode, haptics on, no profile name yet', () => {
    const settings = defaultSettings();
    expect(settings.language).toBe('sv');
    expect(settings.gameMode).toBe('simple');
    expect(settings.hapticsEnabled).toBe(true);
    expect(settings.profileName).toBeNull();
    expect(settings.courtLinesVisible).toBe(false);
    expect(settings.micMuted).toBe(true);
    expect(settings.avatarColorIndex).toBe(0);
    expect(settings.debugRelay).toBe(false);
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

  it('loads settings saved before micMuted existed without resetting everything else', () => {
    const preMicMuted = { ...defaultSettings(), profileName: 'Erik' };
    // @ts-expect-error simulating pre-micMuted persisted JSON
    delete preMicMuted.micMuted;
    const decoded = decodeSettings(JSON.stringify(preMicMuted));
    expect(decoded.profileName).toBe('Erik');
    expect(decoded.micMuted).toBe(true);
  });

  it('loads settings saved before avatarColorIndex existed and rejects a negative index', () => {
    const preColor = { ...defaultSettings(), profileName: 'Erik' };
    // @ts-expect-error simulating pre-avatarColorIndex persisted JSON
    delete preColor.avatarColorIndex;
    const decoded = decodeSettings(JSON.stringify(preColor));
    expect(decoded.profileName).toBe('Erik');
    expect(decoded.avatarColorIndex).toBe(0);
    const negative = { ...defaultSettings(), avatarColorIndex: -1 };
    expect(decodeSettings(JSON.stringify(negative))).toEqual(defaultSettings());
  });
});

describe('roomId migration', () => {
  it('decodes a pre-roomId settings JSON, keeping its values', () => {
    const old: Record<string, unknown> = {
      ...defaultSettings(),
      language: 'en',
    };
    delete old['roomId'];
    const decoded = decodeSettings(JSON.stringify(old));
    expect(decoded.language).toBe('en');
    expect(decoded.roomId).toBeNull();
  });
});

describe('urlSettingOverrides', () => {
  it('reads room and debug', () => {
    expect(urlSettingOverrides('?room=eriktest&debug=1')).toEqual({
      roomId: 'eriktest',
      debugRelay: true,
    });
  });
  it('ignores an empty or overlong room and debug other than 1', () => {
    expect(urlSettingOverrides('?room=&debug=0')).toEqual({});
    expect(urlSettingOverrides(`?room=${'x'.repeat(65)}`)).toEqual({});
  });
});

describe('serverMode override', () => {
  it('?server=1 turns it on, ?server=0 off, absent leaves it', () => {
    expect(urlSettingOverrides('?server=1')).toEqual({ serverMode: true });
    expect(urlSettingOverrides('?server=0')).toEqual({ serverMode: false });
    expect(urlSettingOverrides('?room=x')).toEqual({ roomId: 'x' });
  });
});
