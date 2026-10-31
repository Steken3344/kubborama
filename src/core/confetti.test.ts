import { describe, expect, it } from 'vitest';
import { burstConfetti, confettiDone, stepConfetti } from './confetti.js';
import { createRng } from './rng.js';

const opts = {
  count: 50,
  burstSpeedMps: 5.5,
  gravityMps2: 9.81,
  dragPerS: 2.6,
  flutterAmplitudeMps: 0.6,
  flutterRadPerS: 7,
  spinRadPerS: 9,
  lifetimeS: 5.5,
  colorCount: 4,
};

const run = (seconds: number, seed = 1) => {
  const s = burstConfetti([0, 2.6, -1], opts, createRng(seed));
  for (let t = 0; t < seconds; t += 1 / 72) stepConfetti(s, 1 / 72, opts);
  return s;
};

describe('confetti', () => {
  it('bursts every piece from the origin, mostly upwards', () => {
    const s = burstConfetti([0, 2.6, -1], opts, createRng(1));
    expect(s.positions.length).toBe(150);
    expect(s.positions[1]).toBeCloseTo(2.6, 5);
    let up = 0;
    for (let i = 0; i < 50; i += 1)
      up += (s.velocities[i * 3 + 1] ?? 0) > 0 ? 1 : 0;
    expect(up).toBe(50);
    for (const c of s.colors) {
      expect(c).toBeGreaterThanOrEqual(0);
      expect(c).toBeLessThan(4);
    }
  });

  it('rises, spreads out and drifts down slowly (drag)', () => {
    const early = run(0.3);
    const late = run(2.5);
    const meanY = (p: Float32Array) => {
      let y = 0;
      for (let i = 1; i < p.length; i += 3) y += p[i] ?? 0;
      return y / (p.length / 3);
    };
    expect(meanY(early.positions)).toBeGreaterThan(2.6);
    expect(meanY(late.positions)).toBeLessThan(meanY(early.positions));
    // Terminal fall speed stays gentle, like paper.
    for (let i = 1; i < late.velocities.length; i += 3) {
      expect(late.velocities[i] ?? 0).toBeGreaterThan(-4.5);
    }
  });

  it('comes to rest on the grass, never below it', () => {
    const s = run(5);
    for (let i = 1; i < s.positions.length; i += 3) {
      expect(s.positions[i] ?? 0).toBeGreaterThanOrEqual(0);
    }
  });

  it('is done after its lifetime, and replays the same for a seed', () => {
    expect(confettiDone(run(1), opts)).toBe(false);
    expect(confettiDone(run(6), opts)).toBe(true);
    expect(run(1, 7).positions).toEqual(run(1, 7).positions);
  });
});
