import bandsData from '../data/ballistic-bands.json' with { type: 'json' };

export interface Band {
  min: number;
  max: number;
}

/**
 * Computed, physics-correct target bands (docs/PLAN.md §9d1b) — the
 * tuning lab's green bands until Erik's calibration throws replace
 * them with real measured ranges.
 */
export const ballisticBands = {
  distanceM: bandsData.distanceM,
  releaseSpeedMps: bandsData.releaseSpeedMps,
  flightTimeS: bandsData.flightTimeS,
  spinRadS: bandsData.spinRadS,
} satisfies Record<string, Band>;

export type BandVerdict = 'low' | 'ok' | 'high';

export function bandVerdict(band: Band, value: number): BandVerdict {
  if (value < band.min) {
    return 'low';
  }
  if (value > band.max) {
    return 'high';
  }
  return 'ok';
}
