import { describe, expect, it } from 'vitest';
import { createImpactWatch } from './impactWatch.js';
import type { ImpactItem } from './impactWatch.js';

const DT = 1 / 60;
const watch = () =>
  createImpactWatch({ thresholdMps: 2.5, teleportM: 0.2, cooldownS: 0.08 });

describe('createImpactWatch (server impacts, 2026-11-01)', () => {
  it('reports a stick stopped dead by a kubb', () => {
    const w = watch();
    const out: ImpactItem[] = [];
    w.observe('stick-0', [0, 0.3, -5], [0, -1, -6], 1, DT, out);
    w.observe('stick-0', [0, 0.29, -5.05], [0, 0, -1], 1 + DT, DT, out);
    expect(out).toHaveLength(1);
    expect(out[0]?.id).toBe('stick-0');
    expect(out[0]?.deltaVMps).toBeCloseTo(Math.hypot(1, 5));
  });

  it('a bounce that reverses direction at the same speed still counts', () => {
    const w = watch();
    const out: ImpactItem[] = [];
    w.observe('stick-0', [0, 0.1, -5], [0, -3, 0], 1, DT, out);
    w.observe('stick-0', [0, 0.1, -5], [0, 3, 0], 1 + DT, DT, out);
    expect(out).toHaveLength(1);
  });

  it('ignores gentle changes and a resting piece', () => {
    const w = watch();
    const out: ImpactItem[] = [];
    w.observe('kubb-0', [0, 0.15, -6], [0, 0, 0], 1, DT, out);
    w.observe('kubb-0', [0, 0.15, -6], [0.01, 0, 0], 1 + DT, DT, out);
    w.observe('stick-1', [0, 1, 0], [0, 2, -6], 1, DT, out);
    w.observe('stick-1', [0, 1.03, -0.1], [0, 1.84, -6], 1 + DT, DT, out);
    expect(out).toHaveLength(0);
  });

  it('a teleport (re-rack, a release point) is not an impact', () => {
    const w = watch();
    const out: ImpactItem[] = [];
    // A racked stick jumps to the release point and leaves at 7 m/s.
    w.observe('stick-2', [0, 0.97, 1.09], [0, 0, 0], 1, DT, out);
    w.observe('stick-2', [0.2, 1, -0.3], [0, 3, -6], 1 + DT, DT, out);
    // A flying stick put back on the table at the turn change.
    w.observe('stick-2', [0.2, 1.05, -0.4], [0, 2.8, -6], 1 + 2 * DT, DT, out);
    w.observe('stick-2', [0, 0.97, -7.09], [0, 0, 0], 1 + 3 * DT, DT, out);
    expect(out).toHaveLength(0);
  });

  it('one contact settling reports once per cooldown', () => {
    const w = watch();
    const out: ImpactItem[] = [];
    let t = 1;
    let vy = -4;
    w.observe('kubb-3', [0, 0.2, -6], [0, vy, 0], t, DT, out);
    for (let i = 0; i < 3; i++) {
      t += DT;
      vy = -vy;
      w.observe('kubb-3', [0, 0.2, -6], [0, vy, 0], t, DT, out);
    }
    expect(out).toHaveLength(1);
  });
});
