import type { CourtHalves } from './inkast.js';
import type { MatchPhase, MatchSide } from './match.js';
import type { Vec3 } from './vec3.js';

/**
 * The spectator's TV director (docs/superpowers/specs/2026-10-31-
 * spectator-tv-design.md): which camera shot to show, chosen from game
 * events, and where that shot's camera stands. Pure — the shell
 * (systems/spectator.ts) feeds it events and live piece positions and
 * puts the camera where it says.
 *
 * Rules: no match → a slow tour of the garden; a turn → over the
 * thrower's shoulder (inkast → wide on the half being tossed at); a
 * throw → a follow cam at once; a felled piece → a short close-up; a
 * win → wide. Lesser cuts wait out a minimum shot length so the picture
 * never flickers between angles.
 */
export type ShotKind =
  'tour' | 'overShoulder' | 'follow' | 'closeUp' | 'inkastWide' | 'wide';

export interface Shot {
  kind: ShotKind;
  side: MatchSide | null;
  /** The point a close-up or follow shot is about. */
  focus: Vec3 | null;
  pieceId: string | null;
  startedAtS: number;
}

export interface DirectorState {
  shot: Shot;
  /** A cut waiting for the current shot's minimum length. */
  pending: Shot | null;
  /** Whose turn it is (what to go back to after a close-up). */
  turn: { side: MatchSide; phase: MatchPhase } | null;
}

export type DirectorEvent =
  | { type: 'noMatch' }
  | { type: 'turn'; side: MatchSide; phase: MatchPhase }
  | { type: 'throw'; pieceId: string }
  | { type: 'landed' }
  | { type: 'felled'; position: Vec3 }
  | { type: 'win'; side: MatchSide };

export interface DirectorOptions {
  minShotS: number;
  closeUpS: number;
}

/** Each tour shot is a slow move this long. */
export const TOUR_SHOT_S = 8;

const shot = (
  kind: ShotKind,
  startedAtS: number,
  fields: Partial<Omit<Shot, 'kind' | 'startedAtS'>> = {},
): Shot => ({
  kind,
  side: null,
  focus: null,
  pieceId: null,
  startedAtS,
  ...fields,
});

export function initialDirector(): DirectorState {
  return { shot: shot('tour', 0), pending: null, turn: null };
}

/** The shot for the current turn — what play "rests" on. */
function turnShot(state: DirectorState, nowS: number): Shot {
  if (!state.turn) {
    return shot('tour', nowS);
  }
  return state.turn.phase === 'inkast'
    ? shot('inkastWide', nowS, { side: state.turn.side })
    : shot('overShoulder', nowS, { side: state.turn.side });
}

/** Cut now, or once the current shot has run its minimum length. */
function cutWhenAllowed(
  state: DirectorState,
  next: Shot,
  nowS: number,
  opts: DirectorOptions,
): DirectorState {
  // Leaving the tour (a match just started) never waits.
  if (
    state.shot.kind === 'tour' ||
    nowS - state.shot.startedAtS >= opts.minShotS
  ) {
    return { ...state, shot: { ...next, startedAtS: nowS }, pending: null };
  }
  return { ...state, pending: next };
}

export function directorEvent(
  state: DirectorState,
  event: DirectorEvent,
  nowS: number,
  opts: DirectorOptions,
): DirectorState {
  switch (event.type) {
    case 'noMatch':
      return state.shot.kind === 'tour' && !state.turn
        ? state
        : { shot: shot('tour', nowS), pending: null, turn: null };
    case 'turn': {
      const next: DirectorState = {
        ...state,
        turn: { side: event.side, phase: event.phase },
      };
      if (state.shot.kind === 'follow' || state.shot.kind === 'closeUp') {
        return { ...next, pending: turnShot(next, nowS) };
      }
      return cutWhenAllowed(next, turnShot(next, nowS), nowS, opts);
    }
    case 'throw':
      // The key action: cut at once.
      return {
        ...state,
        shot: shot('follow', nowS, {
          side: state.turn?.side ?? null,
          pieceId: event.pieceId,
        }),
        pending: null,
      };
    case 'landed':
      return state.shot.kind === 'follow'
        ? cutWhenAllowed(state, turnShot(state, nowS), nowS, opts)
        : state;
    case 'felled':
      if (state.shot.kind === 'closeUp') {
        return state; // one close-up for a cluster of falls
      }
      return {
        ...state,
        shot: shot('closeUp', nowS, { focus: event.position }),
        pending: null,
      };
    case 'win':
      return {
        ...state,
        shot: shot('wide', nowS, { side: event.side }),
        pending: null,
      };
  }
}

/** Every frame: a close-up ends, a waiting cut happens. */
export function directorTick(
  state: DirectorState,
  nowS: number,
  opts: DirectorOptions,
): DirectorState {
  const age = nowS - state.shot.startedAtS;
  if (state.shot.kind === 'closeUp' && age >= opts.closeUpS) {
    return {
      ...state,
      shot: { ...(state.pending ?? turnShot(state, nowS)), startedAtS: nowS },
      pending: null,
    };
  }
  if (state.pending && age >= opts.minShotS) {
    return {
      ...state,
      shot: { ...state.pending, startedAtS: nowS },
      pending: null,
    };
  }
  return state;
}

export interface CameraPose {
  position: Vec3;
  target: Vec3;
}

/** The garden tour: slow moves from A to B, looping. Every camera in
 * this file stands in the clear corridor over and around the court —
 * trees, rocks and cliffs line both sides (checked against the scene in
 * director.test.ts). */
const TOUR: ReadonlyArray<{ from: CameraPose; to: CameraPose }> = [
  {
    from: { position: [0, 7.5, 4.8], target: [0, 0, -3.5] },
    to: { position: [0, 7, 3], target: [0, 0, -3.5] },
  },
  {
    from: { position: [0, 0.9, 1.8], target: [0, 0.2, -5] },
    to: { position: [0, 1.3, 0.9], target: [0, 0.2, -5] },
  },
  {
    from: { position: [2, 7, -3.5], target: [0, 0, -3.5] },
    to: { position: [-2, 7, -3.5], target: [0, 0, -3.5] },
  },
  {
    from: { position: [0.7, 2.2, -8.6], target: [0, 0.2, -2] },
    to: { position: [-0.7, 2.6, -8.6], target: [0, 0.2, -2] },
  },
];

const lerp3 = (a: Vec3, b: Vec3, t: number): Vec3 => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];

/** Smooth start and stop for a camera move. */
const easeInOut = (t: number): number => t * t * (3 - 2 * t);

/** Where `shot`'s camera stands and looks at `nowS`. Over-the-shoulder
 * and wide shots are fixed per court; follow and close-up frame a live
 * point. Side B is the mirror of side A across the centre line. */
export function shotCameraPose(
  current: Shot,
  halves: CourtHalves,
  nowS: number,
): CameraPose {
  const { nearBaselineZ: nearZ, farBaselineZ: farZ, centreZ } = halves;
  const ownZ = (side: MatchSide | null) => (side === 'guest' ? farZ : nearZ);
  const otherZ = (side: MatchSide | null) => (side === 'guest' ? nearZ : farZ);
  const back = (side: MatchSide | null) => (side === 'guest' ? -1 : 1);
  switch (current.kind) {
    case 'tour': {
      const index = Math.floor(nowS / TOUR_SHOT_S);
      const leg = TOUR[((index % TOUR.length) + TOUR.length) % TOUR.length];
      const t = easeInOut((nowS - index * TOUR_SHOT_S) / TOUR_SHOT_S);
      if (!leg) {
        return { position: [5, 4, 3], target: [0, 0, centreZ] };
      }
      return {
        position: lerp3(leg.from.position, leg.to.position, t),
        target: lerp3(leg.from.target, leg.to.target, t),
      };
    }
    case 'overShoulder': {
      const sd = current.side;
      return {
        position: [0.7 * back(sd), 1.9, ownZ(sd) + 1.2 * back(sd)],
        target: [0, 0.3, otherZ(sd)],
      };
    }
    case 'inkastWide': {
      // The tosser throws at the OTHER half: look across it from above
      // the near side line (inside the tree line).
      const halfZ = (otherZ(current.side) + centreZ) / 2;
      return { position: [1.5, 4.2, halfZ + 2], target: [0, 0.2, halfZ] };
    }
    case 'closeUp': {
      const f = current.focus ?? [0, 0.1, centreZ];
      // Stand on the court side of the piece, never out among the trees.
      const dx = f[0] > 0.5 ? -1 : 1;
      return {
        position: [f[0] + dx, 0.7, f[2] + 0.9],
        target: [f[0], 0.1, f[2]],
      };
    }
    case 'follow': {
      const f = current.focus ?? [0, 1, centreZ];
      return {
        position: [
          -2.1,
          Math.max(1.7, f[1] + 0.8),
          Math.max(-9, Math.min(0.8, f[2] + 1.4 * back(current.side))),
        ],
        target: f,
      };
    }
    case 'wide': {
      const z = current.side === 'guest' ? farZ - 3 : nearZ + 3;
      return {
        position: [0, 6.5, z],
        target: [
          0,
          0.2,
          current.side ? (ownZ(current.side) + centreZ) / 2 : centreZ,
        ],
      };
    }
  }
}
