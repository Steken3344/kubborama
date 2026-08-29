import { createSystem, PhysicsBody, Transform } from '@iwsdk/core';
import type { Entity } from '@iwsdk/core';
import { KingPiece } from '../components/king-piece.js';
import { KingProtected } from '../components/king-protected.js';
import { Resettable } from '../components/resettable.js';
import { StickState } from '../components/stick-state.js';
import { getGameMode, pieces } from '../config.js';
import { gameEvents } from '../core/events.js';
import { log } from '../core/log.js';
import type { Quat } from '../core/quat.js';
import { accumulateHeldDuration, isResting } from '../core/restState.js';
import { createStartupGate } from '../core/startupGrace.js';
import { isToppled } from '../core/topple.js';
import type { Vec3 } from '../core/vec3.js';
import { settingsState } from '../settingsState.js';
import { readBodySpeed } from './bodySpeed.js';

/**
 * Kubbs/king only (Resettable minus StickState — sticks are
 * projectiles, not toppleable targets). Emits KubbFelled/KingFelled
 * exactly once per piece, when it tips past the active game mode's
 * topple angle (docs/sessions/M4.md: Simple 50°, Advanced 60° —
 * src/data/game-modes.json) AND has been at rest for restDurationS
 * (never a merely wobbling piece — docs/PLAN.md §1). Tracking resets
 * when the Reset event fires (the menu's "Ny runda" button, or a
 * round auto-reset), since every Resettable piece is teleported back
 * upright at that point.
 *
 * Rest duration is tracked as accumulated, per-frame-capped delta
 * (accumulateHeldDuration), not a wall-clock start-timestamp
 * comparison — a single frame with an abnormally large delta (an
 * asset-loading stall, a dropped frame from a WebGL context hiccup)
 * could otherwise satisfy restDurationS on its own. That alone wasn't
 * enough, though: reproduced live, every kubb (and sometimes the king)
 * still "felled" a few seconds into a fresh load on some runs — a
 * physics warm-up window (Havok's WASM stabilizing) where orientation
 * and velocity can both genuinely misread for several CONSECUTIVE real
 * frames, not just one. A startup grace (the player cannot possibly
 * interact within pieces.throw.startupGraceS of a fresh load anyway)
 * is the pragmatic fix on top of the accumulator — see
 * docs/DECISIONS.md (M5) for the full investigation.
 */
export class ToppleSystem extends createSystem({
  toppleable: {
    required: [Resettable, Transform, PhysicsBody],
    // KingProtected: Simple mode's rule that the king can't be felled
    // until every kubb is down (SimpleRulesSystem owns the tag) — the
    // king simply never enters this query while it's present, so no
    // rest/angle tracking exists for it to fire early on.
    excluded: [StickState, KingProtected],
  },
}) {
  private restAccumS = new Map<number, number>();
  private felledReported = new Set<number>();
  private unsubscribeReset?: () => void;
  private tmpQuat: Quat = [0, 0, 0, 1];
  private tmpSpeed: [number, number] = [0, 0];
  private isPastStartupGrace = createStartupGate(pieces.throw.startupGraceS);

  init(): void {
    this.unsubscribeReset = gameEvents.on('Reset', () => {
      this.restAccumS.clear();
      this.felledReported.clear();
    });
  }

  destroy(): void {
    this.unsubscribeReset?.();
  }

  update(delta: number, timeS: number): void {
    if (!this.isPastStartupGrace(timeS)) {
      return;
    }
    for (const entity of this.queries.toppleable.entities) {
      this.checkOne(entity, delta, timeS);
    }
  }

  private checkOne(entity: Entity, delta: number, timeS: number): void {
    if (this.felledReported.has(entity.index)) {
      return;
    }

    const orientation = entity.getVectorView(Transform, 'orientation');
    this.tmpQuat[0] = orientation[0] ?? 0;
    this.tmpQuat[1] = orientation[1] ?? 0;
    this.tmpQuat[2] = orientation[2] ?? 0;
    this.tmpQuat[3] = orientation[3] ?? 1;
    const toppleAngleDeg = getGameMode(
      settingsState.current.gameMode,
    ).toppleAngleDeg;
    if (!isToppled(this.tmpQuat, toppleAngleDeg)) {
      this.restAccumS.delete(entity.index);
      return;
    }

    readBodySpeed(entity, this.tmpSpeed);
    if (!isResting(this.tmpSpeed[0], this.tmpSpeed[1], pieces.throw)) {
      this.restAccumS.delete(entity.index);
      return;
    }

    const accumS = accumulateHeldDuration(
      this.restAccumS.get(entity.index) ?? 0,
      delta,
    );
    this.restAccumS.set(entity.index, accumS);
    if (accumS < pieces.throw.restDurationS) {
      return;
    }

    this.felledReported.add(entity.index);
    const positionView = entity.getVectorView(Transform, 'position');
    const position: Vec3 = [
      positionView[0] ?? 0,
      positionView[1] ?? 0,
      positionView[2] ?? 0,
    ];
    if (entity.hasComponent(KingPiece)) {
      gameEvents.emit('KingFelled', { position, timeS });
      log('info', 'state', 'king felled', { entityIndex: entity.index });
    } else {
      gameEvents.emit('KubbFelled', {
        entityId: String(entity.index),
        position,
        timeS,
      });
      log('info', 'state', 'kubb felled', { entityIndex: entity.index });
    }
  }
}
