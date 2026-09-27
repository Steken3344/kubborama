import { createSystem, PhysicsSystem } from '@iwsdk/core';
import type { Entity } from '@iwsdk/core';
import { KingPiece } from '../components/king-piece.js';
import { KingProtected } from '../components/king-protected.js';
import { OutOfPlay } from '../components/out-of-play.js';
import { inkast, match, pieces } from '../config.js';
import { KUBB_COUNT } from '../core/court-layout.js';
import { gameEvents } from '../core/events.js';
import type { GameEvents } from '../core/events.js';
import { inkastRackPosition } from '../core/inkast.js';
import { isFinished, kubbId } from '../core/match.js';
import type { MatchEffect, MatchSide } from '../core/match.js';
import type { Vec3 } from '../core/vec3.js';
import { log } from '../core/log.js';
import { gateLog } from '../debug/gateLog.js';
import { matchActivity } from '../matchActivityState.js';
import { activeCourtHalves } from './activeCourt.js';
import { MenuSystem } from './menu.js';
import { isServerModeOn } from '../serverMode.js';

const UPRIGHT: [number, number, number, number] = [0, 0, 0, 1];

/**
 * The physical side of a multiplayer match — MP3a (docs/superpowers/
 * specs/2026-09-05-match-rules-design.md), rebuilt for MP4 field kubbs
 * (docs/superpowers/specs/2026-09-26-field-kubbs-design.md). Purely
 * event-driven off the bus, never off the network:
 * - MatchStateChanged (both clients): on the first one, switch the
 *   shared matchActivity flag on and strip KingProtected from the king
 *   (in Simple mode it is present from solo play and nothing else would
 *   remove it — spec review C1). Then diff the INKAST QUEUE against the
 *   rack last applied: a newly queued kubb is stood in the thrower's
 *   rack (upright, OutOfPlay so a lying/flying kubb in the inkast never
 *   reports a topple); a kubb that left the queue loses OutOfPlay.
 *   Running this on the guest too gives immediate feedback; the host's
 *   pieceSync stays authoritative for positions. On the host, a
 *   finished match starts the auto-restart countdown.
 * - MatchEffects (host only — only the host's reducer emits them):
 *   raise a kubb upright where the reducer says, restore a baseline kubb
 *   to its home pose, or put a missed toss back in its rack slot. The
 *   guest sees the result through pieceSync.
 * - MultiplayerPeerDisconnected: flag off, forget the rack, cancel the
 *   countdown, then ask for a full reset (spec review I3).
 */
export class MatchRulesSystem extends createSystem({
  king: { required: [KingPiece] },
}) {
  private physicsSystem!: PhysicsSystem;
  private menuSystem!: MenuSystem;
  private kubbEntities = new Map<string, Entity>();
  /** kubbId → its rack slot position, for the kubbs currently queued. */
  private rack = new Map<string, Vec3>();
  /** Seconds left until the auto-restart; null = not counting. */
  private restartInS: number | null = null;

  init(): void {
    const physicsSystem = this.world.getSystem(PhysicsSystem);
    if (!physicsSystem) {
      throw new Error(
        'MatchRulesSystem requires PhysicsSystem — enable the "physics" world feature in iwsdk.config.json',
      );
    }
    this.physicsSystem = physicsSystem;
    const menuSystem = this.world.getSystem(MenuSystem);
    if (!menuSystem) {
      throw new Error(
        'MatchRulesSystem requires MenuSystem to be registered first',
      );
    }
    this.menuSystem = menuSystem;
    for (let i = 0; i < KUBB_COUNT * 2; i++) {
      const id = kubbId(i);
      this.kubbEntities.set(id, this.world.requireSceneEntity(id));
    }
    this.cleanupFuncs.push(
      gameEvents.on('MatchStateChanged', (event) => {
        this.onMatchStateChanged(event);
      }),
      gameEvents.on('MatchEffects', (event) => {
        for (const effect of event.effects) {
          this.applyEffect(effect);
        }
      }),
      gameEvents.on('MultiplayerPeerDisconnected', () => {
        this.onPeerDisconnected();
      }),
    );
  }

  update(delta: number): void {
    if (this.restartInS === null) {
      return;
    }
    this.restartInS -= delta;
    if (this.restartInS > 0) {
      return;
    }
    gateLog('match restart', {
      // restartInS has just crossed 0, so this is ≥ the configured delay.
      secondsSinceFinished: match.restartDelayS - this.restartInS,
    });
    this.restartInS = null;
    gameEvents.emit('ResetRequested', {});
  }

  private onMatchStateChanged(event: GameEvents['MatchStateChanged']): void {
    if (!matchActivity.current.active) {
      matchActivity.current.active = true;
      this.unprotectKing();
      log('info', 'state', 'match rules active', {});
    }
    this.syncRack(event.state.currentTurn, event.state.inkastQueue);

    if (isFinished(event.state)) {
      // The game server restarts its own match (MP6).
      if (
        event.mySide === 'host' &&
        this.restartInS === null &&
        !isServerModeOn()
      ) {
        this.restartInS = match.restartDelayS;
        log('info', 'match', 'match finished — restart countdown started', {
          winner: event.state.winner,
          endReason: event.state.endReason,
          restartInS: this.restartInS,
        });
      }
    } else {
      this.restartInS = null;
    }
  }

  private syncRack(
    thrower: MatchSide,
    queue: ReadonlyArray<{ kubbId: string }>,
  ): void {
    const queued = new Set(queue.map((item) => item.kubbId));
    for (const [id] of this.rack) {
      if (queued.has(id)) {
        continue;
      }
      this.rack.delete(id);
      const entity = this.kubbEntities.get(id);
      if (entity?.hasComponent(OutOfPlay)) {
        entity.removeComponent(OutOfPlay);
      }
    }
    const halves = activeCourtHalves();
    queue.forEach((item, slot) => {
      if (this.rack.has(item.kubbId)) {
        return;
      }
      const entity = this.kubbEntities.get(item.kubbId);
      if (!entity) {
        return;
      }
      const position = inkastRackPosition(halves, thrower, slot, queue.length, {
        offsetM: inkast.rackOffsetBehindBaselineM,
        spacingM: inkast.rackSpacingM,
        kubbHeightM: pieces.kubb.heightM,
      });
      this.rack.set(item.kubbId, position);
      if (!entity.hasComponent(OutOfPlay)) {
        entity.addComponent(OutOfPlay);
      }
      this.physicsSystem.setBodyTransform(entity, {
        position,
        quaternion: UPRIGHT,
      });
      log('info', 'match', 'kubb to inkast rack', {
        kubbId: item.kubbId,
        position,
      });
    });
  }

  private applyEffect(effect: MatchEffect): void {
    const entity = this.kubbEntities.get(effect.kubbId);
    if (!entity) {
      return;
    }
    if (effect.type === 'returnToRack') {
      const slot = this.rack.get(effect.kubbId);
      if (slot) {
        this.physicsSystem.setBodyTransform(entity, {
          position: slot,
          quaternion: UPRIGHT,
        });
      }
      gateLog('kubb returned to rack', { kubbId: effect.kubbId });
      return;
    }
    if (effect.type === 'restoreHome') {
      const home = this.menuSystem.homePoseOf(entity.index);
      if (home) {
        this.physicsSystem.setBodyTransform(entity, {
          position: home.position,
          quaternion: home.quaternion,
        });
      }
    } else {
      if (entity.hasComponent(OutOfPlay)) {
        entity.removeComponent(OutOfPlay);
      }
      this.physicsSystem.setBodyTransform(entity, {
        position: [effect.x, pieces.kubb.heightM / 2, effect.z],
        quaternion: UPRIGHT,
      });
    }
    gateLog('kubb raised', { kubbId: effect.kubbId, reason: effect.reason });
  }

  private onPeerDisconnected(): void {
    matchActivity.current.active = false;
    for (const [id] of this.rack) {
      const entity = this.kubbEntities.get(id);
      if (entity?.hasComponent(OutOfPlay)) {
        entity.removeComponent(OutOfPlay);
      }
    }
    this.rack.clear();
    this.restartInS = null;
    log('info', 'state', 'match rules inactive — room empty', {});
    gameEvents.emit('ResetRequested', {});
  }

  private unprotectKing(): void {
    for (const king of this.queries.king.entities) {
      if (king.hasComponent(KingProtected)) {
        king.removeComponent(KingProtected);
      }
    }
  }
}
