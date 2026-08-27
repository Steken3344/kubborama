import { createSystem, eq, PhysicsManipulation } from '@iwsdk/core';
import { StickPhase, StickState } from '../components/stick-state.js';
import { pieces, windVectorForMode } from '../config.js';
import { computeWindForce } from '../core/wind.js';
import { settingsState } from '../settingsState.js';

/**
 * Constant force on sticks in the Flying state only (docs/PLAN.md §1)
 * — PhysicsManipulation is one-shot, so the force is re-added every
 * tick rather than held as a persistent field (see docs/DECISIONS.md's
 * pre-M0 "design knots"). Simple mode's wind is 0, so this is a no-op
 * every frame until Advanced mode (or a future mode) sets it.
 */
export class WindSystem extends createSystem({
  flyingSticks: {
    required: [StickState],
    where: [eq(StickState, 'phase', StickPhase.Flying)],
  },
}) {
  update(): void {
    const windVectorMps = windVectorForMode(settingsState.current.gameMode);
    const force = computeWindForce(windVectorMps, pieces.wind.dragFactor);
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
