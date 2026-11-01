/**
 * Sticks on grass barely roll (Erik, 2026-11-01: "pinnarna rullar …
 * borde inte rulla så långt"). A landed stick — its centre within
 * `groundHeightM` of the ground, i.e. lying or about to — gets strong
 * angular AND linear damping (grass drag); airborne it keeps its flight
 * values, so throws feel the same. Height alone decides: the old check
 * also required < 3 rad/s, which a ROLLING stick never is (ω = v / r =
 * 45 rad/s at 1 m/s for r = 2.2 cm), so the brake never engaged and a
 * stick rolled metres. Shared by the server (MatchHost) and the
 * serverless client (StickGroundDampingSystem).
 */
/** A stick whose centre is this close to the ground is lying on it. */
export function isStickOnGround(
  heightM: number,
  t: { groundHeightM: number },
): boolean {
  return heightM < t.groundHeightM;
}
