import { describe, expect, it } from 'vitest';
import {
  clonePreset,
  decodePreset,
  defaultPreset,
  encodePreset,
  percentToReal,
  realToPercent,
  tuningParams,
} from './tuning.js';

describe('percentToReal / realToPercent', () => {
  it('maps 0 and 100 to the spec min/max', () => {
    const spec = tuningParams.friction;
    expect(percentToReal(spec, 0)).toBeCloseTo(spec.min);
    expect(percentToReal(spec, 100)).toBeCloseTo(spec.max);
  });

  it('maps 50 to the midpoint', () => {
    const spec = tuningParams.gravityMps2;
    expect(percentToReal(spec, 50)).toBeCloseTo((spec.min + spec.max) / 2);
  });

  it('is the inverse of realToPercent', () => {
    const spec = tuningParams.stickMassDensityKgM3;
    for (const percent of [0, 12.5, 37, 50, 88, 100]) {
      const real = percentToReal(spec, percent);
      expect(realToPercent(spec, real)).toBeCloseTo(percent, 5);
    }
  });

  it('clamps out-of-range percents', () => {
    const spec = tuningParams.friction;
    expect(percentToReal(spec, -10)).toBeCloseTo(spec.min);
    expect(percentToReal(spec, 150)).toBeCloseTo(spec.max);
  });
});

describe('defaultPreset', () => {
  it('uses each param spec’s defaultPercent', () => {
    const preset = defaultPreset();
    expect(preset.friction).toBe(tuningParams.friction.defaultPercent);
    expect(preset.gravityMps2).toBe(tuningParams.gravityMps2.defaultPercent);
  });
});

describe('encodePreset / decodePreset (JSON export/import)', () => {
  it('round-trips a preset exactly', () => {
    const preset = defaultPreset();
    preset.friction = 42;
    const json = encodePreset(preset);
    const decoded = decodePreset(json);
    expect(decoded).toEqual(preset);
  });

  it('rejects malformed JSON instead of throwing', () => {
    expect(decodePreset('not json')).toBeNull();
  });

  it('rejects valid JSON missing required keys', () => {
    expect(decodePreset(JSON.stringify({ friction: 50 }))).toBeNull();
  });

  it('rejects out-of-range values', () => {
    const preset = defaultPreset();
    preset.friction = 500;
    expect(decodePreset(JSON.stringify(preset))).toBeNull();
  });
});

describe('clonePreset', () => {
  it('produces an independent copy', () => {
    const original = defaultPreset();
    const copy = clonePreset(original);
    copy.friction = 999;
    expect(original.friction).not.toBe(999);
  });
});
