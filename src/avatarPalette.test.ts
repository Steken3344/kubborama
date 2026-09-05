import { describe, expect, it } from 'vitest';
import { avatarPalette, avatarPaletteEntry } from './config.js';
import en from './data/i18n/en.json' with { type: 'json' };
import sv from './data/i18n/sv.json' with { type: 'json' };

/** The palette's `nameKey`s are looked up with a cast in MenuSystem
 * (JSON imports widen to string) — this test is what makes a palette
 * entry without a translation a red build instead of a wrong label. */
describe('avatar palette', () => {
  it('has a translation in both languages for every color', () => {
    for (const entry of avatarPalette) {
      expect(sv, `sv.json lacks ${entry.nameKey}`).toHaveProperty(
        entry.nameKey,
      );
      expect(en, `en.json lacks ${entry.nameKey}`).toHaveProperty(
        entry.nameKey,
      );
    }
  });

  it('uses valid, unique hex colors and ids', () => {
    const ids = new Set(avatarPalette.map((e) => e.id));
    expect(ids.size).toBe(avatarPalette.length);
    for (const entry of avatarPalette) {
      expect(entry.hex).toMatch(/^#[0-9a-f]{6}$/u);
    }
  });

  it('clamps any index onto the palette', () => {
    expect(avatarPaletteEntry(-5)).toBe(avatarPalette[0]);
    expect(avatarPaletteEntry(99)).toBe(
      avatarPalette[avatarPalette.length - 1],
    );
    expect(avatarPaletteEntry(2.9)).toBe(avatarPalette[2]);
  });
});
