import { createSystem, Grabbed } from '@iwsdk/core';
import { StickState } from '../components/stick-state.js';
import { log } from '../core/log.js';
import { debugContext, STICK_BELOW_GROUND_Y } from '../debug/debugContext.js';

/**
 * Debug mode only (src/debug/debugContext.ts `enabled`): watches every
 * stick each frame and logs ONCE per below-ground episode with the
 * context needed to explain it — Erik's report "pinnarna hamnar ibland
 * under marken vid gästen" (2026-09-05). The correlation that matters is
 * whether the stick was put there by our own physics or by the host's
 * last pieceSync snapshot (debugContext.lastPieceSync, recorded by
 * MultiplayerSystem.applyPieceSync while debug is on), and how old that
 * snapshot was. No allocation per frame while nothing is wrong; the
 * log call itself only fires on the transition.
 */
export class DebugWatchSystem extends createSystem({
  sticks: { required: [StickState] },
}) {
  private belowGround = new Set<number>();

  update(_delta: number, timeS: number): void {
    if (!debugContext.enabled) {
      return;
    }
    for (const entity of this.queries.sticks.entities) {
      const object3D = entity.object3D;
      if (!object3D) {
        continue;
      }
      const y = object3D.position.y;
      const was = this.belowGround.has(entity.index);
      if (y < STICK_BELOW_GROUND_Y && !was) {
        this.belowGround.add(entity.index);
        const id =
          debugContext.pieceIdByEntityIndex.get(entity.index) ??
          `entity-${entity.index}`;
        const trace = debugContext.lastPieceSync.get(id);
        log('warn', 'debug', 'stick below ground', {
          id,
          entityIndex: entity.index,
          y,
          position: [object3D.position.x, y, object3D.position.z],
          phase: entity.getValue(StickState, 'phase'),
          grabbed: entity.hasComponent(Grabbed),
          role: debugContext.role,
          lastPieceSyncY: trace?.position[1] ?? null,
          lastPieceSyncAgeMs: trace ? Date.now() - trace.atMs : null,
          timeS,
        });
      } else if (y >= STICK_BELOW_GROUND_Y && was) {
        this.belowGround.delete(entity.index);
        log('info', 'debug', 'stick back above ground', {
          entityIndex: entity.index,
          y,
          timeS,
        });
      }
    }
  }
}
