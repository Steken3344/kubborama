import { aimRelease, flightTimeFor } from './aim.js';
import { jitter, planInkast, planStick } from './botPolicy.js';
import type { PolicyView, ThrowPlan } from './botPolicy.js';
import type { CourtHalves } from './inkast.js';
import { isFinished } from './match.js';
import type { MatchSide, MatchState } from './match.js';
import type { Vec3 } from './vec3.js';

/**
 * The single-player bot opponent's pacing (Erik approved, 2026-11-01):
 * the bot-match policy (core/botPolicy.ts) decides WHAT to throw; this
 * decides WHEN, one release at a time, like a person — a pause when its
 * turn starts, a pause between sticks, a longer one after each inkast
 * toss. Pure: the server passes the memory back in every tick.
 */
export interface BotTuning {
  /** How far the aim strays (m): the level (src/data/bot.json). */
  aimSpreadM: number;
  /** The inkast's spread as a multiple of the court-sized one: above 1
   * a toss can land out, as a weaker player's does (1 = never). */
  inkastSpreadFactor: number;
  turnStartDelayS: number;
  betweenSticksS: number;
  afterTossS: number;
  inkastSpreadMaxM: number;
  inkastLineMarginM: number;
  stickSpinRadS: number;
  /** After its last stick comes to rest, before the next: time for a
   * felled kubb to topple and count, so it aims at what still stands. */
  afterStickRestsS: number;
}

export interface BotMemory {
  /** `turn/phase` the memory belongs to; a change starts over. */
  turnKey: string;
  /** `kubbId:attempt` already tossed this turn. */
  tossed: readonly string[];
  readyAtS: number;
}

export interface BotView {
  state: MatchState;
  side: MatchSide;
  halves: CourtHalves;
  /** Latest position per piece id (the server's own bodies). */
  positions: ReadonlyMap<string, Vec3>;
  /** Sticks still in the rack, from the server itself — never the
   * bot's own count, which a restart or reset would leave stale
   * (review, 2026-11-01). */
  racked: readonly string[];
  /** One of its sticks is still flying or rolling (the server's own
   * stick tracking): what it hit is not known yet. */
  stickInFlight: boolean;
  nowS: number;
}

export interface BotAction {
  pieceId: string;
  from: Vec3;
  velocity: Vec3;
  spin: Vec3;
}

export function freshBotMemory(): BotMemory {
  return { turnKey: '', tossed: [], readyAtS: 0 };
}

/** Legal tosses spread over the half as people's do — never closer than
 * the margin to a line: the backyard half is only 3 × 3 m and kubbs roll
 * after landing. */
export function inkastSpreadM(
  halves: CourtHalves,
  t: Pick<BotTuning, 'inkastSpreadMaxM' | 'inkastLineMarginM'>,
): number {
  const halfDepthM = Math.abs(halves.centreZ - halves.nearBaselineZ);
  return Math.max(
    0,
    Math.min(
      t.inkastSpreadMaxM,
      halves.halfWidthM - t.inkastLineMarginM,
      halfDepthM / 2 - t.inkastLineMarginM,
    ),
  );
}

function velocityFor(plan: ThrowPlan): Vec3 {
  return aimRelease(
    plan.from,
    plan.target,
    flightTimeFor(plan.from, plan.target, plan.speedMps),
  );
}

export function botStep(
  memory: BotMemory,
  view: BotView,
  t: BotTuning,
  rng: () => number,
): { memory: BotMemory; action: BotAction | null } {
  const { state, side, nowS } = view;
  const turnKey = `${state.currentTurn}/${state.phase}`;
  if (turnKey !== memory.turnKey) {
    // A new turn or phase: sticks re-racked, a moment to "walk up".
    return {
      memory: {
        turnKey,
        tossed: [],
        readyAtS: nowS + t.turnStartDelayS,
      },
      action: null,
    };
  }
  if (
    isFinished(state) ||
    state.currentTurn !== side ||
    nowS < memory.readyAtS
  ) {
    return { memory, action: null };
  }
  const policyView: PolicyView = {
    state,
    halves: view.halves,
    positions: view.positions,
    racked: view.racked,
  };
  if (state.phase === 'inkast') {
    const next = state.inkastQueue[0];
    const key = next ? `${next.kubbId}:${String(next.attempt)}` : '';
    const plan = next ? planInkast(policyView, true) : null;
    if (!plan || memory.tossed.includes(key)) {
      return { memory, action: null };
    }
    const aimed = {
      ...plan,
      target: jitter(
        plan.target,
        rng,
        inkastSpreadM(view.halves, t) * t.inkastSpreadFactor,
      ),
    };
    return {
      memory: {
        ...memory,
        tossed: [...memory.tossed, key],
        readyAtS: nowS + t.afterTossS,
      },
      action: {
        pieceId: plan.pieceId,
        from: plan.from,
        velocity: velocityFor(aimed),
        spin: [0, 0, 0],
      },
    };
  }
  if (view.stickInFlight) {
    // Aiming now would pick a kubb the flying stick is about to fell
    // (Erik, 2026-11-01): wait until it rests, then a moment more.
    return {
      memory: { ...memory, readyAtS: nowS + t.afterStickRestsS },
      action: null,
    };
  }
  const plan = planStick(policyView, 'hit');
  if (!plan) {
    return { memory, action: null }; // all six out: the server ends the turn
  }
  const aimed = { ...plan, target: jitter(plan.target, rng, t.aimSpreadM) };
  return {
    memory: { ...memory, readyAtS: nowS + t.betweenSticksS },
    action: {
      pieceId: plan.pieceId,
      from: plan.from,
      velocity: velocityFor(aimed),
      // Head-over-heels about x, the sign following the throw.
      spin: [side === 'host' ? -t.stickSpinRadS : t.stickSpinRadS, 0, 0],
    },
  };
}

/** The server turned a toss down: let the bot toss that kubb again. A
 * refused stick needs nothing — it is still in the rack. */
export function forgetBotToss(memory: BotMemory, pieceId: string): BotMemory {
  return {
    ...memory,
    tossed: memory.tossed.filter((key) => !key.startsWith(`${pieceId}:`)),
  };
}
