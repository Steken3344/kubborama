import { createSystem, eq, PhysicsManipulation } from '@iwsdk/core';
import { StickPhase, StickState } from '../components/stick-state.js';
import type { GameModeName } from '../config.js';
import { gameModes, pieces, windVectorForMode } from '../config.js';
import { computeWindForce } from '../core/wind.js';
import type { Vec3 } from '../core/vec3.js';
import { settingsState } from '../settingsState.js';

/**
 * Both modes' forces are fully determined by static config, so they're
 * computed once here rather than read/derived in update() — a plain
 * indexed lookup, no per-frame allocation and nothing to cache-bust
 * (a settings-changed event would only exist to invalidate a cache
 * that this design doesn't have). Matches how ToppleSystem reads its
 * own game-mode-derived value (topple angle) — a direct lookup, no
 * caching machinery, since neither is expensive enough to need it.
 */
const FORCE_BY_MODE: Record<GameModeName, Vec3> = Object.fromEntries(
  (Object.keys(gameModes) as GameModeName[]).map((name) => [
    name,
    computeWindForce(windVectorForMode(name), pieces.wind.dragFactor),
  ]),
) as Record<GameModeName, Vec3>;

// The addComponent options object, like FORCE_BY_MODE's arrays, is
// safe to share across every entity and frame — elics reads `force`
// synchronously during addComponent, it doesn't retain this wrapper.
// Precomputed per mode so update() never allocates one (see
// docs/DECISIONS.md, M5 GC pass).
const MANIPULATION_OPTIONS_BY_MODE: Record<GameModeName, { force: Vec3 }> =
  Object.fromEntries(
    (Object.keys(FORCE_BY_MODE) as GameModeName[]).map((name) => [
      name,
      { force: FORCE_BY_MODE[name] },
    ]),
  ) as Record<GameModeName, { force: Vec3 }>;

/**
 * Constant force on sticks in the Flying state only (docs/PLAN.md §1)
 * — PhysicsManipulation is one-shot, so the force is re-added every
 * tick rather than held as a persistent field (see docs/DECISIONS.md's
 * pre-M0 "design knots"). Simple mode's wind is 0, so this is a no-op
 * every frame until Advanced mode (or a future mode) sets it. Reusing
 * the same FORCE_BY_MODE array across entities and frames is safe:
 * elics copies Vec3 field values into per-entity storage on
 * addComponent, it never holds a reference to the array passed in.
 */
export class WindSystem extends createSystem({
  flyingSticks: {
    required: [StickState],
    where: [eq(StickState, 'phase', StickPhase.Flying)],
  },
}) {
  update(): void {
    const gameMode = settingsState.current.gameMode;
    const force = FORCE_BY_MODE[gameMode];
    if (force[0] === 0 && force[1] === 0 && force[2] === 0) {
      return;
    }
    const options = MANIPULATION_OPTIONS_BY_MODE[gameMode];
    for (const entity of this.queries.flyingSticks.entities) {
      if (entity.hasComponent(PhysicsManipulation)) {
        continue;
      }
      entity.addComponent(PhysicsManipulation, options);
    }
  }
}
