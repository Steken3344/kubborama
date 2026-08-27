import { z } from 'zod';

export const TELEMETRY_SCHEMA_VERSION = 1;

const throwStyleSchema = z.enum(['underhand', 'overhand', 'helicopter']);
export type ThrowStyle = z.infer<typeof throwStyleSchema>;

const recordSchema = z.object({
  timeS: z.number(),
  presetId: z.enum(['A', 'B', 'C']),
  releaseSpeedMps: z.number(),
  spinRadS: z.number(),
  flightTimeS: z.number(),
  distanceM: z.number(),
  style: throwStyleSchema,
  flipQualityScore: z.number().min(0).max(100),
});
export type ThrowTelemetryRecord = z.infer<typeof recordSchema>;

const storeSchema = z.object({
  version: z.literal(TELEMETRY_SCHEMA_VERSION),
  records: z.array(recordSchema),
});
export type TelemetryStore = z.infer<typeof storeSchema>;

export function buildTelemetryRecord(
  input: ThrowTelemetryRecord,
): ThrowTelemetryRecord {
  return { ...input };
}

export function emptyStore(): TelemetryStore {
  return { version: TELEMETRY_SCHEMA_VERSION, records: [] };
}

export function addRecord(
  store: TelemetryStore,
  record: ThrowTelemetryRecord,
): TelemetryStore {
  return { ...store, records: [...store.records, record] };
}

export function encodeStore(store: TelemetryStore): string {
  return JSON.stringify(store, null, 2);
}

/** Never throws — corrupt JSON, a missing/unknown schema version, or a
 * wrong shape all fall back to a fresh empty store (sane defaults on
 * bad/missing data, per project rules). */
export function decodeStore(json: string): TelemetryStore {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return emptyStore();
  }
  const result = storeSchema.safeParse(parsed);
  return result.success ? result.data : emptyStore();
}
