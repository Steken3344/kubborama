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
  /** MP1 voice chat's mandatory mute control (docs/PLAN.md §10 —
   * "Mute button mandatory"). Muted by default: opting IN to
   * broadcasting your microphone should be a deliberate action, not
   * the out-of-the-box state. `.default(true)` (not a bare
   * `z.boolean()`) so settings already saved to a player's
   * localStorage before this field existed still parse — a missing
   * key falls back to the default instead of failing the whole
   * schema and silently resetting every other saved setting too. */
  micMuted: z.boolean().default(true),
  /** MP3b: index into src/data/avatar-palette.json — the color the
   * OTHER player sees you as, synced via presence. `.default(0)` for
   * the same migration reason as micMuted above. */
  avatarColorIndex: z.number().int().min(0).default(0),
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
    micMuted: true,
    avatarColorIndex: 0,
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
