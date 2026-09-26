import type { PoseSample } from '../core/throwRelease.js';
import { activePreset, percentToReal, tuningParams } from '../core/tuning.js';
import { presetBank } from '../tuningState.js';

/** The release smoothing window of the active tuning preset, in frames —
 * one definition for sticks and the inkast toss. */
export function releaseWindowFrames(): number {
  const preset = activePreset(presetBank);
  return Math.round(
    percentToReal(
      tuningParams.releaseSmoothingWindowFrames,
      preset.releaseSmoothingWindowFrames,
    ),
  );
}

/**
 * Per-entity ring buffer of the holding hand's grip pose — the input to
 * core/throwRelease.ts. Shared by ThrowingSystem (sticks) and
 * InkastSystem (MP4 kubb toss) so both releases are computed from the
 * same samples. Reuses the sample about to be evicted (mutate in place)
 * instead of allocating a fresh object + two arrays every frame — this
 * runs for the whole aiming window (docs/DECISIONS.md, M5 GC pass).
 * Only the first `windowSize` frames of a fresh grab allocate.
 */
export class PoseSampler {
  private buffers = new Map<number, PoseSample[]>();

  start(index: number): void {
    this.buffers.set(index, []);
  }

  sample(
    index: number,
    timeS: number,
    position: { x: number; y: number; z: number },
    orientation: { x: number; y: number; z: number; w: number },
    windowSize: number,
  ): void {
    const buffer = this.buffers.get(index) ?? [];
    let sample = buffer.length >= windowSize ? buffer.shift() : undefined;
    if (sample === undefined) {
      sample = { timeS, position: [0, 0, 0], orientation: [0, 0, 0, 1] };
    }
    sample.timeS = timeS;
    sample.position[0] = position.x;
    sample.position[1] = position.y;
    sample.position[2] = position.z;
    sample.orientation[0] = orientation.x;
    sample.orientation[1] = orientation.y;
    sample.orientation[2] = orientation.z;
    sample.orientation[3] = orientation.w;
    buffer.push(sample);
    while (buffer.length > windowSize) {
      buffer.shift();
    }
    this.buffers.set(index, buffer);
  }

  /** The samples for a release, and forget them. */
  take(index: number): PoseSample[] {
    const buffer = this.buffers.get(index) ?? [];
    this.buffers.delete(index);
    return buffer;
  }
}
