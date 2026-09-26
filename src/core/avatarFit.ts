import type { Segment } from './avatarPose.js';
import type { Vec3 } from './vec3.js';

/**
 * Gate-report numbers for the MP3b avatar (docs/superpowers/specs/
 * 2026-09-26-gate-report-design.md): measured from the solver's own
 * output so the headset log can answer "does the arm end at the
 * mitten" and "does the torso twitch on a look-up" without anyone
 * watching.
 */
export const FIT_WINDOW_MS = 1000;

/** A segment is centred between its start (the shoulder) and its end,
 * so end = 2·centre − shoulder; returns |end − hand|. */
export function armEndToHandM(
  shoulder: Vec3,
  arm: Segment,
  hand: Vec3,
): number {
  return Math.hypot(
    2 * arm.position[0] - shoulder[0] - hand[0],
    2 * arm.position[1] - shoulder[1] - hand[1],
    2 * arm.position[2] - shoulder[2] - hand[2],
  );
}

export interface FitSample {
  atMs: number;
  torsoYawRad: number;
  headPitchRad: number;
  leftArmEndToHandM: number;
  rightArmEndToHandM: number;
}

export interface FitWindow {
  startMs: number | null;
  lastAtMs: number | null;
  lastTorsoYawRad: number;
  maxTorsoYawRateRadS: number;
  maxHeadPitchRad: number;
  maxLeftArmEndToHandM: number;
  maxRightArmEndToHandM: number;
}

export function emptyFitWindow(): FitWindow {
  return {
    startMs: null,
    lastAtMs: null,
    lastTorsoYawRad: 0,
    maxTorsoYawRateRadS: 0,
    maxHeadPitchRad: -Infinity,
    maxLeftArmEndToHandM: 0,
    maxRightArmEndToHandM: 0,
  };
}

/** Mutates `w` (called at presence rate — no allocation). The yaw step
 * is taken the short way round (atan2 wrap). */
export function addFitSample(w: FitWindow, s: FitSample): void {
  if (w.lastAtMs !== null && s.atMs > w.lastAtMs) {
    const step = s.torsoYawRad - w.lastTorsoYawRad;
    const wrapped = Math.atan2(Math.sin(step), Math.cos(step));
    const rate = Math.abs(wrapped) / ((s.atMs - w.lastAtMs) / 1000);
    w.maxTorsoYawRateRadS = Math.max(w.maxTorsoYawRateRadS, rate);
  }
  w.startMs ??= s.atMs;
  w.lastAtMs = s.atMs;
  w.lastTorsoYawRad = s.torsoYawRad;
  w.maxHeadPitchRad = Math.max(w.maxHeadPitchRad, s.headPitchRad);
  w.maxLeftArmEndToHandM = Math.max(
    w.maxLeftArmEndToHandM,
    s.leftArmEndToHandM,
  );
  w.maxRightArmEndToHandM = Math.max(
    w.maxRightArmEndToHandM,
    s.rightArmEndToHandM,
  );
}

/** Starts the next window but keeps the last yaw sample, so the rate
 * across the window boundary is still measured. */
export function restartFitWindow(w: FitWindow): void {
  w.startMs = null;
  w.maxTorsoYawRateRadS = 0;
  w.maxHeadPitchRad = -Infinity;
  w.maxLeftArmEndToHandM = 0;
  w.maxRightArmEndToHandM = 0;
}
