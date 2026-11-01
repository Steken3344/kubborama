import { describe, expect, it } from 'vitest';
import { panelPoseInFront } from './menuPlacement.js';

/** The panel's front (+z) after its yaw. */
const front = (yaw: number) => [Math.sin(yaw), Math.cos(yaw)] as const;

describe('panelPoseInFront (2026-11-01)', () => {
  it('player A looking down the court (−z): ahead, below the eyes, facing back', () => {
    const p = panelPoseInFront({ x: 0, y: 1.6, z: 0.35 }, 0, -1, 2.2, 0.15);
    expect(p.x).toBeCloseTo(0);
    expect(p.z).toBeCloseTo(0.35 - 2.2);
    expect(p.y).toBeCloseTo(1.45);
    const [fx, fz] = front(p.yawRad);
    expect(fx).toBeCloseTo(0);
    expect(fz).toBeCloseTo(1); // towards the player
  });

  it('player B at the far end looking +z gets it in front, facing them', () => {
    const p = panelPoseInFront({ x: 0, y: 1.7, z: -6.35 }, 0, 3, 2.2, 0.15);
    expect(p.z).toBeCloseTo(-6.35 + 2.2);
    const [, fz] = front(p.yawRad);
    expect(fz).toBeCloseTo(-1);
  });

  it('a turned head: the panel sits along the look and faces it', () => {
    const p = panelPoseInFront({ x: 1, y: 1.6, z: 0 }, 1, 0, 2, 0);
    expect(p.x).toBeCloseTo(3);
    const [fx] = front(p.yawRad);
    expect(fx).toBeCloseTo(-1);
  });

  it('looking straight down falls back to −z', () => {
    const p = panelPoseInFront({ x: 0, y: 1.6, z: 0 }, 0, 0, 2, 0);
    expect(p.z).toBeCloseTo(-2);
  });
});
