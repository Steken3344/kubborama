import { z } from 'zod';
import { MAX_COLOR_INDEX } from './presence.js';
import { emptyStats, recordRound, statsSchema } from './stats.js';
import type { RoundStatsInput, Stats } from './stats.js';

/**
 * Server-owned player profiles (docs/superpowers/specs/2026-10-31-server-
 * profiles-and-foot-faults-design.md). A profile is either NAMED (a name
 * from the menu's fixed list — choosing it on any headset claims it) or
 * ANONYMOUS, keyed by the device id (the server's cookie, else the
 * browser's clientId). The store remembers which profile each device
 * uses. Pure data in/out: the server reads and writes the JSON file.
 */
export const PROFILES_SCHEMA_VERSION = 1;

const headToHeadSchema = z.object({
  won: z.number().int().nonnegative(),
  lost: z.number().int().nonnegative(),
});

const profileSchema = z.object({
  name: z.string().nullable(),
  colorIndex: z.number().int().min(0).max(MAX_COLOR_INDEX),
  stats: statsSchema,
  /** By the opponent's profile key. */
  headToHead: z.record(z.string(), headToHeadSchema),
});
type Profile = z.infer<typeof profileSchema>;

const storeSchema = z.object({
  version: z.literal(PROFILES_SCHEMA_VERSION),
  profiles: z.record(z.string(), profileSchema),
  /** Device id → profile key. */
  devices: z.record(z.string(), z.string()),
});
export type ProfileStore = z.infer<typeof storeSchema>;

/** What a headset is told about its own profile. */
export interface ClientProfile {
  name: string | null;
  colorIndex: number;
  stats: Stats;
  headToHead: Array<{ opponentName: string | null; won: number; lost: number }>;
}

export function emptyProfileStore(): ProfileStore {
  return { version: PROFILES_SCHEMA_VERSION, profiles: {}, devices: {} };
}

/** A corrupt, foreign or old file gives a fresh store — never throws. */
export function parseProfileStore(json: string): ProfileStore {
  try {
    const result = storeSchema.safeParse(JSON.parse(json));
    return result.success ? result.data : emptyProfileStore();
  } catch {
    return emptyProfileStore();
  }
}

function keyOf(deviceId: string, name: string | null): string {
  return name === null ? `device:${deviceId}` : `name:${name}`;
}

function newProfile(name: string | null, colorIndex = 0): Profile {
  return { name, colorIndex, stats: emptyStats(), headToHead: {} };
}

function withProfile(
  store: ProfileStore,
  key: string,
  profile: Profile,
): ProfileStore {
  return { ...store, profiles: { ...store.profiles, [key]: profile } };
}

/** The device's profile key, creating its anonymous profile if new. */
export function profileKeyFor(
  store: ProfileStore,
  deviceId: string,
): { store: ProfileStore; key: string } {
  const known = store.devices[deviceId];
  if (known !== undefined && store.profiles[known]) {
    return { store, key: known };
  }
  const key = keyOf(deviceId, null);
  const profiles = store.profiles[key]
    ? store.profiles
    : { ...store.profiles, [key]: newProfile(null) };
  return {
    store: {
      ...store,
      profiles,
      devices: { ...store.devices, [deviceId]: key },
    },
    key,
  };
}

/** The device switches to the profile called `name` (null: its own
 * anonymous one). A new named profile inherits the current colour. */
export function claimProfile(
  store: ProfileStore,
  deviceId: string,
  name: string | null,
): ProfileStore {
  const current = profileKeyFor(store, deviceId);
  const currentColor = current.store.profiles[current.key]?.colorIndex ?? 0;
  const key = keyOf(deviceId, name);
  let next = current.store;
  if (!next.profiles[key]) {
    next = withProfile(next, key, newProfile(name, currentColor));
  }
  return { ...next, devices: { ...next.devices, [deviceId]: key } };
}

function profileAt(store: ProfileStore, key: string): Profile {
  return store.profiles[key] ?? newProfile(null);
}

export function setProfileColor(
  store: ProfileStore,
  key: string,
  colorIndex: number,
): ProfileStore {
  const clamped = Math.min(
    Math.max(0, Math.trunc(colorIndex)),
    MAX_COLOR_INDEX,
  );
  return withProfile(store, key, {
    ...profileAt(store, key),
    colorIndex: clamped,
  });
}

export function recordRoundFor(
  store: ProfileStore,
  key: string,
  input: RoundStatsInput,
): ProfileStore {
  const profile = profileAt(store, key);
  return withProfile(store, key, {
    ...profile,
    stats: recordRound(profile.stats, input),
  });
}

/** A finished match: one more win and one more loss, against each other. */
export function recordMatchResult(
  store: ProfileStore,
  winnerKey: string,
  loserKey: string,
): ProfileStore {
  const bump = (
    s: ProfileStore,
    key: string,
    opponentKey: string,
    won: boolean,
  ): ProfileStore => {
    const profile = profileAt(s, key);
    const before = profile.headToHead[opponentKey] ?? { won: 0, lost: 0 };
    return withProfile(s, key, {
      ...profile,
      headToHead: {
        ...profile.headToHead,
        [opponentKey]: {
          won: before.won + (won ? 1 : 0),
          lost: before.lost + (won ? 0 : 1),
        },
      },
    });
  };
  return bump(
    bump(store, winnerKey, loserKey, true),
    loserKey,
    winnerKey,
    false,
  );
}

export function clientProfile(store: ProfileStore, key: string): ClientProfile {
  const profile = profileAt(store, key);
  return {
    name: profile.name,
    colorIndex: profile.colorIndex,
    stats: profile.stats,
    headToHead: Object.entries(profile.headToHead).map(([opponent, r]) => ({
      opponentName: store.profiles[opponent]?.name ?? null,
      won: r.won,
      lost: r.lost,
    })),
  };
}
