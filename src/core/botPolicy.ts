import type { CourtHalves } from './inkast.js';
import { otherSide, standingLineZ } from './match.js';
import type { MatchSide, MatchState } from './match.js';
import { buildPresenceMessage } from './presence.js';
import type { Pose, PresenceMessage } from './presence.js';
import type { Vec3 } from './vec3.js';

/**
 * The bot match's brain (docs/superpowers/specs/2026-10-31-bot-match-
 * and-play-sessions-design.md): pure choices from the server's match
 * state and the latest snapshot. The only randomness is the seeded aim
 * spread (`jitter`): the aim sequence repeats for a seed, though timing
 * and physics make whole runs differ.
 *
 * Kubb as this game rules it: field kubbs in the opponent's half first,
 * then the opponent's baseline kubbs, then the king.
 */
export type Intent = 'hit' | 'miss' | 'king' | 'footFault';

export interface PolicyView {
  state: MatchState;
  halves: CourtHalves;
  /** Latest snapshot position per piece id. */
  positions: ReadonlyMap<string, Vec3>;
  /** Stick ids still in the rack this turn, in throwing order. */
  racked: readonly string[];
}

export interface ThrowPlan {
  pieceId: string;
  from: Vec3;
  target: Vec3;
  speedMps: number;
}

const RELEASE_HEIGHT_M = 1;
/** Released this far behind the thrower's line… */
const BEHIND_LINE_M = 0.3;
/** …or this far past it: beyond the 0.9 m foot-fault reach. */
const FOOT_FAULT_PAST_M = 1.3;
const MISS_BESIDE_M = 1.5;
const STICK_SPEED_MPS = 7;
const INKAST_SPEED_MPS = 5;
/** Aim at a kubb's lower half. */
const KUBB_AIM_HEIGHT_M = 0.15;

/** +1 when this side throws towards −z (the host), −1 for the guest. */
const forward = (side: MatchSide): number => (side === 'host' ? 1 : -1);

function firstStanding(view: PolicyView, ids: readonly string[]): Vec3 | null {
  for (const id of ids) {
    const p = view.positions.get(id);
    if (p) return [p[0], KUBB_AIM_HEIGHT_M, p[2]];
  }
  return null;
}

export function chooseTarget(view: PolicyView, intent: Intent): Vec3 {
  const other = otherSide(view.state.currentTurn);
  const kingAt = view.positions.get('king');
  const king: Vec3 = kingAt
    ? [kingAt[0], KUBB_AIM_HEIGHT_M, kingAt[2]]
    : [0, KUBB_AIM_HEIGHT_M, view.halves.centreZ];
  if (intent === 'king') return king;
  const fieldIds = view.state.fieldKubbs
    .filter((k) => k.half === other)
    .map((k) => k.kubbId);
  const target =
    firstStanding(view, fieldIds) ??
    firstStanding(view, view.state.baselineKubbs[other]) ??
    king;
  if (intent === 'miss') {
    return [
      view.halves.halfWidthM + MISS_BESIDE_M,
      KUBB_AIM_HEIGHT_M,
      target[2],
    ];
  }
  return target;
}

export function releasePoint(
  view: PolicyView,
  intent: Intent,
  stickIndex: number,
): Vec3 {
  const side = view.state.currentTurn;
  const lineZ = standingLineZ(view.state, side, view.halves);
  const pastM = intent === 'footFault' ? FOOT_FAULT_PAST_M : -BEHIND_LINE_M;
  return [
    0.2 - stickIndex * 0.08,
    RELEASE_HEIGHT_M,
    lineZ - pastM * forward(side),
  ];
}

export function planStick(view: PolicyView, intent: Intent): ThrowPlan | null {
  const pieceId = view.racked[0];
  if (pieceId === undefined) return null;
  const index = Number(pieceId.replace('stick-', '')) || 0;
  return {
    pieceId,
    from: releasePoint(view, intent, index),
    target: chooseTarget(view, intent),
    speedMps: STICK_SPEED_MPS,
  };
}

export function planInkast(view: PolicyView, legal: boolean): ThrowPlan | null {
  const next = view.state.inkastQueue[0];
  if (!next) return null;
  const side = view.state.currentTurn;
  const { nearBaselineZ: nearZ, farBaselineZ: farZ, centreZ } = view.halves;
  const ownZ = side === 'host' ? nearZ : farZ;
  const otherZ = side === 'host' ? farZ : nearZ;
  const halfMidZ = (otherZ + centreZ) / 2;
  return {
    pieceId: next.kubbId,
    from: [0, RELEASE_HEIGHT_M, ownZ + BEHIND_LINE_M * forward(side)],
    target: legal
      ? [0, KUBB_AIM_HEIGHT_M, halfMidZ]
      : [view.halves.halfWidthM + MISS_BESIDE_M, KUBB_AIM_HEIGHT_M, halfMidZ],
    speedMps: INKAST_SPEED_MPS,
  };
}

/** A human-ish aim: the target moved by up to `spreadM` along the
 * ground, uniform over the disc (√r keeps it from bunching in the
 * middle). Seeded: the same seed gives the same aim sequence. */
export function jitter(target: Vec3, rng: () => number, spreadM: number): Vec3 {
  const r = spreadM * Math.sqrt(rng());
  const angleRad = 2 * Math.PI * rng();
  return [
    target[0] + r * Math.cos(angleRad),
    target[1],
    target[2] + r * Math.sin(angleRad),
  ];
}

/** A match as "Ny runda" leaves it: host to throw, nothing felled,
 * every kubb home. Scenarios start only once the server says so. */
export function isFreshMatch(state: MatchState | null): boolean {
  return (
    state !== null &&
    state.winner === null &&
    state.currentTurn === 'host' &&
    state.phase === 'throwing' &&
    state.felledThisTurn.length === 0 &&
    state.inkastQueue.length === 0 &&
    state.fieldKubbs.length === 0 &&
    state.baselineKubbs.host.length === state.baselineKubbs.guest.length
  );
}

/** Behind the line, as a player stands. */
const STAND_BEHIND_M = 0.4;

/** A body standing behind `side`'s baseline, facing the court — the
 * bot's avatar. Poses are shared-world, as every headset sends them (no
 * mirroring — PeerAvatarSystem). */
export function botPresence(
  side: MatchSide,
  farZ: number,
  colorIndex: number,
): PresenceMessage {
  const guest = side === 'guest';
  const z = guest ? farZ - STAND_BEHIND_M : STAND_BEHIND_M;
  // The guest faces +z: half a turn about y.
  const facing: Pose['quaternion'] = guest ? [0, 1, 0, 0] : [0, 0, 0, 1];
  const toCourtX = (x: number) => (guest ? -x : x);
  const pose = (x: number, y: number): Pose => ({
    position: [toCourtX(x), y, z],
    quaternion: facing,
  });
  return buildPresenceMessage({
    head: pose(0, 1.7),
    leftHand: pose(-0.3, 1),
    rightHand: pose(0.3, 1),
    colorIndex,
  });
}
