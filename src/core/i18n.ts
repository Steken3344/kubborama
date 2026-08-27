export type Dictionary = Record<string, string>;
export type Language = 'sv' | 'en';

export type Translator<D extends Dictionary> = (
  key: keyof D,
  params?: Record<string, string | number>,
) => string;

/**
 * A typed t(key) over sv/en dictionaries (docs/PLAN.md's i18n.ts note).
 * Never throws on a missing key — falls back to the key itself, which
 * is loud enough in the UI to notice during development without
 * crashing a play session over a translation gap.
 */
export function createTranslator<D extends Dictionary>(
  dictionaries: Record<Language, D>,
  language: Language,
): Translator<D> {
  const dictionary = dictionaries[language];
  return (key, params) => {
    const template = dictionary[key as string] ?? String(key);
    if (!params) {
      return template;
    }
    return template.replace(/\{(\w+)\}/g, (match, name: string) =>
      Object.prototype.hasOwnProperty.call(params, name)
        ? String(params[name])
        : match,
    );
  };
}
