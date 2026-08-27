import { describe, expect, it } from 'vitest';
import {
  addRecord,
  buildTelemetryRecord,
  decodeStore,
  emptyStore,
  encodeStore,
  TELEMETRY_SCHEMA_VERSION,
} from './telemetry.js';

function sampleRecord() {
  return buildTelemetryRecord({
    timeS: 12.5,
    presetId: 'A',
    releaseSpeedMps: 7.2,
    spinRadS: 5.4,
    flightTimeS: 1.02,
    distanceM: 5.8,
    style: 'underhand',
    flipQualityScore: 88,
  });
}

describe('emptyStore', () => {
  it('starts empty at the current schema version', () => {
    const store = emptyStore();
    expect(store.version).toBe(TELEMETRY_SCHEMA_VERSION);
    expect(store.records).toEqual([]);
  });
});

describe('addRecord', () => {
  it('appends without mutating the original store', () => {
    const store = emptyStore();
    const next = addRecord(store, sampleRecord());
    expect(store.records).toHaveLength(0);
    expect(next.records).toHaveLength(1);
  });
});

describe('encodeStore / decodeStore', () => {
  it('round-trips a store with records', () => {
    const store = addRecord(emptyStore(), sampleRecord());
    const decoded = decodeStore(encodeStore(store));
    expect(decoded).toEqual(store);
  });

  it('falls back to an empty store on corrupt JSON (never throws)', () => {
    expect(decodeStore('not json')).toEqual(emptyStore());
  });

  it('falls back to an empty store on a wrong-shaped object', () => {
    expect(decodeStore(JSON.stringify({ foo: 'bar' }))).toEqual(emptyStore());
  });

  it('falls back to an empty store on an unknown schema version', () => {
    const future = { version: 999, records: [] };
    expect(decodeStore(JSON.stringify(future))).toEqual(emptyStore());
  });
});
