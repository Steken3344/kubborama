import { z } from 'zod';

export const SETTINGS_SCHEMA_VERSION = 1;

/** Exported for the multiplayer `hello` handshake (gh#15), which
 * carries the sender's mode so a guest can adopt the host's court. */
export const gameModeSchema = z.enum(['simple', 'advanced']);

const roomIdSchema = z.string().min(1).max(64);

const settingsSchema = z.object({
  version: z.literal(SETTINGS_SCHEMA_VERSION),
  language: z.enum(['sv', 'en']),
  gameMode: gameModeSchema,
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
  /** Debug mode (2026-09-05): ship structured logs to the dev server
   * (src/debug/debugRelay.ts). A no-op in the production build, so a
   * persisted `true` is harmless there; `.default(false)` for migration. */
  debugRelay: z.boolean().default(false),
  /** Multiplayer room remembered from `?room=` (gate report spec §4):
   * after one visit the bare LAN URL rejoins it. null = the public
   * lobby (config). `.default(null)` for migration. */
  roomId: roomIdSchema.nullable().default(null),
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
    debugRelay: false,
    roomId: null,
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

/** `?room=<id>` and `?debug=1` from a URL search string — the values
 * SettingsSystem persists at boot. Invalid values are ignored. */
export function urlSettingOverrides(search: string): {
  roomId?: string;
  debugRelay?: true;
} {
  const params = new URLSearchParams(search);
  const room = roomIdSchema.safeParse(params.get('room') ?? '');
  return {
    ...(room.success ? { roomId: room.data } : {}),
    ...(params.get('debug') === '1' ? { debugRelay: true as const } : {}),
  };
}
