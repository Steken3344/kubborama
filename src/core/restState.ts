export interface RestThresholds {
  restLinearThresholdMps: number;
  restAngularThresholdRadS: number;
}

/** Caps a single frame's contribution to a held-duration accumulator.
 * A loading stall or dropped frame can otherwise hand a caller one
 * enormous `delta` — enough on its own to satisfy a multi-second
 * "has this held continuously" check in a single, spurious step. See
 * accumulateHeldDuration and docs/DECISIONS.md (M5).
 *
 * Deliberately the SAME value as `MAX_DELTA_S` in
 * `patches/@iwsdk+core+0.5.3.patch` (gh#8), which now clamps `delta`
 * at its source before this function ever sees it — making this
 * clamp mathematically redundant in the common case, but kept as
 * defense-in-depth against the patch itself ever failing to apply
 * (a dependency bump, a lost patch file) rather than physically
 * unified, since a patched `node_modules` file and this project's own
 * source can't cleanly share one constant across that boundary (M5
 * adversarial review gate, docs/DECISIONS.md). */
const MAX_FRAME_DELTA_S = 0.1;

/**
 * Tracks how long a condition has held continuously. The caller resets
 * `previousS` to 0 the instant the condition fails even once — this
 * function only guards against one frame's `deltaS` overstating real
 * elapsed time, not against gaps in when it's called.
 */
export function accumulateHeldDuration(
  previousS: number,
  deltaS: number,
): number {
  return previousS + Math.min(deltaS, MAX_FRAME_DELTA_S);
}

/**
 * Shared by every "has this dynamic body stopped moving" check
 * (ThrowingSystem's stick settling, ToppleSystem's felled-piece rest
 * requirement) — a piece must be under both thresholds, not just one,
 * since a piece can spin in place with near-zero linear velocity.
 * Duration bookkeeping (how long it's been resting) stays in the
 * calling system, which already tracks per-entity state.
 */
export function isResting(
  linSpeedMps: number,
  angSpeedRadS: number,
  thresholds: RestThresholds,
): boolean {
  return (
    linSpeedMps < thresholds.restLinearThresholdMps &&
    angSpeedRadS < thresholds.restAngularThresholdRadS
  );
}
