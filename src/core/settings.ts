import { z } from 'zod';

export const SETTINGS_SCHEMA_VERSION = 1;

const settingsSchema = z.object({
  version: z.literal(SETTINGS_SCHEMA_VERSION),
  language: z.enum(['sv', 'en']),
  gameMode: z.enum(['simple', 'advanced']),
  musicVolumePercent: z.number().min(0).max(100),
  sfxVolumePercent: z.number().min(0).max(100),
  hapticsEnabled: z.boolean(),
  hapticsIntensityPercent: z.number().min(0).max(100),
  courtLinesVisible: z.boolean(),
  /** Local, non-blocking — the first-run prompt can be dismissed and
   * answered later; throwing works before it's answered either way
   * (docs/sessions/M4.md). */
  profileName: z.string().nullable(),
});
export type Settings = z.infer<typeof settingsSchema>;

export function defaultSettings(): Settings {
  return {
    version: SETTINGS_SCHEMA_VERSION,
    language: 'sv',
    gameMode: 'simple',
    musicVolumePercent: 70,
    sfxVolumePercent: 70,
    hapticsEnabled: true,
    hapticsIntensityPercent: 70,
    courtLinesVisible: false,
    profileName: null,
  };
}

export function encodeSettings(settings: Settings): string {
  return JSON.stringify(settings, null, 2);
}

/** Never throws — corrupt JSON, a missing/unknown schema version, or a
 * wrong shape all fall back to defaults. */
export function decodeSettings(json: string): Settings {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return defaultSettings();
  }
  const result = settingsSchema.safeParse(parsed);
  return result.success ? result.data : defaultSettings();
}
