import { createTranslator } from './core/i18n.js';
import en from './data/i18n/en.json' with { type: 'json' };
import sv from './data/i18n/sv.json' with { type: 'json' };
import { settingsState } from './settingsState.js';

/** Rebuilt whenever the language setting changes — see systems that
 * call `refreshTranslator()` after `settingsState.current.language`
 * changes (SettingsSystem). */
export const i18nState: { t: ReturnType<typeof createTranslator<typeof sv>> } =
  {
    t: createTranslator({ sv, en }, settingsState.current.language),
  };

export function refreshTranslator(): void {
  i18nState.t = createTranslator({ sv, en }, settingsState.current.language);
}
