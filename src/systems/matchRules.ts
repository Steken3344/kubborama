import { createSystem, PhysicsSystem } from '@iwsdk/core';
import type { Entity } from '@iwsdk/core';
import { KingPiece } from '../components/king-piece.js';
import { KingProtected } from '../components/king-protected.js';
import { OutOfPlay } from '../components/out-of-play.js';
import { match, pieces, sinBin } from '../config.js';
import { KUBB_COUNT } from '../core/court-layout.js';
import { gameEvents } from '../core/events.js';
import type { GameEvents } from '../core/events.js';
import { isFinished } from '../core/match.js';
import { sinBinPlacements } from '../core/matchSinBin.js';
import type { SinBinPlacement } from '../core/matchSinBin.js';
import { log } from '../core/log.js';
import { matchActivity } from '../matchActivityState.js';
import { activeFarBaselineZ } from './activeCourt.js';

/**
 * MP3a (Erik, 2026-09-05 — docs/superpowers/specs/2026-09-05-match-
 * rules-design.md): the physical side of a multiplayer match. Purely
 * event-driven off the bus, never off the network:
 *
 * - MatchStateChanged: on the first one, switch the shared
 *   matchActivity flag on and strip KingProtected from the king (in the
 *   default Simple mode it is already present from solo play and
 *   nothing else would ever remove it — the match could never be won,
 *   spec review C1). Then diff `sinBinPlacements(state)` against the
 *   placements last applied: added → teleport + OutOfPlay; removed →
 *   drop OutOfPlay (positions come from MenuSystem's teleport on the
 *   host and pieceSync on the guest). Runs identically on BOTH clients
 *   from the same state, so no extra message is needed. On the host, a
 *   finished match starts the auto-restart countdown (idempotent — the
 *   reducer re-emits the same finished state on every round end).
 * - MultiplayerPeerDisconnected: flag off, forget placements, cancel the
 *   countdown, then ask for a full reset so the ex-player is not left
 *   with kubbs in the sin-bin, ToppleSystem's felledReported still set,
 *   and a stale king tag (spec review I3).
 *
 * Why OutOfPlay matters on the GUEST too: its own RoundSystem ends
 * rounds after six local throws and its MenuSystem then runs
 * resetAll('roundEnd') — without the tag that reset would visibly yank
 * the sin-bin kubbs home until the next pieceSync (spec review I4).
 */
export class MatchRulesSystem extends createSystem({
  king: { required: [KingPiece] },
}) {
  private physicsSystem!: PhysicsSystem;
  private kubbEntities = new Map<string, Entity>();
  private applied: SinBinPlacement[] = [];
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
    for (let i = 0; i < KUBB_COUNT * 2; i++) {
      const id = `kubb-${i}`;
      this.kubbEntities.set(id, this.world.requireSceneEntity(id));
    }
    this.cleanupFuncs.push(
      gameEvents.on('MatchStateChanged', (event) => {
        this.onMatchStateChanged(event);
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
    this.restartInS = null;
    log('info', 'state', 'match auto-restart', {});
    gameEvents.emit('ResetRequested', {});
  }

  private onMatchStateChanged(event: GameEvents['MatchStateChanged']): void {
    if (!matchActivity.current.active) {
      matchActivity.current.active = true;
      this.unprotectKing();
      log('info', 'state', 'match rules active', {});
    }
    const next = sinBinPlacements(event.state, {
      sinBin,
      kubbHeightM: pieces.kubb.heightM,
      farZ: activeFarBaselineZ(),
    });
    const nextIds = new Set(next.map((p) => p.kubbId));
    const appliedIds = new Set(this.applied.map((p) => p.kubbId));
    for (const placement of next) {
      if (appliedIds.has(placement.kubbId)) {
        continue;
      }
      const entity = this.kubbEntities.get(placement.kubbId);
      if (!entity) {
        continue;
      }
      this.physicsSystem.setBodyTransform(entity, {
        position: placement.position,
        quaternion: placement.quaternion,
      });
      if (!entity.hasComponent(OutOfPlay)) {
        entity.addComponent(OutOfPlay);
      }
    }
    for (const placement of this.applied) {
      if (nextIds.has(placement.kubbId)) {
        continue;
      }
      const entity = this.kubbEntities.get(placement.kubbId);
      if (entity?.hasComponent(OutOfPlay)) {
        entity.removeComponent(OutOfPlay);
      }
    }
    this.applied = next;

    if (isFinished(event.state)) {
      if (event.mySide === 'host' && this.restartInS === null) {
        this.restartInS = match.restartDelayS;
      }
    } else {
      this.restartInS = null;
    }
  }

  private onPeerDisconnected(): void {
    matchActivity.current.active = false;
    this.applied = [];
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
