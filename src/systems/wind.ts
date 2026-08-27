import { createSystem, eq, PhysicsManipulation } from '@iwsdk/core';
import { StickPhase, StickState } from '../components/stick-state.js';
import type { GameModeName } from '../config.js';
import { pieces, windVectorForMode } from '../config.js';
import { computeWindForce } from '../core/wind.js';
import type { Vec3 } from '../core/vec3.js';
import { settingsState } from '../settingsState.js';

/**
 * Constant force on sticks in the Flying state only (docs/PLAN.md §1)
 * — PhysicsManipulation is one-shot, so the force is re-added every
 * tick rather than held as a persistent field (see docs/DECISIONS.md's
 * pre-M0 "design knots"). Simple mode's wind is 0, so this is a no-op
 * every frame until Advanced mode (or a future mode) sets it. The
 * force only depends on the (rarely-changing) game mode, so it's
 * cached and recomputed on mode change instead of every frame — never
 * allocate in update().
 */
export class WindSystem extends createSystem({
  flyingSticks: {
    required: [StickState],
    where: [eq(StickState, 'phase', StickPhase.Flying)],
  },
}) {
  private cachedGameMode: GameModeName | undefined;
  private cachedForce: Vec3 = [0, 0, 0];

  update(): void {
    const gameMode = settingsState.current.gameMode;
    if (gameMode !== this.cachedGameMode) {
      this.cachedGameMode = gameMode;
      this.cachedForce = computeWindForce(
        windVectorForMode(gameMode),
        pieces.wind.dragFactor,
      );
    }
    const force = this.cachedForce;
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
