import { describe, expect, it } from 'vitest';
import sv from './data/i18n/sv.json' with { type: 'json' };
import en from './data/i18n/en.json' with { type: 'json' };

describe('i18n dictionaries', () => {
  it('sv and en declare exactly the same keys — no drift between locales', () => {
    expect(Object.keys(sv).sort()).toEqual(Object.keys(en).sort());
  });

  it('no dictionary value contains å/ä/ö/Å/Ä/Ö — UIKitML cannot render them (see docs/DECISIONS.md)', () => {
    for (const [key, value] of Object.entries({ ...sv, ...en })) {
      // Normalize first: a decomposed NFD å (base "a" + combining ring
      // above) would otherwise slip past this regex undetected.
      expect(value.normalize('NFC'), `key "${key}"`).not.toMatch(/[åäöÅÄÖ]/u);
    }
  });
});
