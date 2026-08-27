import { z } from 'zod';
import tuningParamsData from '../data/tuning-params.json' with { type: 'json' };

export interface TuningParamSpec {
  label: string;
  unit: string;
  min: number;
  max: number;
  defaultPercent: number;
}

export const tuningParams = tuningParamsData satisfies Record<
  string,
  TuningParamSpec
>;
export type TuningParamId = keyof typeof tuningParams;

/** Every feel parameter as a normalized 0-100 value — the shared
 * tuning language between Erik and Claude ("raise spin from 35 to
 * 50"). Real units are derived from this via percentToReal(). */
export type TuningPreset = Record<TuningParamId, number>;

function clampPercent(percent: number): number {
  return Math.min(100, Math.max(0, percent));
}

export function percentToReal(spec: TuningParamSpec, percent: number): number {
  const t = clampPercent(percent) / 100;
  return spec.min + t * (spec.max - spec.min);
}

export function realToPercent(spec: TuningParamSpec, real: number): number {
  return ((real - spec.min) / (spec.max - spec.min)) * 100;
}

export function defaultPreset(): TuningPreset {
  const preset = {} as TuningPreset;
  for (const key of Object.keys(tuningParams) as TuningParamId[]) {
    preset[key] = tuningParams[key].defaultPercent;
  }
  return preset;
}

export function clonePreset(preset: TuningPreset): TuningPreset {
  return { ...preset };
}

const presetSchema = z.object(
  Object.fromEntries(
    (Object.keys(tuningParams) as TuningParamId[]).map((key) => [
      key,
      z.number().min(0).max(100),
    ]),
  ) as Record<TuningParamId, z.ZodNumber>,
);

export function encodePreset(preset: TuningPreset): string {
  return JSON.stringify(preset, null, 2);
}

/** Never throws — returns null on malformed JSON, missing keys, or
 * out-of-range values, so a corrupt paste/import can't crash the app. */
export function decodePreset(json: string): TuningPreset | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return null;
  }
  const result = presetSchema.safeParse(parsed);
  return result.success ? (result.data as TuningPreset) : null;
}
