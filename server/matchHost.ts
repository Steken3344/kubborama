import {
  courtPresetForMode,
  getCourtPreset,
  getGameMode,
  inkast,
  match,
  pieces,
  round,
  windVectorForMode,
} from '../src/config.js';
import { farBaselineZ } from '../src/core/court-layout.js';
import {
  courtHalves,
  inkastRackPosition,
  isLegalLanding,
} from '../src/core/inkast.js';
import type { CourtHalves } from '../src/core/inkast.js';
import {
  advantageLineZ,
  initialMatchState,
  isFinished,
  otherSide,
  withInkastLanded,
  withKingFelled,
  withKubbFelled,
  withTurnAdvanced,
} from '../src/core/match.js';
import type {
  MatchEffect,
  MatchPhase,
  MatchSide,
  MatchState,
  MatchStep,
} from '../src/core/match.js';
import { NETWORKED_PIECE_IDS } from '../src/core/pieceSync.js';
import { mirrorPoseToFarBaseline } from '../src/core/presence.js';
import { accumulateHeldDuration, isResting } from '../src/core/restState.js';
import {
  finishRound,
  initialRoundState,
  isRoundComplete,
  nextRoundState,
  scoringReducer,
  shouldEndPendingRound,
  STICKS_PER_ROUND,
} from '../src/core/scoring.js';
import type { RoundResult, RoundState } from '../src/core/scoring.js';
import type { Settings } from '../src/core/settings.js';
import {
  felledAngleDeg,
  isToppled,
  isUprightAgain,
} from '../src/core/topple.js';
import {
  defaultPreset,
  percentToReal,
  tuningParams,
} from '../src/core/tuning.js';
import { sub } from '../src/core/vec3.js';
import type { Vec3 } from '../src/core/vec3.js';
import { computeWindForce } from '../src/core/wind.js';
import type { Pose, ThrowInput } from './physicsWorld.js';

/** The slice of the physics world the rules need — a fake in tests. */
export interface MatchWorld {
  homePose(id: string): Pose | null;
  pose(id: string): Pose | null;
  setPose(id: string, pose: Pose): void;
  speeds(id: string): [number, number] | null;
  setAngularDamping(id: string, damping: number): void;
  applyImpulse(id: string, impulse: Vec3): void;
  applyThrow(input: ThrowInput): boolean;
}

export interface RoundReport {
  side: MatchSide;
  result: RoundResult;
  sticksThrownThisRound: number;
  longestThrowM: number;
  longestFellingThrowM: number | null;
  roundDurationS: number;
}

export interface MatchHostOutput {
  /** The match state changed (null = no match: practice). */
  matchState(state: MatchState | null): void;
  roundEnded(report: RoundReport): void;
  /** A gate-report line (docs/superpowers/specs/2026-09-26-gate-report-design.md). */
  gate(message: string, data: Record<string, unknown>): void;
}

interface StickTrack {
  phase: 'racked' | 'flying' | 'settled';
  flyingSinceS: number;
  restS: number;
  releasePosition: Vec3;
}

const STICK_IDS = Array.from(
  { length: STICKS_PER_ROUND },
  (_, i) => `stick-${i}`,
);
const TOPPLEABLE_IDS = NETWORKED_PIECE_IDS.filter(
  (id) => !id.startsWith('stick-'),
);
/** After a full reset the freshly placed bodies settle for a moment —
 * no topple is judged until then (the headset's startup grace, short). */
const RESET_GRACE_S = 1;
const UPRIGHT: [number, number, number, number] = [0, 0, 0, 1];

/**
 * MP6 (docs/superpowers/specs/2026-09-26-authoritative-server-design.md):
 * the rules the headset host used to run, now on the server, driving
 * the server's own bodies. Built on the unchanged pure rules in
 * src/core — this class only detects (settle, topple, landing, quiet
 * court), sequences and moves bodies. One player = practice (six sticks,
 * then everything back); two = a match (core/match v3).
 */
export class MatchHost {
  private readonly halves: CourtHalves;
  private readonly farZ: number;
  private readonly modeToppleDeg: number;
  private readonly windImpulsePerS: Vec3;
  private readonly flightAngularDamping: number;
  private players = new Set<MatchSide>();
  private matchActive = false;
  private practiceSide: MatchSide = 'host';
  private matchState: MatchState = initialMatchState();
  private roundState: RoundState = initialRoundState();
  private sticks = new Map<string, StickTrack>();
  private felledReported = new Set<string>();
  private toppleRestS = new Map<string, number>();
  private tosses = new Map<string, { sinceS: number; restS: number }>();
  private racked = new Map<string, Vec3>();
  private causedFelling = new Set<string>();
  private longestThrowM = 0;
  private longestFellingThrowM: number | null = null;
  private roundStartS = 0;
  private pendingEndSinceS: number | null = null;
  private quietForS = 0;
  private kingFelledAtS: number | null = null;
  private kingFelledPhase: MatchPhase = 'throwing';
  private restartInS: number | null = null;
  private graceUntilS = 0;
  private timeS = 0;

  constructor(
    private readonly world: MatchWorld,
    gameMode: Settings['gameMode'],
    private readonly out: MatchHostOutput,
  ) {
    const preset = getCourtPreset(courtPresetForMode(gameMode));
    this.halves = courtHalves(preset);
    this.farZ = farBaselineZ(preset);
    this.modeToppleDeg = getGameMode(gameMode).toppleAngleDeg;
    this.windImpulsePerS = computeWindForce(
      windVectorForMode(gameMode),
      pieces.wind.dragFactor,
    );
    this.flightAngularDamping = percentToReal(
      tuningParams.angularDampingInFlight,
      defaultPreset().angularDampingInFlight,
    );
    for (const id of STICK_IDS) {
      this.sticks.set(id, {
        phase: 'racked',
        flyingSinceS: 0,
        restS: 0,
        releasePosition: [0, 0, 0],
      });
    }
  }

  /** Who is in the room. Both sides → a fresh match; one → practice. */
  setPlayers(sides: Iterable<MatchSide>): void {
    this.players = new Set(sides);
    const both = this.players.has('host') && this.players.has('guest');
    if (both && !this.matchActive) {
      this.matchActive = true;
      this.fullReset();
      return;
    }
    if (!both) {
      const sole = [...this.players][0] ?? 'host';
      const changed = this.matchActive || sole !== this.practiceSide;
      this.matchActive = false;
      this.practiceSide = sole;
      if (changed) {
        this.fullReset();
      }
    }
  }

  /** A client's release. False when the rules do not allow it. */
  onThrow(side: MatchSide, input: ThrowInput): boolean {
    const stick = this.sticks.get(input.pieceId);
    if (stick) {
      const onTurn = this.matchActive
        ? side === this.matchState.currentTurn &&
          this.matchState.phase === 'throwing' &&
          !isFinished(this.matchState)
        : side === this.practiceSide;
      if (
        !onTurn ||
        stick.phase !== 'racked' ||
        !this.world.applyThrow(input)
      ) {
        return false;
      }
      stick.phase = 'flying';
      stick.flyingSinceS = this.timeS;
      stick.restS = 0;
      stick.releasePosition = [...input.position];
      this.roundState = scoringReducer(this.roundState, {
        type: 'StickThrown',
      });
      return true;
    }
    const queued = this.matchState.inkastQueue.some(
      (i) => i.kubbId === input.pieceId,
    );
    if (
      !this.matchActive ||
      this.matchState.phase !== 'inkast' ||
      side !== this.matchState.currentTurn ||
      !queued ||
      this.tosses.has(input.pieceId) ||
      !this.world.applyThrow(input)
    ) {
      return false;
    }
    this.tosses.set(input.pieceId, { sinceS: this.timeS, restS: 0 });
    return true;
  }

  /** "Ny runda": everything home, a fresh match (or practice). */
  reset(): void {
    this.fullReset();
  }

  tick(dtS: number): void {
    this.timeS += dtS;
    this.tickSticks(dtS);
    if (this.timeS >= this.graceUntilS) {
      this.tickTopple(dtS);
    }
    this.tickTosses(dtS);
    if (
      this.kingFelledAtS !== null &&
      this.timeS - this.kingFelledAtS >= match.kingDecisionGraceS
    ) {
      this.applyKingDecision();
    }
    this.tickRoundEnd(dtS);
    if (this.restartInS !== null) {
      this.restartInS -= dtS;
      if (this.restartInS <= 0) {
        this.out.gate('match restart', {
          secondsSinceFinished: match.restartDelayS - this.restartInS,
        });
        this.restartInS = null;
        this.fullReset();
      }
    }
  }

  // --- detection ---------------------------------------------------------

  private tickSticks(dtS: number): void {
    const t = pieces.throw;
    for (const [id, stick] of this.sticks) {
      if (stick.phase !== 'flying') {
        continue;
      }
      if (this.windImpulsePerS.some((v) => v !== 0)) {
        this.world.applyImpulse(id, [
          this.windImpulsePerS[0] * dtS,
          this.windImpulsePerS[1] * dtS,
          this.windImpulsePerS[2] * dtS,
        ]);
      }
      const pose = this.world.pose(id);
      const [lin, ang] = this.world.speeds(id) ?? [0, 0];
      // StickGroundDampingSystem: brake the roll once the stick is down.
      const grounded =
        (pose?.position[1] ?? Infinity) < t.groundHeightM &&
        lin < t.groundLinearSpeedMps &&
        ang < t.groundAngularSpeedRadS;
      this.world.setAngularDamping(
        id,
        grounded ? t.groundAngularDamping : this.flightAngularDamping,
      );
      stick.restS = isResting(lin, ang, t)
        ? accumulateHeldDuration(stick.restS, dtS)
        : 0;
      const timedOut = this.timeS - stick.flyingSinceS >= t.maxFlightTimeS;
      if (stick.restS >= t.restDurationS || timedOut) {
        this.settle(id, stick, pose?.position ?? stick.releasePosition);
      }
    }
  }

  private settle(id: string, stick: StickTrack, position: Vec3): void {
    stick.phase = 'settled';
    this.roundState = scoringReducer(this.roundState, { type: 'StickSettled' });
    const delta = sub(position, stick.releasePosition);
    const distanceM = Math.hypot(delta[0], delta[2]);
    this.longestThrowM = Math.max(this.longestThrowM, distanceM);
    if (this.causedFelling.has(id)) {
      this.longestFellingThrowM = Math.max(
        this.longestFellingThrowM ?? 0,
        distanceM,
      );
    }
    if (isRoundComplete(this.roundState) && this.pendingEndSinceS === null) {
      this.pendingEndSinceS = this.timeS;
      this.quietForS = 0;
    }
  }

  private tickTopple(dtS: number): void {
    for (const id of TOPPLEABLE_IDS) {
      if (this.racked.has(id) || this.tosses.has(id)) {
        continue; // in the inkast rack or in the air: not on the court
      }
      const pose = this.world.pose(id);
      const speeds = this.world.speeds(id);
      if (!pose || !speeds) {
        continue;
      }
      const resting = isResting(speeds[0], speeds[1], pieces.throw);
      if (this.felledReported.has(id)) {
        if (resting && isUprightAgain(pose.quaternion, inkast.rearmBelowDeg)) {
          this.felledReported.delete(id);
          this.toppleRestS.delete(id);
        }
        continue;
      }
      const angle =
        id === 'king'
          ? this.modeToppleDeg
          : felledAngleDeg(
              this.modeToppleDeg,
              this.matchActive,
              inkast.leaningFelledDeg,
            );
      if (!isToppled(pose.quaternion, angle) || !resting) {
        this.toppleRestS.delete(id);
        continue;
      }
      const heldS = accumulateHeldDuration(this.toppleRestS.get(id) ?? 0, dtS);
      this.toppleRestS.set(id, heldS);
      if (heldS < pieces.throw.restDurationS) {
        continue;
      }
      this.felledReported.add(id);
      if (id === 'king') {
        this.onKingFelled();
      } else {
        this.onKubbFelled(id, pose.position);
      }
    }
  }

  private tickTosses(dtS: number): void {
    for (const [id, toss] of this.tosses) {
      const pose = this.world.pose(id);
      const [lin, ang] = this.world.speeds(id) ?? [0, 0];
      toss.restS = isResting(lin, ang, pieces.throw)
        ? accumulateHeldDuration(toss.restS, dtS)
        : 0;
      const timedOut = this.timeS - toss.sinceS >= inkast.maxTossFlightS;
      if ((toss.restS < pieces.throw.restDurationS && !timedOut) || !pose) {
        continue;
      }
      this.tosses.delete(id);
      const [x, , z] = pose.position;
      const attempt =
        this.matchState.inkastQueue.find((i) => i.kubbId === id)?.attempt ??
        null;
      this.out.gate('inkast landed', {
        kubbId: id,
        legal: isLegalLanding(
          this.halves,
          otherSide(this.matchState.currentTurn),
          x,
          z,
        ),
        attempt,
        timedOut,
      });
      this.racked.delete(id); // it left the rack when it was thrown
      this.apply(
        withInkastLanded(
          this.matchState,
          id,
          x,
          z,
          this.halves,
          this.standingPoints(id),
          {
            insetM: inkast.clampInsetM,
            minSeparationM: inkast.minSeparationM,
          },
        ),
      );
    }
  }

  private tickRoundEnd(dtS: number): void {
    if (this.pendingEndSinceS === null) {
      return;
    }
    const quiet = TOPPLEABLE_IDS.every((id) => {
      const s = this.world.speeds(id);
      return !s || isResting(s[0], s[1], pieces.throw);
    });
    this.quietForS = quiet ? accumulateHeldDuration(this.quietForS, dtS) : 0;
    if (
      shouldEndPendingRound(
        this.quietForS > 0 ? this.quietForS : null,
        this.timeS - this.pendingEndSinceS,
        round,
      )
    ) {
      this.endRound();
    }
  }

  // --- rules -------------------------------------------------------------

  private onKubbFelled(id: string, position: Vec3): void {
    this.markFlyingSticksAsCausing();
    this.roundState = scoringReducer(this.roundState, {
      type: 'KubbFelled',
      entityId: id,
    });
    if (this.matchActive) {
      this.apply(withKubbFelled(this.matchState, id, position[0], position[2]));
    }
  }

  private onKingFelled(): void {
    this.markFlyingSticksAsCausing();
    this.roundState = scoringReducer(this.roundState, { type: 'KingFelled' });
    if (
      this.matchActive &&
      this.kingFelledAtS === null &&
      !isFinished(this.matchState)
    ) {
      this.kingFelledAtS = this.timeS;
      this.kingFelledPhase = this.matchState.phase;
    }
  }

  private markFlyingSticksAsCausing(): void {
    for (const [id, stick] of this.sticks) {
      if (stick.phase === 'flying') {
        this.causedFelling.add(id);
      }
    }
  }

  private applyKingDecision(): void {
    this.kingFelledAtS = null;
    const next = withKingFelled(this.matchState, this.kingFelledPhase);
    if (next === this.matchState) {
      return;
    }
    this.out.gate('king decision', {
      thrower: this.matchState.currentTurn,
      winner: next.winner,
      endReason: next.endReason,
      stickNumberInRound: this.roundState.sticksThrownThisRound,
    });
    this.setMatchState(next);
    if (isFinished(next)) {
      this.restartInS = match.restartDelayS;
    }
  }

  private endRound(): void {
    const thrower = this.matchActive
      ? this.matchState.currentTurn
      : this.practiceSide;
    this.out.roundEnded({
      side: thrower,
      result: finishRound(this.roundState),
      sticksThrownThisRound: this.roundState.sticksThrownThisRound,
      longestThrowM: this.longestThrowM,
      longestFellingThrowM: this.longestFellingThrowM,
      roundDurationS: this.timeS - this.roundStartS,
    });
    this.startRound(nextRoundState(this.roundState));
    if (!this.matchActive) {
      this.placeEverythingHome();
      return;
    }
    if (this.kingFelledAtS !== null) {
      this.applyKingDecision(); // decide for the thrower who fell it
    }
    this.setMatchState(withTurnAdvanced(this.matchState));
    this.placeSticksFor(this.matchState.currentTurn);
  }

  private apply(step: MatchStep): void {
    if (step.state !== this.matchState) {
      this.setMatchState(step.state);
    }
    for (const effect of step.effects) {
      this.applyEffect(effect);
    }
  }

  private applyEffect(effect: MatchEffect): void {
    if (effect.type === 'returnToRack') {
      const slot =
        this.racked.get(effect.kubbId) ?? this.rackSlotOf(effect.kubbId);
      if (slot) {
        this.world.setPose(effect.kubbId, {
          position: slot,
          quaternion: UPRIGHT,
        });
        this.racked.set(effect.kubbId, slot);
      }
      this.out.gate('kubb returned to rack', { kubbId: effect.kubbId });
      return;
    }
    if (effect.type === 'restoreHome') {
      const home = this.world.homePose(effect.kubbId);
      if (home) {
        this.world.setPose(effect.kubbId, home);
      }
    } else {
      this.world.setPose(effect.kubbId, {
        position: [effect.x, pieces.kubb.heightM / 2, effect.z],
        quaternion: UPRIGHT,
      });
    }
    this.out.gate('kubb raised', {
      kubbId: effect.kubbId,
      reason: effect.reason,
    });
  }

  private setMatchState(state: MatchState): void {
    this.matchState = state;
    this.syncRack();
    this.out.matchState(this.matchActive ? state : null);
  }

  /** Newly queued kubbs stand in the thrower's inkast rack; kubbs that
   * left the queue (landed) are no longer rack kubbs. */
  private syncRack(): void {
    const queue = this.matchState.inkastQueue;
    const queued = new Set(queue.map((i) => i.kubbId));
    for (const id of [...this.racked.keys()]) {
      if (!queued.has(id)) {
        this.racked.delete(id);
      }
    }
    queue.forEach((item, slot) => {
      if (this.racked.has(item.kubbId) || this.tosses.has(item.kubbId)) {
        return;
      }
      const position = inkastRackPosition(
        this.halves,
        this.matchState.currentTurn,
        slot,
        queue.length,
        {
          offsetM: inkast.rackOffsetBehindBaselineM,
          spacingM: inkast.rackSpacingM,
          kubbHeightM: pieces.kubb.heightM,
        },
      );
      this.world.setPose(item.kubbId, { position, quaternion: UPRIGHT });
      this.racked.set(item.kubbId, position);
      this.felledReported.delete(item.kubbId);
    });
  }

  private rackSlotOf(kubbId: string): Vec3 | null {
    const queue = this.matchState.inkastQueue;
    const slot = queue.findIndex((i) => i.kubbId === kubbId);
    return slot < 0
      ? null
      : inkastRackPosition(
          this.halves,
          this.matchState.currentTurn,
          slot,
          queue.length,
          {
            offsetM: inkast.rackOffsetBehindBaselineM,
            spacingM: inkast.rackSpacingM,
            kubbHeightM: pieces.kubb.heightM,
          },
        );
  }

  /** Every standing piece except `exceptId` — what a raised kubb must
   * not be stood inside. */
  private standingPoints(exceptId: string): Array<{ x: number; z: number }> {
    const ids = [
      'king',
      ...this.matchState.baselineKubbs.host,
      ...this.matchState.baselineKubbs.guest,
      ...this.matchState.fieldKubbs.map((k) => k.kubbId),
    ];
    const points: Array<{ x: number; z: number }> = [];
    for (const id of ids) {
      const p = id === exceptId ? null : this.world.pose(id);
      if (p) {
        points.push({ x: p.position[0], z: p.position[2] });
      }
    }
    return points;
  }

  // --- placement ---------------------------------------------------------

  /** The thrower's rack: its own baseline's, moved onto its advantage
   * line when field kubbs stand on its half (shown, not enforced). */
  private placeSticksFor(side: MatchSide): void {
    const lineZ = this.matchActive
      ? advantageLineZ(this.matchState, side, this.halves)
      : null;
    const baselineZ = side === 'host' ? this.halves.nearBaselineZ : this.farZ;
    const shiftZ = lineZ === null ? 0 : lineZ - baselineZ;
    for (const [id, stick] of this.sticks) {
      const home = this.world.homePose(id);
      if (!home) {
        continue;
      }
      const pose =
        side === 'host' ? home : mirrorPoseToFarBaseline(home, this.farZ);
      this.world.setPose(id, {
        position: [
          pose.position[0],
          pose.position[1],
          pose.position[2] + shiftZ,
        ],
        quaternion: pose.quaternion,
      });
      stick.phase = 'racked';
      stick.restS = 0;
    }
  }

  private placeEverythingHome(): void {
    for (const id of TOPPLEABLE_IDS) {
      const home = this.world.homePose(id);
      if (home) {
        this.world.setPose(id, home);
      }
    }
    this.felledReported.clear();
    this.toppleRestS.clear();
    this.tosses.clear();
    this.racked.clear();
    this.graceUntilS = this.timeS + RESET_GRACE_S;
    this.placeSticksFor(this.practiceSide);
  }

  private startRound(state: RoundState): void {
    this.roundState = state;
    this.roundStartS = this.timeS;
    this.pendingEndSinceS = null;
    this.quietForS = 0;
    this.longestThrowM = 0;
    this.longestFellingThrowM = null;
    this.causedFelling.clear();
  }

  private fullReset(): void {
    this.kingFelledAtS = null;
    this.restartInS = null;
    this.startRound(initialRoundState());
    this.placeEverythingHome();
    this.matchState = initialMatchState();
    if (this.matchActive) {
      this.placeSticksFor('host');
    }
    this.out.matchState(this.matchActive ? this.matchState : null);
  }
}
