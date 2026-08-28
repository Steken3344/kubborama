/**
 * Physics/asset loading can take real wall-clock time on the first few
 * frames (Havok WASM, GLB/audio downloads) — long enough that a piece
 * can read as toppled-and-resting (a genuine but transient solver
 * correction, e.g. resolving a hair of initial collider overlap) for
 * the full `restDurationS` window before anything ever really settles.
 * Observed at every fresh load: all 10 kubbs + the king "felled" and a
 * stray impact/thud, all before the player could possibly have done
 * anything (see docs/DECISIONS.md, M5). A closed-over gate is simpler
 * than threading a "first frame" flag through every caller.
 */
export function createStartupGate(graceS: number): (timeS: number) => boolean {
  let startTimeS: number | undefined;
  return (timeS: number): boolean => {
    startTimeS ??= timeS;
    return timeS - startTimeS >= graceS;
  };
}
