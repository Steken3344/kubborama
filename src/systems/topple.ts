import { createSystem, PhysicsBody, Transform } from '@iwsdk/core';
import type { Entity } from '@iwsdk/core';
import { KingPiece } from '../components/king-piece.js';
import { Resettable } from '../components/resettable.js';
import { StickState } from '../components/stick-state.js';
import { pieces } from '../config.js';
import { gameEvents } from '../core/events.js';
import { log } from '../core/log.js';
import type { Quat } from '../core/quat.js';
import { isResting } from '../core/restState.js';
import { isToppled } from '../core/topple.js';
import { readBodySpeed } from './bodySpeed.js';

/**
 * Kubbs/king only (Resettable minus StickState — sticks are
 * projectiles, not toppleable targets). Emits KubbFelled/KingFelled
 * exactly once per piece, when it tips past config.toppleAngleDeg AND
 * has been at rest for restDurationS (never a merely wobbling piece —
 * docs/PLAN.md §1). Tracking resets when the Reset event fires (the
 * menu's "Ny runda" button, or a round auto-reset), since every
 * Resettable piece is teleported back upright at that point.
 */
export class ToppleSystem extends createSystem({
  toppleable: {
    required: [Resettable, Transform, PhysicsBody],
    excluded: [StickState],
  },
}) {
  private restTimerStartS = new Map<number, number>();
  private felledReported = new Set<number>();
  private unsubscribeReset?: () => void;
  private tmpQuat: Quat = [0, 0, 0, 1];
  private tmpSpeed: [number, number] = [0, 0];

  init(): void {
    this.unsubscribeReset = gameEvents.on('Reset', () => {
      this.restTimerStartS.clear();
      this.felledReported.clear();
    });
  }

  destroy(): void {
    this.unsubscribeReset?.();
  }

  update(_delta: number, timeS: number): void {
    for (const entity of this.queries.toppleable.entities) {
      this.checkOne(entity, timeS);
    }
  }

  private checkOne(entity: Entity, timeS: number): void {
    if (this.felledReported.has(entity.index)) {
      return;
    }

    const orientation = entity.getVectorView(Transform, 'orientation');
    this.tmpQuat[0] = orientation[0] ?? 0;
    this.tmpQuat[1] = orientation[1] ?? 0;
    this.tmpQuat[2] = orientation[2] ?? 0;
    this.tmpQuat[3] = orientation[3] ?? 1;
    if (!isToppled(this.tmpQuat, pieces.toppleAngleDeg)) {
      this.restTimerStartS.delete(entity.index);
      return;
    }

    readBodySpeed(entity, this.tmpSpeed);
    if (!isResting(this.tmpSpeed[0], this.tmpSpeed[1], pieces.throw)) {
      this.restTimerStartS.delete(entity.index);
      return;
    }

    const restStartS = this.restTimerStartS.get(entity.index);
    if (restStartS === undefined) {
      this.restTimerStartS.set(entity.index, timeS);
      return;
    }
    if (timeS - restStartS < pieces.throw.restDurationS) {
      return;
    }

    this.felledReported.add(entity.index);
    if (entity.hasComponent(KingPiece)) {
      gameEvents.emit('KingFelled', { timeS });
      log('info', 'state', 'king felled', { entityIndex: entity.index });
    } else {
      gameEvents.emit('KubbFelled', {
        entityId: String(entity.index),
        timeS,
      });
      log('info', 'state', 'kubb felled', { entityIndex: entity.index });
    }
  }
}
