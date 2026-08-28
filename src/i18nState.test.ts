import { describe, expect, it } from 'vitest';
import sv from './data/i18n/sv.json' with { type: 'json' };
import en from './data/i18n/en.json' with { type: 'json' };

describe('i18n dictionaries', () => {
  it('sv and en declare exactly the same keys — no drift between locales', () => {
    expect(Object.keys(sv).sort()).toEqual(Object.keys(en).sort());
  });
});
