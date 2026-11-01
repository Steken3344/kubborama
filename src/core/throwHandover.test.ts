import { describe, expect, it } from 'vitest';
import {
  advanceHandover,
  noteServerPose,
  noteThrowStarted,
  startHandover,
} from './throwHandover.js';

const opts = {
  blendS: 0.3,
  timeoutS: 1,
  tickHz: 60,
  latestTick: 0,
  followMaxS: 6,
};

describe('throw handover (own throw: local prediction → server)', () => {
  it('stays local until the server shows the throw', () => {
    const h = startHandover([0, 1, 0]);
    noteServerPose(h, 30, [0, 1, 0]); // still on the rack server-side
    expect(advanceHandover(h, 40, 0.1, opts)).toEqual({ kind: 'local' });
  });

  it('stays local until the render time reaches that snapshot', () => {
    const h = startHandover([0, 1, 0]);
    noteServerPose(h, 33, [0, 1.5, -1]);
    expect(advanceHandover(h, 30, 0.02, opts)).toEqual({ kind: 'local' });
  });

  it('then blends to the server pose over blendS, then is done', () => {
    const h = startHandover([0, 1, 0]);
    noteServerPose(h, 33, [0, 1.5, -1]);
    expect(advanceHandover(h, 33, 0.02, opts)).toEqual({
      kind: 'blend',
      t: 0,
      tick: null,
    });
    const mid = advanceHandover(h, 36, 0.15, opts);
    expect(mid.kind).toBe('blend');
    expect(mid.kind === 'blend' && mid.t).toBeCloseTo(0.5);
    expect(advanceHandover(h, 40, 0.2, opts)).toEqual({ kind: 'done' });
  });

  it('gives up after timeoutS if the server never moves it (refused)', () => {
    const h = startHandover([0, 1, 0]);
    expect(advanceHandover(h, 10, 0.6, opts).kind).toBe('local');
    expect(advanceHandover(h, 20, 0.6, opts)).toEqual({ kind: 'done' });
  });

  it('the first moved snapshot counts; later ones do not move the mark', () => {
    const h = startHandover([0, 1, 0]);
    noteServerPose(h, 33, [0, 1.5, -1]);
    noteServerPose(h, 36, [0, 1.8, -2]);
    expect(advanceHandover(h, 33, 0.02, opts).kind).toBe('blend');
  });
});

describe('own throw on its own time line (2026-11-01)', () => {
  const o = (latestTick: number) => ({ ...opts, blendS: 0.1, latestTick });

  it('stays local until two snapshots of the flight exist', () => {
    const h = startHandover([0, 1, 0]);
    noteThrowStarted(h, 100);
    expect(advanceHandover(h, 90, 0.05, o(103))).toEqual({ kind: 'local' });
    const step = advanceHandover(h, 92, 0.05, o(106));
    expect(step.kind).toBe('follow');
  });

  it('shows the flight at the time since release, ahead of the render time', () => {
    const h = startHandover([0, 1, 0]);
    noteThrowStarted(h, 100);
    advanceHandover(h, 90, 0.1, o(106)); // 0.1 s after release
    const step = advanceHandover(h, 96, 0.05, o(109));
    // 0.15 s of flight = 9 ticks after the start, not the render tick 96.
    expect(step.kind === 'follow' && step.tick).toBeCloseTo(109);
  });

  it('follows the flight until the render time has caught up (at rest)', () => {
    const h = startHandover([0, 1, 0]);
    noteThrowStarted(h, 100);
    advanceHandover(h, 90, 0.1, o(106));
    expect(advanceHandover(h, 120, 0.5, o(150)).kind).toBe('follow');
    expect(advanceHandover(h, 160, 0.5, o(190), true)).toEqual({
      kind: 'done',
    });
  });

  it('the first start tick counts', () => {
    const h = startHandover([0, 1, 0]);
    noteThrowStarted(h, 100);
    noteThrowStarted(h, 130);
    expect(h.serverStartTick).toBe(100);
  });
});
