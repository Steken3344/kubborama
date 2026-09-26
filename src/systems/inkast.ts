import {
  createSystem,
  Grabbed,
  GrabSystem,
  OneHandGrabbable,
  PhysicsManipulation,
  Quaternion,
  Vector3,
} from '@iwsdk/core';
import type { Entity } from '@iwsdk/core';
import { OutOfPlay } from '../components/out-of-play.js';
import { StickState } from '../components/stick-state.js';
import { inkast, pieces } from '../config.js';
import { KUBB_COUNT } from '../core/court-layout.js';
import { gameEvents } from '../core/events.js';
import type { GameEvents } from '../core/events.js';
import { isLegalLanding } from '../core/inkast.js';
import { isFinished, kubbId, otherSide } from '../core/match.js';
import type { MatchSide, MatchState } from '../core/match.js';
import { log } from '../core/log.js';
import { accumulateHeldDuration, isResting } from '../core/restState.js';
import { computeThrowRelease } from '../core/throwRelease.js';
import type { Vec3 } from '../core/vec3.js';
import { gateLog } from '../debug/gateLog.js';
import { inkastLock } from '../matchActivityState.js';
import { activeCourtHalves } from './activeCourt.js';
import { readBodySpeed } from './bodySpeed.js';
import { MultiplayerSystem } from './multiplayer.js';
import { localPoseOf } from './objectPose.js';
import { PoseSampler, releaseWindowFrames } from './poseSampler.js';

/** The scene's own OneHandGrabbable config for sticks (main.iwsdk.scene.
 * json) — re-added after the inkast, and used for tossable kubbs. */
const GRAB_CONFIG = { rotate: true, translate: true };

interface Toss {
  kubbId: string;
  sinceS: number;
  restS: number;
}

/**
 * MP4 inkast (docs/superpowers/specs/2026-09-26-field-kubbs-design.md):
 * the physical toss of the kubbs felled last turn.
 * - While the match is in phase 'inkast', every stick loses its grab
 *   component (and StickPullSystem pauses via `inkastLock`), so the six
 *   batons only start once the inkast is done and RoundSystem's stick
 *   accounting never sees an inkast. The THROWER's queued kubbs — standing
 *   in the rack MatchRulesSystem placed — become grabbable.
 * - A released kubb gets its velocity from the same pose samples and
 *   release maths as a stick (core/throwRelease.ts) with the inkast's own
 *   multipliers. The host's own toss emits KubbTossed; a guest applies it
 *   locally as prediction and relays it (throwRelay v2), and the host's
 *   MultiplayerSystem emits KubbTossed for it.
 * - Host only: a tossed kubb that has come to rest (or timed out) is
 *   reported as InkastLanded; the reducer decides legal / retry / clamp.
 */
export class InkastSystem extends createSystem({
  heldKubbs: { required: [OutOfPlay, Grabbed], excluded: [StickState] },
  sticks: { required: [StickState] },
}) {
  private grabSystem!: GrabSystem;
  private multiplayerSystem!: MultiplayerSystem;
  private kubbEntities = new Map<string, Entity>();
  private kubbIdByIndex = new Map<number, string>();
  private poseSampler = new PoseSampler();
  private lastHand = new Map<number, 'left' | 'right'>();
  private tosses = new Map<number, Toss>();
  private state: MatchState | null = null;
  private mySide: MatchSide | null = null;
  private nowS = 0;
  private tmpPos = new Vector3();
  private tmpQuat = new Quaternion();
  private tmpSpeed: [number, number] = [0, 0];

  init(): void {
    const grabSystem = this.world.getSystem(GrabSystem);
    const multiplayerSystem = this.world.getSystem(MultiplayerSystem);
    if (!grabSystem || !multiplayerSystem) {
      throw new Error(
        'InkastSystem requires GrabSystem and MultiplayerSystem to be registered first',
      );
    }
    this.grabSystem = grabSystem;
    this.multiplayerSystem = multiplayerSystem;
    for (let i = 0; i < KUBB_COUNT * 2; i++) {
      const id = kubbId(i);
      const entity = this.world.requireSceneEntity(id);
      this.kubbEntities.set(id, entity);
      this.kubbIdByIndex.set(entity.index, id);
    }
    this.queries.heldKubbs.subscribe('qualify', (entity) => {
      this.poseSampler.start(entity.index);
    });
    this.queries.heldKubbs.subscribe('disqualify', (entity) => {
      this.onRelease(entity);
    });
    this.cleanupFuncs.push(
      gameEvents.on('MatchStateChanged', (e) => {
        this.onMatchStateChanged(e);
      }),
      gameEvents.on('MultiplayerPeerDisconnected', () => {
        this.state = null;
        this.mySide = null;
        this.tosses.clear();
        this.applyGrabbability();
      }),
      gameEvents.on('KubbTossed', (e) => {
        const entity = this.kubbEntities.get(e.kubbId);
        if (entity && this.mySide === 'host') {
          this.tosses.set(entity.index, {
            kubbId: e.kubbId,
            sinceS: this.nowS,
            restS: 0,
          });
        }
      }),
    );
  }

  update(delta: number, timeS: number): void {
    this.nowS = timeS;
    for (const entity of this.queries.heldKubbs.entities) {
      this.sampleHand(entity, timeS);
    }
    for (const [index, toss] of this.tosses) {
      this.checkLanding(index, toss, delta, timeS);
    }
  }

  private onMatchStateChanged(e: GameEvents['MatchStateChanged']): void {
    this.state = e.state;
    this.mySide = e.mySide;
    this.applyGrabbability();
  }

  /** Sticks: grabbable unless an inkast is running. Kubbs: grabbable only
   * for the thrower, only while queued. Idempotent. */
  private applyGrabbability(): void {
    const state = this.state;
    const inkastActive =
      state !== null && !isFinished(state) && state.phase === 'inkast';
    inkastLock.current.active = inkastActive;
    for (const stick of this.queries.sticks.entities) {
      setGrabbable(stick, !inkastActive);
    }
    const tossable = new Set(
      inkastActive && state && state.currentTurn === this.mySide
        ? state.inkastQueue.map((item) => item.kubbId)
        : [],
    );
    for (const [id, entity] of this.kubbEntities) {
      if (entity.hasComponent(Grabbed)) {
        continue; // never yank a kubb out of a hand mid-toss
      }
      setGrabbable(entity, tossable.has(id));
    }
  }

  private sampleHand(entity: Entity, timeS: number): void {
    const hand = this.grabSystem.getHolderHand(entity);
    if (hand === null) {
      return;
    }
    this.lastHand.set(entity.index, hand);
    const grip =
      hand === 'left'
        ? this.player.gripSpaces.left
        : this.player.gripSpaces.right;
    grip.getWorldPosition(this.tmpPos);
    grip.getWorldQuaternion(this.tmpQuat);
    this.poseSampler.sample(
      entity.index,
      timeS,
      this.tmpPos,
      this.tmpQuat,
      releaseWindowFrames(),
    );
  }

  private onRelease(entity: Entity): void {
    const id = this.kubbIdByIndex.get(entity.index);
    const object3D = entity.object3D;
    if (!id || !object3D) {
      return;
    }
    object3D.getWorldPosition(this.tmpPos);
    const releasePosition: Vec3 = [this.tmpPos.x, this.tmpPos.y, this.tmpPos.z];
    const { linearVelocity, angularVelocity, releaseSpeedMps } =
      computeThrowRelease({
        poses: this.poseSampler.take(entity.index),
        releasePosition,
        velocityMultiplier: inkast.tossVelocityMultiplier,
        angularMultiplier: inkast.tossAngularMultiplier,
      });
    entity.addComponent(PhysicsManipulation, {
      force: [0, 0, 0],
      linearVelocity,
      angularVelocity,
    });
    setGrabbable(entity, false);
    const hand = this.lastHand.get(entity.index) ?? 'right';
    log('info', 'throw', 'inkast toss', { kubbId: id, releaseSpeedMps, hand });
    if (this.mySide === 'host') {
      gameEvents.emit('KubbTossed', { kubbId: id });
    } else {
      this.multiplayerSystem.relayToss(
        id,
        releasePosition,
        localPoseOf(object3D).quaternion,
        linearVelocity,
        angularVelocity,
        hand,
      );
    }
  }

  /** Host only (tosses are only tracked there): at rest for the stick
   * rest duration, or out of time → InkastLanded. */
  private checkLanding(
    index: number,
    toss: Toss,
    delta: number,
    timeS: number,
  ): void {
    const entity = this.kubbEntities.get(toss.kubbId);
    const p = entity?.object3D?.position;
    if (!entity || !p) {
      this.tosses.delete(index);
      return;
    }
    readBodySpeed(entity, this.tmpSpeed);
    toss.restS = isResting(this.tmpSpeed[0], this.tmpSpeed[1], pieces.throw)
      ? accumulateHeldDuration(toss.restS, delta)
      : 0;
    const timedOut = timeS - toss.sinceS >= inkast.maxTossFlightS;
    if (toss.restS < pieces.throw.restDurationS && !timedOut) {
      return;
    }
    this.tosses.delete(index);
    const state = this.state;
    if (state) {
      const attempt =
        state.inkastQueue.find((i) => i.kubbId === toss.kubbId)?.attempt ??
        null;
      gateLog('inkast landed', {
        kubbId: toss.kubbId,
        legal: isLegalLanding(
          activeCourtHalves(),
          otherSide(state.currentTurn),
          p.x,
          p.z,
        ),
        attempt,
        timedOut,
      });
    }
    gameEvents.emit('InkastLanded', { kubbId: toss.kubbId, x: p.x, z: p.z });
  }
}

function setGrabbable(entity: Entity, grabbable: boolean): void {
  const has = entity.hasComponent(OneHandGrabbable);
  if (grabbable && !has) {
    entity.addComponent(OneHandGrabbable, GRAB_CONFIG);
  } else if (!grabbable && has) {
    entity.removeComponent(OneHandGrabbable);
  }
}
