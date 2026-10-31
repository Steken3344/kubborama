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
 * never flickers between angles, and a shot that rests longer than the
 * maximum cuts to another angle of the same kind — like a TV director
 * who keeps the picture alive between throws. Every kind has a few
 * angles (`variant`, picked in turn by a cut counter — deterministic,
 * no randomness) and every resting angle is a slow eased camera move.
 */
export type ShotKind =
  | 'tour'
  | 'overShoulder'
  | 'follow'
  | 'closeUp'
  | 'inkastWide'
  | 'wide'
  /** High above the centre line: both halves at once. */
  | 'overhead'
  /** From behind the far end, looking back at the thrower. */
  | 'opponentEnd';

export interface Shot {
  kind: ShotKind;
  side: MatchSide | null;
  /** The point a close-up or follow shot is about. */
  focus: Vec3 | null;
  pieceId: string | null;
  startedAtS: number;
  /** Which angle of this kind (any integer; the pose wraps it). */
  variant: number;
}

export interface DirectorState {
  shot: Shot;
  /** A cut waiting for the current shot's minimum length. */
  pending: Shot | null;
  /** Whose turn it is (what to go back to after a close-up). */
  turn: { side: MatchSide; phase: MatchPhase } | null;
  /** Cuts so far: the next shot's variant. */
  cuts: number;
  /** Re-angles of a resting shot in this turn: they rotate through the
   * turn's own angle, overhead, the turn's angle, the opponent's end. */
  rests: number;
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
  /** A resting shot older than this cuts to another angle. */
  maxShotS: number;
}

/** Each tour shot is a slow move this long. */
export const TOUR_SHOT_S = 6;

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
  variant: 0,
  ...fields,
});

export function initialDirector(): DirectorState {
  return {
    shot: shot('tour', 0),
    pending: null,
    turn: null,
    cuts: 0,
    rests: 0,
  };
}

/** Put `next` on air now, as the next angle in turn. */
function goLive(state: DirectorState, next: Shot, nowS: number): DirectorState {
  return {
    ...state,
    shot: { ...next, startedAtS: nowS, variant: state.cuts },
    pending: null,
    cuts: state.cuts + 1,
  };
}

/** The shots that hold while play rests — these get re-angled. */
const RESTING: ReadonlySet<ShotKind> = new Set([
  'overShoulder',
  'inkastWide',
  'wide',
  'overhead',
  'opponentEnd',
]);

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
    return goLive(state, next, nowS);
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
        : {
            ...goLive(state, shot('tour', nowS), nowS),
            turn: null,
            rests: 0,
          };
    case 'turn': {
      const next: DirectorState = {
        ...state,
        turn: { side: event.side, phase: event.phase },
        rests: 0,
      };
      if (state.shot.kind === 'follow' || state.shot.kind === 'closeUp') {
        return { ...next, pending: turnShot(next, nowS) };
      }
      return cutWhenAllowed(next, turnShot(next, nowS), nowS, opts);
    }
    case 'throw':
      // The key action: cut at once.
      return goLive(
        state,
        shot('follow', nowS, {
          side: state.turn?.side ?? null,
          pieceId: event.pieceId,
        }),
        nowS,
      );
    case 'landed':
      return state.shot.kind === 'follow'
        ? cutWhenAllowed(state, turnShot(state, nowS), nowS, opts)
        : state;
    case 'felled':
      if (state.shot.kind === 'closeUp') {
        return state; // one close-up for a cluster of falls
      }
      return goLive(
        state,
        shot('closeUp', nowS, { focus: event.position }),
        nowS,
      );
    case 'win':
      return goLive(state, shot('wide', nowS, { side: event.side }), nowS);
  }
}

/** Every frame: a close-up ends, a waiting cut happens, a resting shot
 * that has run long enough moves on to another angle. */
export function directorTick(
  state: DirectorState,
  nowS: number,
  opts: DirectorOptions,
): DirectorState {
  const age = nowS - state.shot.startedAtS;
  if (state.shot.kind === 'closeUp' && age >= opts.closeUpS) {
    return goLive(state, state.pending ?? turnShot(state, nowS), nowS);
  }
  if (state.pending && age >= opts.minShotS) {
    return goLive(state, state.pending, nowS);
  }
  if (!state.pending && RESTING.has(state.shot.kind) && age >= opts.maxShotS) {
    if (state.shot.kind === 'wide' || !state.turn) {
      return goLive(state, state.shot, nowS);
    }
    // Four views while play rests (Erik, 2026-10-31: the inkast showed
    // only its two angles for minutes): the turn's own angle, overhead,
    // the turn's angle again (its next variant), the opponent's end.
    const rests = state.rests + 1;
    const next =
      rests % 2 === 0
        ? turnShot(state, nowS)
        : shot(rests % 4 === 1 ? 'overhead' : 'opponentEnd', nowS, {
            side: state.turn.side,
          });
    return { ...goLive(state, next, nowS), rests };
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

const clamp = (v: number, lo: number, hi: number): number =>
  Math.min(hi, Math.max(lo, v));

/** A camera low enough to hit scenery stays in the clear corridor
 * along the court: in front of the cliff and tree behind the far
 * baseline, and in front of the bushes behind the near one unless it
 * is above them (director.test.ts checks every pose against the scene). */
const LOW_MIN_Z = -8.6;
const ABOVE_BUSHES_M = 1.8;
const lowZ = (z: number, y: number): number =>
  clamp(z, LOW_MIN_Z, y > ABOVE_BUSHES_M ? 2.5 : 1.2);

/** The angle `variant` picks out of `n`, for any integer. */
const pick = (variant: number, n: number): number => ((variant % n) + n) % n;

/** Where `shot`'s camera stands and looks at `nowS`. Resting shots are
 * slow eased moves over `opts.maxShotS` (a close-up over its own
 * length); follow shots frame a live point. Side B is the mirror of
 * side A across the centre line. */
export function shotCameraPose(
  current: Shot,
  halves: CourtHalves,
  nowS: number,
  opts: DirectorOptions,
): CameraPose {
  const { nearBaselineZ: nearZ, farBaselineZ: farZ, centreZ } = halves;
  const ownZ = (side: MatchSide | null) => (side === 'guest' ? farZ : nearZ);
  const otherZ = (side: MatchSide | null) => (side === 'guest' ? nearZ : farZ);
  // +1 points from the court towards this side's back (host: +z).
  const back = (side: MatchSide | null) => (side === 'guest' ? -1 : 1);
  const age = Math.max(0, nowS - current.startedAtS);
  const move = (from: CameraPose, to: CameraPose, lengthS: number) => {
    const t = easeInOut(clamp(age / lengthS, 0, 1));
    return {
      position: lerp3(from.position, to.position, t),
      target: lerp3(from.target, to.target, t),
    };
  };
  const rest = (from: CameraPose, to: CameraPose) =>
    move(from, to, opts.maxShotS);
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
      const b = back(sd);
      const own = ownZ(sd);
      const down: Vec3 = [0, 0.3, otherZ(sd)];
      switch (pick(current.variant, 4)) {
        case 0: // push in over the right shoulder — above head height,
          // as at the far end it can't stand far behind (cliff, tree)
          return rest(
            {
              position: [0.9 * b, 2.3, lowZ(own + 1.6 * b, 2.3)],
              target: down,
            },
            { position: [0.55 * b, 2.1, lowZ(own + 1 * b, 2.1)], target: down },
          );
        case 1: // slide in over the left shoulder
          return rest(
            {
              position: [-1.4 * b, 1.7, lowZ(own + 1.2 * b, 1.7)],
              target: down,
            },
            {
              position: [-0.9 * b, 2.2, lowZ(own + 1.3 * b, 2.2)],
              target: down,
            },
          );
        case 2: {
          // crane up behind the thrower — starting beside and above
          // the head, never inside it
          const mid: Vec3 = [0, 0.2, (centreZ + otherZ(sd)) / 2];
          return rest(
            { position: [0.9 * b, 2.3, lowZ(own + 1.8 * b, 2.3)], target: mid },
            { position: [0.3 * b, 4.2, lowZ(own + 1.2 * b, 4.2)], target: mid },
          );
        }
        default: {
          // reverse angle: the thrower's face, from the court side
          const face: Vec3 = [0, 1.2, own];
          return rest(
            { position: [1.8 * b, 1.1, own - 1.6 * b], target: face },
            { position: [1.4 * b, 1.5, own - 1 * b], target: face },
          );
        }
      }
    }
    case 'inkastWide': {
      // The tosser throws at the OTHER half: look across it.
      const halfZ = (otherZ(current.side) + centreZ) / 2;
      const half: Vec3 = [0, 0.2, halfZ];
      if (pick(current.variant, 2) === 0) {
        // slide across the half, high above the court
        return rest(
          { position: [1.6, 4.4, halfZ + 2], target: half },
          { position: [-1.6, 4.4, halfZ + 2], target: half },
        );
      }
      // crane up from behind the tosser
      const b = back(current.side);
      const own = ownZ(current.side);
      return rest(
        { position: [0, 2.2, lowZ(own + 1.2 * b, 2.2)], target: half },
        { position: [0, 5, lowZ(own + 0.4 * b, 5)], target: half },
      );
    }
    case 'closeUp': {
      const f = current.focus ?? [0, 0.1, centreZ];
      // Stay on the court side of the piece: never out among the trees,
      // never behind a baseline where the thrower stands (review,
      // 2026-10-31), and above the low rocks by the corners.
      const dx = f[0] > 0.5 ? -1 : 1;
      const dz = f[2] > centreZ ? -1 : 1;
      const target: Vec3 = [f[0], 0.1, f[2]];
      if (pick(current.variant, 2) === 0) {
        // dolly in low from the court
        return move(
          {
            position: [f[0] + dx * 1.3, 1.15, lowZ(f[2] + dz * 1.2, 1.15)],
            target,
          },
          {
            position: [f[0] + dx * 0.9, 0.95, lowZ(f[2] + dz * 0.8, 0.95)],
            target,
          },
          opts.closeUpS,
        );
      }
      // drop down from above, from the side
      return move(
        {
          position: [f[0] + dx * 1, 1.6, lowZ(f[2] + dz * 1.1, 1.6)],
          target,
        },
        {
          position: [f[0] + dx * 1.3, 1, lowZ(f[2] + dz * 0.7, 1)],
          target,
        },
        opts.closeUpS,
      );
    }
    case 'follow': {
      const f = current.focus ?? [0, 1, centreZ];
      const b = back(current.side);
      switch (pick(current.variant, 3)) {
        case 0: {
          // tracking alongside the stick (out at the side line, so in
          // front of the tree behind the near corner)
          const y = Math.max(1.7, f[1] + 0.8);
          const z = Math.min(0.8, lowZ(f[2] + 1.4 * b, y));
          return { position: [-2.1, y, z], target: f };
        }
        case 1: {
          // chase from behind, riding along with the stick — high and
          // to one side, so the thrower never fills the frame
          const y = Math.max(2.6, f[1] + 1.3);
          return {
            position: [1.3 * b, y, lowZ(f[2] + 3.2 * b, y)],
            target: f,
          };
        }
        default: // from behind the target kubbs, the stick flying in
          return {
            position: [
              1 + 0.3 * f[0],
              2.4,
              lowZ(otherZ(current.side) - 0.6 * b, 2.4),
            ],
            target: f,
          };
      }
    }
    case 'overhead': {
      // High above the near end, tilted down the court (~30° from
      // straight down — straight down left the court diagonal in the
      // frame and the kubbs specks): both halves at once, drifting.
      const centre: Vec3 = [0, 0, centreZ];
      return rest(
        { position: [0.8, 8.5, centreZ + 4.5], target: centre },
        { position: [-0.8, 8, centreZ + 3.8], target: centre },
      );
    }
    case 'opponentEnd': {
      // Behind the far baseline (the end the thrower aims at), above the
      // heads, looking back at the thrower.
      const sd = current.side;
      const b = back(sd);
      const thrower: Vec3 = [0, 1, ownZ(sd)];
      const z = lowZ(otherZ(sd) - 1 * b, 2.8);
      return rest(
        { position: [1.6 * b, 2.8, z], target: thrower },
        { position: [0.5 * b, 3.2, z], target: thrower },
      );
    }
    case 'wide': {
      const s = current.side === 'guest' ? -1 : 1;
      const target: Vec3 = [
        0,
        0.2,
        current.side ? (ownZ(current.side) + centreZ) / 2 : centreZ,
      ];
      if (pick(current.variant, 2) === 0) {
        // high push in from the end
        const z = current.side === 'guest' ? farZ - 3 : nearZ + 3;
        return rest(
          { position: [0, 7, z], target },
          { position: [0, 5.8, z - 1.2 * s], target },
        );
      }
      // high orbit round the court, well above the tree tops (at 7.6 m
      // and 5.5 m out the far-end canopies filled a third of the frame)
      const r = 4.5;
      const angleRad = 0.5 - easeInOut(clamp(age / opts.maxShotS, 0, 1));
      return {
        position: [
          Math.sin(angleRad) * r,
          8.6,
          centreZ + Math.cos(angleRad) * r * s,
        ],
        target,
      };
    }
  }
}
