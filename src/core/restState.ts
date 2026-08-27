export interface RestThresholds {
  restLinearThresholdMps: number;
  restAngularThresholdRadS: number;
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
