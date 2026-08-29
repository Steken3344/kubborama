import { createSystem, PhysicsBody, PhysicsSystem } from '@iwsdk/core';
import { KingPiece } from '../components/king-piece.js';
import { KingProtected } from '../components/king-protected.js';
import { OutOfPlay } from '../components/out-of-play.js';
import { Resettable } from '../components/resettable.js';
import { StickState } from '../components/stick-state.js';
import { pieces, sinBin } from '../config.js';
import { sinBinSlotPosition } from '../core/sinBin.js';
import { gameEvents } from '../core/events.js';
import { settingsState } from '../settingsState.js';

const IDENTITY_QUATERNION: [number, number, number, number] = [0, 0, 0, 1];

/**
 * Erik's real-kubb "Simple mode" rules (2026-08-29): a felled kubb is
 * set aside beside the court, out of play, and the king can't be
 * felled until every kubb is down. Advanced mode is untouched — it
 * keeps today's free-throw-any-order behavior, per the design
 * decision to build this INTO the existing Simple/Advanced toggle
 * rather than as a separate setting (see docs/DECISIONS.md).
 *
 * Purely event-driven (no per-frame work needed): KubbFelled moves
 * the piece and re-derives whether the king should still be
 * protected; Reset clears every OutOfPlay tag (position is already
 * restored by then — MenuSystem.resetAll(), the thing that emits
 * Reset, has already teleported every Resettable entity, out-of-play
 * kubbs included, back to its original standing home pose) and
 * re-derives protection for the (possibly new) active mode.
 *
 * The king staying a normal DYNAMIC PhysicsBody the whole time is
 * deliberate: IWSDK's PhysicsSystem only reads `state` once, at Havok
 * body creation (verified in source — there's no live motion-type
 * change API), so "protected" is enforced purely by excluding it from
 * ToppleSystem's query (see topple.ts's KingProtected exclusion),
 * never by actually freezing its physics. The same is true for a
 * felled kubb sitting in the sin bin: it stays DYNAMIC and simply
 * rests there under gravity/friction like any other resting piece —
 * a stray stick reaching that far outside the throwing lanes could in
 * principle disturb it, but that's an accepted, low-probability
 * simplification, not a gap worth engineering around.
 */
export class SimpleRulesSystem extends createSystem({
  king: { required: [KingPiece] },
  standingKubbs: {
    required: [Resettable, PhysicsBody],
    excluded: [StickState, KingPiece, OutOfPlay],
  },
  outOfPlay: { required: [OutOfPlay] },
}) {
  private physicsSystem!: PhysicsSystem;
  private sinBinNextIndex = 0;
  private unsubscribeKubbFelled?: () => void;
  private unsubscribeReset?: () => void;

  init(): void {
    const physicsSystem = this.world.getSystem(PhysicsSystem);
    if (!physicsSystem) {
      throw new Error(
        'SimpleRulesSystem requires PhysicsSystem — enable the "physics" world feature in iwsdk.config.json',
      );
    }
    this.physicsSystem = physicsSystem;

    this.unsubscribeKubbFelled = gameEvents.on('KubbFelled', (e) => {
      this.onKubbFelled(e.entityId);
    });
    this.unsubscribeReset = gameEvents.on('Reset', () => {
      this.onReset();
    });
    this.applyKingProtection();
  }

  destroy(): void {
    this.unsubscribeKubbFelled?.();
    this.unsubscribeReset?.();
  }

  private onKubbFelled(entityId: string): void {
    if (settingsState.current.gameMode !== 'simple') {
      return;
    }
    const entity = this.world.entityManager.getEntityByIndex(Number(entityId));
    if (!entity || entity.hasComponent(OutOfPlay)) {
      return;
    }
    const position = sinBinSlotPosition(
      this.sinBinNextIndex,
      pieces.kubb.heightM,
      sinBin,
    );
    this.sinBinNextIndex += 1;
    this.physicsSystem.setBodyTransform(entity, {
      position,
      quaternion: IDENTITY_QUATERNION,
    });
    entity.addComponent(OutOfPlay);
    this.applyKingProtection();
  }

  private onReset(): void {
    this.sinBinNextIndex = 0;
    for (const entity of [...this.queries.outOfPlay.entities]) {
      entity.removeComponent(OutOfPlay);
    }
    this.applyKingProtection();
  }

  private applyKingProtection(): void {
    const kingEntity = [...this.queries.king.entities][0];
    if (!kingEntity) {
      return;
    }
    const shouldProtect =
      settingsState.current.gameMode === 'simple' &&
      this.queries.standingKubbs.entities.size > 0;
    if (shouldProtect && !kingEntity.hasComponent(KingProtected)) {
      kingEntity.addComponent(KingProtected);
    } else if (!shouldProtect && kingEntity.hasComponent(KingProtected)) {
      kingEntity.removeComponent(KingProtected);
    }
  }
}
