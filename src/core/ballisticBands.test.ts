import { describe, expect, it } from 'vitest';
import { ballisticBands, bandVerdict } from './ballisticBands.js';

describe('bandVerdict', () => {
  it('reports in-range values as ok', () => {
    expect(bandVerdict(ballisticBands.releaseSpeedMps, 7.2)).toBe('ok');
  });

  it('reports below-range values as low', () => {
    expect(bandVerdict(ballisticBands.releaseSpeedMps, 2)).toBe('low');
  });

  it('reports above-range values as high', () => {
    expect(bandVerdict(ballisticBands.releaseSpeedMps, 20)).toBe('high');
  });

  it('treats the exact boundaries as in range', () => {
    const band = ballisticBands.flightTimeS;
    expect(bandVerdict(band, band.min)).toBe('ok');
    expect(bandVerdict(band, band.max)).toBe('ok');
  });
});
