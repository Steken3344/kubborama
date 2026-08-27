import { describe, expect, it } from 'vitest';
import { impactRumble, scaleHapticPulse } from './haptics.js';

describe('impactRumble', () => {
  it('scales intensity and duration between 0.2-1.0 / 30-80ms across the force range', () => {
    const weak = impactRumble(0, 10);
    const strong = impactRumble(10, 10);
    expect(weak.intensity).toBeCloseTo(0.2, 5);
    expect(weak.durationMs).toBeCloseTo(30, 5);
    expect(strong.intensity).toBeCloseTo(1.0, 5);
    expect(strong.durationMs).toBeCloseTo(80, 5);
  });

  it('clamps forces above the reference max instead of overshooting', () => {
    const overMax = impactRumble(1000, 10);
    expect(overMax.intensity).toBeCloseTo(1.0, 5);
    expect(overMax.durationMs).toBeCloseTo(80, 5);
  });

  it('clamps negative forces to the weakest pulse', () => {
    const negative = impactRumble(-5, 10);
    expect(negative.intensity).toBeCloseTo(0.2, 5);
  });

  it('interpolates linearly at the midpoint', () => {
    const mid = impactRumble(5, 10);
    expect(mid.intensity).toBeCloseTo(0.6, 5);
    expect(mid.durationMs).toBeCloseTo(55, 5);
  });
});

describe('scaleHapticPulse', () => {
  const pulse = { intensity: 0.5, durationMs: 20 };

  it('returns null when haptics are disabled — never fires a pulse', () => {
    expect(scaleHapticPulse(pulse, false, 100)).toBeNull();
  });

  it('passes the pulse through unscaled at 100%', () => {
    expect(scaleHapticPulse(pulse, true, 100)).toEqual(pulse);
  });

  it('scales intensity by the percent, leaving duration untouched', () => {
    expect(scaleHapticPulse(pulse, true, 50)).toEqual({
      intensity: 0.25,
      durationMs: 20,
    });
  });

  it('scales to zero intensity at 0%, but does not return null (still enabled)', () => {
    expect(scaleHapticPulse(pulse, true, 0)).toEqual({
      intensity: 0,
      durationMs: 20,
    });
  });
});
