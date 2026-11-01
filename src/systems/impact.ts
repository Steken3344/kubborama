import {
  createSystem,
  eq,
  GrabSystem,
  Grabbed,
  PhysicsBody,
  PhysicsState,
  Vector3,
} from '@iwsdk/core';
import type { Entity } from '@iwsdk/core';
import { KingPiece } from '../components/king-piece.js';
import { StickPhase, StickState } from '../components/stick-state.js';
import { audio, pieces } from '../config.js';
import { stickImpactTier } from '../core/audio.js';
import { gameEvents } from '../core/events.js';
import { impactRumble } from '../core/haptics.js';
import { detectImpact, inReleaseGrace } from '../core/impactDetector.js';
import { log } from '../core/log.js';
import { lerp, normalizedClamped } from '../core/mathUtils.js';
import { createRng } from '../core/rng.js';
import { createStartupGate } from '../core/startupGrace.js';
import type { Vec3 } from '../core/vec3.js';
import { isHand, pulseHaptic } from './hapticPlayer.js';
import { playSfxVariant } from './playSfx.js';
import type { SfxCategoryName } from './sfxLibrary.js';

/** Deterministic per-session impact-sfx-variant picker — not the physics RNG. */
const IMPACT_SFX_SEED = 7331;

/**
 * No public collision-event API exists (see docs/DECISIONS.md): this
 * is the |delta v|-per-tick heuristic applied to every dynamic body.
 * Emits Impact for M3's future topple logic to consume, fires
 * impactRumble haptics on whichever hand is responsible for a stick's
 * motion (the thrower mid-flight, or the holder if it's being knocked
 * around while held — gh#4, "klonk two held sticks together"), and
 * plays an impact sound classified from the impacting entity's own
 * type + force (never the contact partner — the heuristic has no way
 * to know what a piece hit, see docs/DECISIONS.md, M5).
 */
export class ImpactSystem extends createSystem({
  dynamicBodies: {
    required: [PhysicsBody],
    where: [eq(PhysicsBody, 'state', PhysicsState.Dynamic)],
  },
  // Anything held: letting go starts the release grace (whatever the
  // body's state while it was in the hand).
  held: { required: [Grabbed] },
  bodies: { required: [PhysicsBody] },
}) {
  // One persisted Vec3 per entity (allocated once, on first sighting),
  // mutated in place every frame after that — see docs/DECISIONS.md,
  // fresh-eyes M2 review nitpick about per-frame allocation here.
  private previousVelocity = new Map<number, Vec3>();
  /** When each piece was let go (release grace), and the clock. */
  private releasedAtS = new Map<number, number>();
  private nowS = 0;
  private tmpCurr: Vec3 = [0, 0, 0];
  private tmpPos = new Vector3();
  private sfxRng = createRng(IMPACT_SFX_SEED);
  private isPastStartupGrace = createStartupGate(pieces.throw.startupGraceS);
  private grabSystem!: GrabSystem;

  init(): void {
    const grabSystem = this.world.getSystem(GrabSystem);
    if (!grabSystem) {
      throw new Error(
        'ImpactSystem requires GrabSystem — enable the "grabbing" world feature in iwsdk.config.json',
      );
    }
    this.grabSystem = grabSystem;
    // Grabbing (the stick glides into the hand) and letting go both jump
    // the body's velocity in a frame or two: neither is a hit.
    this.queries.held.subscribe('qualify', (entity) => {
      this.releasedAtS.set(entity.index, this.nowS);
    });
    this.queries.held.subscribe('disqualify', (entity) => {
      this.releasedAtS.set(entity.index, this.nowS);
    });
    // Server mode: flying and struck pieces follow the server's
    // snapshots, so local physics sees no impacts on them — the server
    // sends its own (core/impactWatch.ts). A held stick is still local
    // physics and detected above.
    this.cleanupFuncs.push(
      gameEvents.on('ServerImpact', (e) => {
        this.onServerImpact(e.entityIndex, e.deltaVMps, e.position);
      }),
    );
  }

  update(_delta: number, time: number): void {
    this.nowS = time;
    // Velocity bookkeeping always runs (skipping it would make the
    // first post-grace frame compare against a stale previousVelocity
    // and read a fake huge delta); only the impact reaction is gated.
    const isPastGrace = this.isPastStartupGrace(time);
    for (const entity of this.queries.dynamicBodies.entities) {
      const linVel = entity.getVectorView(PhysicsBody, '_linearVelocity');
      this.tmpCurr[0] = linVel[0] ?? 0;
      this.tmpCurr[1] = linVel[1] ?? 0;
      this.tmpCurr[2] = linVel[2] ?? 0;

      let prev = this.previousVelocity.get(entity.index);
      if (prev === undefined) {
        prev = [this.tmpCurr[0], this.tmpCurr[1], this.tmpCurr[2]];
        this.previousVelocity.set(entity.index, prev);
      }
      const { isImpact, deltaVMps } = detectImpact(
        prev,
        this.tmpCurr,
        pieces.throw.impactThresholdMps,
      );
      prev[0] = this.tmpCurr[0];
      prev[1] = this.tmpCurr[1];
      prev[2] = this.tmpCurr[2];

      // Tracked every frame (not only on a hit), so a release is seen.
      const releasing = this.releasing(entity, time);
      if (!isImpact || !isPastGrace || releasing) {
        continue;
      }

      let position: Vec3 = [0, 0, 0];
      const object3D = entity.object3D;
      if (object3D) {
        object3D.getWorldPosition(this.tmpPos);
        position = [this.tmpPos.x, this.tmpPos.y, this.tmpPos.z];
      }

      gameEvents.emit('Impact', {
        entityId: String(entity.index),
        forceMagnitude: deltaVMps,
        position,
        timeS: time,
      });
      log('debug', 'physics', 'impact', {
        entityIndex: entity.index,
        deltaVMps,
      });

      this.pulseHapticForStick(entity, deltaVMps);
      // undefined (not the [0,0,0] fallback above) when there's no
      // Object3D to anchor to, so the sound plays from the listener
      // instead of incorrectly appearing to come from world origin.
      this.playImpactSfx(entity, deltaVMps, object3D ? position : undefined);
    }
  }

  private onServerImpact(
    entityIndex: number,
    deltaVMps: number,
    position: Vec3,
  ): void {
    let entity: Entity | undefined;
    for (const e of this.queries.bodies.entities) {
      if (e.index === entityIndex) {
        entity = e;
        break;
      }
    }
    if (!entity || entity.hasComponent(Grabbed)) {
      return;
    }
    log('debug', 'physics', 'impact', {
      entityIndex,
      deltaVMps,
      source: 'server',
    });
    this.pulseHapticForStick(entity, deltaVMps);
    this.playImpactSfx(entity, deltaVMps, position);
  }

  /** True for a piece (a stick, an inkast kubb) in the moment after it
   * left the hand. */
  private releasing(entity: Entity, timeS: number): boolean {
    const releasedAt = this.releasedAtS.get(entity.index);
    if (inReleaseGrace(releasedAt, timeS, pieces.throw.releaseImpactGraceS)) {
      return true;
    }
    if (releasedAt !== undefined) {
      this.releasedAtS.delete(entity.index);
    }
    return false;
  }

  private pulseHapticForStick(entity: Entity, deltaVMps: number): void {
    if (!entity.hasComponent(StickState)) {
      return;
    }
    const hand =
      entity.getValue(StickState, 'phase') === StickPhase.Flying
        ? entity.getValue(StickState, 'lastThrowerHand')
        : entity.hasComponent(Grabbed)
          ? this.grabSystem.getHolderHand(entity)
          : null;
    if (!isHand(hand)) {
      return;
    }
    const pulse = impactRumble(
      deltaVMps,
      pieces.throw.impactMaxForceForFullHapticMps,
    );
    pulseHaptic(this.input.xr.gamepads[hand], pulse);
  }

  private playImpactSfx(
    entity: Entity,
    deltaVMps: number,
    position: Vec3 | undefined,
  ): void {
    // `t` can never actually be below
    // impactThresholdMps/impactMaxForceForFullHapticMps (0.25 at
    // current pieces.json values) — anything softer never counts as
    // an impact at all (detectImpact's own threshold). Keep
    // audio.json's stickImpact.softMaxNormalized comfortably above
    // that floor, or the "soft" tier silently never plays — a fresh-
    // eyes M5 review caught exactly this when the floor and the
    // threshold were equal (see docs/DECISIONS.md).
    const t = normalizedClamped(
      deltaVMps,
      pieces.throw.impactMaxForceForFullHapticMps,
    );
    const volume = lerp(t, audio.volume.impactMin, audio.volume.impactMax);
    const category = this.classifyImpact(entity, t);
    playSfxVariant(this.world, category, this.sfxRng, volume, position);
  }

  private classifyImpact(entity: Entity, t: number): SfxCategoryName {
    if (entity.hasComponent(KingPiece)) {
      return 'kingImpact';
    }
    if (!entity.hasComponent(StickState)) {
      return 'kubbImpact';
    }
    const tier = stickImpactTier(
      t,
      audio.stickImpact.softMaxNormalized,
      audio.stickImpact.lightMaxNormalized,
    );
    return tier === 'soft'
      ? 'stickSoft'
      : tier === 'light'
        ? 'stickLight'
        : 'stickMedium';
  }
}
