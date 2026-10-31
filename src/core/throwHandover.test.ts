import { describe, expect, it } from 'vitest';
import {
  advanceHandover,
  noteServerPose,
  startHandover,
} from './throwHandover.js';

const opts = { blendS: 0.3, timeoutS: 1 };

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
