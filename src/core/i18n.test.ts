import { describe, expect, it } from 'vitest';
import { createTranslator } from './i18n.js';
import type { Dictionary } from './i18n.js';

const sv: Dictionary = {
  menuTitle: 'Meny',
  resetButton: 'Ny runda',
  greeting: 'Hej {name}',
};
const en: Dictionary = {
  menuTitle: 'Menu',
  resetButton: 'New round',
  greeting: 'Hi {name}',
};

describe('createTranslator', () => {
  it('looks up a key in the active language', () => {
    const t = createTranslator({ sv, en }, 'sv');
    expect(t('menuTitle')).toBe('Meny');
  });

  it('switches language', () => {
    const t = createTranslator({ sv, en }, 'en');
    expect(t('menuTitle')).toBe('Menu');
  });

  it('substitutes named placeholders', () => {
    const t = createTranslator({ sv, en }, 'sv');
    expect(t('greeting', { name: 'Erik' })).toBe('Hej Erik');
  });

  it('falls back to the key itself for a missing entry, never throws', () => {
    const t = createTranslator({ sv, en }, 'sv');
    expect(t('doesNotExist')).toBe('doesNotExist');
  });
});
