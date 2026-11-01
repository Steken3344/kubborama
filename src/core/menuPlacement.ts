/**
 * Where the menu panel opens (Erik, 2026-11-01): in front of the head,
 * a little below the eyes, facing the player — player B at the far end
 * never saw a panel fixed at A's end. Plain numbers in, a pose out: the
 * panel's front is its local +z, so it is turned to look back along the
 * player's forward direction.
 */
export interface PanelPose {
  x: number;
  y: number;
  z: number;
  yawRad: number;
}

/** `forwardX/Z`: the head's horizontal looking direction (any length;
 * straight up or down falls back to −z). */
export function panelPoseInFront(
  head: { x: number; y: number; z: number },
  forwardX: number,
  forwardZ: number,
  distanceM: number,
  belowEyesM: number,
): PanelPose {
  let fx = forwardX;
  let fz = forwardZ;
  const len = Math.hypot(fx, fz);
  if (len < 1e-6) {
    fx = 0;
    fz = -1;
  } else {
    fx /= len;
    fz /= len;
  }
  return {
    x: head.x + fx * distanceM,
    y: head.y - belowEyesM,
    z: head.z + fz * distanceM,
    yawRad: Math.atan2(-fx, -fz),
  };
}
