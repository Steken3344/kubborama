import {
  createSystem,
  eq,
  Grabbed,
  GrabSystem,
  PhysicsManipulation,
  PhysicsSystem,
  Quaternion,
  Vector3,
} from '@iwsdk/core';
import type { Entity } from '@iwsdk/core';
import { StickPhase, StickState } from '../components/stick-state.js';
import { audio, pieces } from '../config.js';
import { createRng } from '../core/rng.js';
import { gameEvents } from '../core/events.js';
import { grabTick, releaseClick } from '../core/haptics.js';
import type { HapticPulse } from '../core/haptics.js';
import { log } from '../core/log.js';
import { isResting } from '../core/restState.js';
import { readBodySpeed } from './bodySpeed.js';
import type { Hand } from './hapticPlayer.js';
import { pulseHaptic } from './hapticPlayer.js';
import { playSfxVariant } from './playSfx.js';
import { aimTargetIds, assistAim } from '../core/aimAssist.js';
import { initialMatchState } from '../core/match.js';
import type { MatchSide, MatchState } from '../core/match.js';
import { settingsState } from '../settingsState.js';
import { roomState } from '../roomState.js';
import { assistRelease } from '../core/throwAssist.js';
import { computeThrowRelease, isThrowRelease } from '../core/throwRelease.js';
import { activePreset, percentToReal, tuningParams } from '../core/tuning.js';
import { classifyThrow } from '../core/underhandClassifier.js';
import { PoseSampler, releaseWindowFrames } from './poseSampler.js';
import type { Vec3 } from '../core/vec3.js';
import { presetBank } from '../tuningState.js';

/** What practice throws aim at: a fresh match's far baseline. */
const PRACTICE_STATE = initialMatchState();
/** A standing kubb's centre is ~0.15 m up, a lying one's ~0.035 m. */
const UPRIGHT_KUBB_MIN_Y = 0.09;

/** Deterministic per-session foley-variant picker — not the physics RNG. */
const FOLEY_SFX_SEED = 4242;

/**
 * The stick state machine (Racked -> Held -> Flying -> Settled) and the
 * throw-release adapter: samples the holding hand's grip pose every
 * frame, and on release calls core/throwRelease.ts's frame-averaged
 * velocity + lever-arm math, applying the result via
 * PhysicsManipulation (one-shot). No velocity transfer happens
 * anywhere else — the grab system does not do this on its own (see
 * docs/DECISIONS.md). The release-smoothing window and velocity/spin
 * multipliers come from the live tuning preset (src/tuningState.ts),
 * not a fixed constant, so the tuning lab can change throw feel live.
 */
export class ThrowingSystem extends createSystem({
  heldSticks: { required: [StickState, Grabbed] },
  flyingSticks: {
    required: [StickState],
    where: [eq(StickState, 'phase', StickPhase.Flying)],
  },
}) {
  private grabSystem!: GrabSystem;
  private poseSampler = new PoseSampler();
  private lastKnownHand = new Map<number, Hand>();
  private restTimerStartS = new Map<number, number>();
  private flyingStartS = new Map<number, number>();
  private currentTimeS = 0;
  private foleyRng = createRng(FOLEY_SFX_SEED);

  private tmpPos = new Vector3();
  private tmpQuat = new Quaternion();
  private tmpComPos = new Vector3();
  private tmpSpeed: [number, number] = [0, 0];

  private physicsSystem: PhysicsSystem | null = null;
  /** The match as this headset sees it, for the throw help's targets. */
  private matchState: MatchState | null = null;
  private mySide: MatchSide | null = null;
  private readonly targetPos = new Vector3();

  init(): void {
    const grabSystem = this.world.getSystem(GrabSystem);
    if (!grabSystem) {
      throw new Error(
        'ThrowingSystem requires GrabSystem — enable the "grabbing" world feature in iwsdk.config.json',
      );
    }
    this.grabSystem = grabSystem;
    this.physicsSystem = this.world.getSystem(PhysicsSystem) ?? null;
    this.cleanupFuncs.push(
      gameEvents.on('MatchStateChanged', ({ state, mySide }) => {
        this.matchState = state;
        this.mySide = mySide;
      }),
      gameEvents.on('MultiplayerPeerDisconnected', () => {
        this.matchState = null;
        this.mySide = null;
      }),
    );
    this.queries.heldSticks.subscribe('qualify', (entity) => {
      this.onGrabStart(entity);
    });
    this.queries.heldSticks.subscribe('disqualify', (entity) => {
      this.onRelease(entity);
    });
    // Stamp flight start on ENTRY into the Flying phase, not in
    // onRelease() — a guest's relayed throw (MultiplayerSystem.
    // applyThrowRelay) sets phase Flying without going through
    // onRelease, and the force-settle timeout below must cover those
    // sticks too (code review, 2026-09-02: they're exactly the sticks
    // whose settling gates the turn returning to the host). The
    // disqualify cleanup also removes the stale-entry hazard: a stick
    // reset mid-flight (phase -> Racked) leaves Flying and drops its
    // timer, so a later re-throw can never inherit an old timestamp
    // and force-settle instantly.
    this.queries.flyingSticks.subscribe('qualify', (entity) => {
      // For a relayed throw this fires from a network callback, so the
      // stamp is the LAST frame's time — ≤ 1 frame early against a 5 s
      // timeout. Known edge: if the loop is paused (XR session blurred)
      // when a relay lands, the stamp is older by the pause and the
      // stick can force-settle early on resume. Accepted.
      this.flyingStartS.set(entity.index, this.currentTimeS);
    });
    this.queries.flyingSticks.subscribe('disqualify', (entity) => {
      this.flyingStartS.delete(entity.index);
      this.restTimerStartS.delete(entity.index);
    });
  }

  update(_delta: number, time: number): void {
    this.currentTimeS = time;
    for (const entity of this.queries.heldSticks.entities) {
      this.samplePose(entity, time);
    }
    for (const entity of this.queries.flyingSticks.entities) {
      this.checkForSettling(entity, time);
    }
  }

  private gripSpaceFor(hand: Hand) {
    return hand === 'left'
      ? this.player.gripSpaces.left
      : this.player.gripSpaces.right;
  }

  private samplePose(entity: Entity, timeS: number): void {
    const hand = this.grabSystem.getHolderHand(entity);
    if (hand === null) {
      return;
    }
    this.lastKnownHand.set(entity.index, hand);
    const gripSpace = this.gripSpaceFor(hand);
    gripSpace.getWorldPosition(this.tmpPos);
    gripSpace.getWorldQuaternion(this.tmpQuat);

    this.poseSampler.sample(
      entity.index,
      timeS,
      this.tmpPos,
      this.tmpQuat,
      releaseWindowFrames(),
    );
  }

  private onGrabStart(entity: Entity): void {
    this.poseSampler.start(entity.index);
    entity.setValue(StickState, 'phase', StickPhase.Held);
    const hand = this.grabSystem.getHolderHand(entity);
    if (hand !== null) {
      this.lastKnownHand.set(entity.index, hand);
    }
    this.pulseHapticAndFoley(hand, grabTick);
    log('debug', 'grab', 'stick grabbed', { entityIndex: entity.index, hand });
  }

  /** The throw help (core/aimAssist.ts): bend a near miss towards a
   * kubb this player may aim at — once per release, so the target
   * lookups may allocate. */
  private withAimAssist(from: Vec3, velocity: Vec3): Vec3 {
    const level = settingsState.current.aimAssist;
    if (level === 'off') {
      return velocity;
    }
    // In a match: only on my own throwing turn, at what the rules allow.
    // Practice (no match): at the far baseline's kubbs, as in a fresh
    // match — Erik practises alone, and that is where the help is learnt.
    const state = this.matchState ?? PRACTICE_STATE;
    // Practice: my seat's side (a lone player may sit on B's side).
    const side = this.mySide ?? roomState.seatSide ?? 'host';
    if (
      this.matchState &&
      (state.currentTurn !== side ||
        state.phase !== 'throwing' ||
        state.winner !== null)
    ) {
      return velocity;
    }
    const targets: Vec3[] = [];
    for (const id of aimTargetIds(state, side)) {
      const object3D = this.world.getSceneEntity?.(id)?.object3D;
      if (object3D) {
        object3D.getWorldPosition(this.targetPos);
        // Lying (felled in practice, not yet stood up): not a target.
        if (this.targetPos.y < UPRIGHT_KUBB_MIN_Y) continue;
        targets.push([this.targetPos.x, this.targetPos.y, this.targetPos.z]);
      }
    }
    const help = pieces.throw.aimAssist;
    return assistAim(from, velocity, targets, {
      strength: help[level].strength,
      radiusM: help[level].radiusM,
      aimHeightM: help.aimHeightM,
    });
  }

  private onRelease(entity: Entity): void {
    const buffer = this.poseSampler.take(entity.index);

    let releasePosition: Vec3 = [0, 0, 0];
    const object3D = entity.object3D;
    if (object3D) {
      object3D.getWorldPosition(this.tmpComPos);
      releasePosition = [this.tmpComPos.x, this.tmpComPos.y, this.tmpComPos.z];
    }

    const preset = activePreset(presetBank);
    const velocityMultiplier = percentToReal(
      tuningParams.velocityTransferMultiplier,
      preset.velocityTransferMultiplier,
    );
    const angularMultiplier = percentToReal(
      tuningParams.angularMultiplier,
      preset.angularMultiplier,
    );
    const {
      linearVelocity: handVelocity,
      angularVelocity: handSpin,
      releaseSpeedMps,
    } = computeThrowRelease({
      poses: buffer,
      releasePosition,
      velocityMultiplier,
      angularMultiplier,
    });

    if (!isThrowRelease(releaseSpeedMps, pieces.throw.minThrowSpeedMps)) {
      // Put down or re-gripped, not thrown: back to the rack, uncounted.
      entity.setValue(StickState, 'phase', StickPhase.Racked);
      log('info', 'throw', 'stick put back', {
        entityIndex: entity.index,
        releaseSpeedMps,
      });
      gameEvents.emit('StickPutBack', { entityIndex: entity.index });
      return;
    }
    // The throw help may slow a soft throw; never below what counts as a
    // throw, or the headset would fly a stick the server leaves racked.
    const assistedVelocity = this.withAimAssist(releasePosition, handVelocity);
    const linearVelocity = isThrowRelease(
      Math.hypot(...assistedVelocity),
      pieces.throw.minThrowSpeedMps,
    )
      ? assistedVelocity
      : handVelocity;
    // The swing decides, not the wrist (core/throwAssist.ts): the spin
    // keeps its end-over-end part, the stick turns into the throw's plane.
    let angularVelocity = handSpin;
    if (object3D) {
      const q = object3D.quaternion;
      const assisted = assistRelease(
        linearVelocity,
        handSpin,
        [q.x, q.y, q.z, q.w],
        pieces.throw,
      );
      angularVelocity = assisted.angularVelocity;
      const [qx, qy, qz, qw] = assisted.quaternion;
      object3D.quaternion.set(qx, qy, qz, qw);
      this.physicsSystem?.setBodyTransform(entity, {
        position: releasePosition,
        quaternion: assisted.quaternion,
      });
    }
    entity.addComponent(PhysicsManipulation, {
      force: [0, 0, 0],
      linearVelocity,
      angularVelocity,
    });
    entity.setValue(StickState, 'phase', StickPhase.Flying);
    // flyingStartS is stamped by the flyingSticks qualify subscription
    // (init()) so relayed throws are covered by the same path.

    const hand = this.lastKnownHand.get(entity.index) ?? 'right';
    entity.setValue(StickState, 'lastThrowerHand', hand);
    this.pulseHapticAndFoley(hand, releaseClick);

    // Judged on the hand's own release, before any assist, so the style
    // and flip score (HUD, tuning lab, telemetry) stay the player's.
    const classification = classifyThrow({
      poses: buffer,
      releaseVelocity: handVelocity,
      angularVelocity: handSpin,
    });

    gameEvents.emit('Thrown', {
      stickId: String(entity.index),
      handId: hand,
      releaseSpeedMps,
      releaseVelocity: linearVelocity,
      angularVelocity,
      releasePosition,
      style: classification.style,
      flipQualityScore: classification.flipQualityScore,
      presetId: presetBank.activePresetId,
      timeS: this.currentTimeS,
    });
    log('info', 'throw', 'release', {
      entityIndex: entity.index,
      hand,
      releaseSpeedMps,
      angularVelocity,
      style: classification.style,
      flipQualityScore: classification.flipQualityScore,
    });

    // restTimerStartS/flyingStartS are owned by the flyingSticks
    // qualify/disqualify subscriptions in init() — not cleared here.
  }

  /**
   * A stick that never comes to rest (rolls around indefinitely —
   * Erik, 2026-09-02, live-tested with 2 real players) would otherwise
   * block `RoundSystem.maybeEndRound()` forever, since it only fires
   * once every stick has settled — and in multiplayer, that's also the
   * turn never passing to the other player. `maxFlightTimeS` force-
   * settles a stick that's been Flying too long regardless of its
   * actual rest state; the imminent round-end reset (MenuSystem)
   * teleports it back to the rack and clears its velocity anyway, so
   * forcing the phase here doesn't leave a "phantom moving stick."
   */
  private checkForSettling(entity: Entity, timeS: number): void {
    const flyingSinceS = this.flyingStartS.get(entity.index);
    const timedOut =
      flyingSinceS !== undefined &&
      timeS - flyingSinceS >= pieces.throw.maxFlightTimeS;

    if (!timedOut) {
      readBodySpeed(entity, this.tmpSpeed);
      const resting = isResting(
        this.tmpSpeed[0],
        this.tmpSpeed[1],
        pieces.throw,
      );
      if (!resting) {
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
    }

    this.settleStick(entity, timeS, timedOut);
  }

  private settleStick(
    entity: Entity,
    timeS: number,
    forcedByTimeout: boolean,
  ): void {
    // Leaving Flying — the flyingSticks disqualify subscription (init())
    // clears both timer maps for this entity.
    entity.setValue(StickState, 'phase', StickPhase.Settled);
    if (forcedByTimeout) {
      log('warn', 'state', 'stick force-settled — never came to rest', {
        entityIndex: entity.index,
        maxFlightTimeS: pieces.throw.maxFlightTimeS,
      });
    } else {
      log('debug', 'state', 'stick settled', { entityIndex: entity.index });
    }

    let position: Vec3 = [0, 0, 0];
    const object3D = entity.object3D;
    if (object3D) {
      object3D.getWorldPosition(this.tmpComPos);
      position = [this.tmpComPos.x, this.tmpComPos.y, this.tmpComPos.z];
    }
    gameEvents.emit('Settled', {
      stickId: String(entity.index),
      position,
      timeS,
    });
  }

  private pulseHapticAndFoley(hand: Hand | null, pattern: HapticPulse): void {
    if (hand === null) {
      return;
    }
    pulseHaptic(this.input.xr.gamepads[hand], pattern);
    playSfxVariant(this.world, 'foley', this.foleyRng, audio.volume.foley);
  }
}
