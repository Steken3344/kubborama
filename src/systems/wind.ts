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
    const force = FORCE_BY_MODE[settingsState.current.gameMode];
    if (force[0] === 0 && force[1] === 0 && force[2] === 0) {
      return;
    }
    for (const entity of this.queries.flyingSticks.entities) {
      if (entity.hasComponent(PhysicsManipulation)) {
        continue;
      }
      entity.addComponent(PhysicsManipulation, { force });
    }
  }
}
