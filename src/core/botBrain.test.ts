import { describe, expect, it } from 'vitest';
import { botStep, freshBotMemory, inkastSpreadM } from './botBrain.js';
import type { BotTuning, BotView } from './botBrain.js';
import { courtHalves } from './inkast.js';
import { initialMatchState } from './match.js';
import type { MatchState } from './match.js';
import { createRng } from './rng.js';
import type { Vec3 } from './vec3.js';

const halves = courtHalves({ widthM: 5, lengthM: 8 });
const tuning: BotTuning = {
  aimSpreadM: 0.3,
  inkastSpreadFactor: 1,
  turnStartDelayS: 2,
  betweenSticksS: 1,
  afterTossS: 3,
  inkastSpreadMaxM: 1.2,
  inkastLineMarginM: 0.5,
  stickSpinRadS: 22,
};
const positions = new Map<string, Vec3>([
  ['kubb-0', [-2, 0.15, -8]],
  ['king', [0, 0.15, -4]],
]);
const guestTurn: MatchState = { ...initialMatchState(), currentTurn: 'guest' };
const ALL = ['stick-0', 'stick-1', 'stick-2', 'stick-3', 'stick-4', 'stick-5'];
const view = (
  state: MatchState,
  nowS: number,
  racked: readonly string[] = ALL,
): BotView => ({
  state,
  side: 'guest',
  halves,
  positions,
  racked,
  nowS,
});

describe('botStep', () => {
  it('waits out the turn-start delay, then throws one stick at a time', () => {
    const rng = createRng(1);
    let mem = freshBotMemory();
    let step = botStep(mem, view(guestTurn, 0), tuning, rng);
    expect(step.action).toBeNull(); // turn just started
    mem = step.memory;
    step = botStep(mem, view(guestTurn, 1.9), tuning, rng);
    expect(step.action).toBeNull();
    step = botStep(step.memory, view(guestTurn, 2), tuning, rng);
    expect(step.action?.pieceId).toBe('stick-0');
    const again = botStep(step.memory, view(guestTurn, 2.5), tuning, rng);
    expect(again.action).toBeNull(); // between sticks
    // The server says which sticks are still racked.
    const next = botStep(
      again.memory,
      view(guestTurn, 3, ALL.slice(1)),
      tuning,
      rng,
    );
    expect(next.action?.pieceId).toBe('stick-1');
  });

  it('a restart on the same turn/phase throws the full rack again (review)', () => {
    const rng = createRng(5);
    let step = botStep(freshBotMemory(), view(guestTurn, 0), tuning, rng);
    step = botStep(step.memory, view(guestTurn, 2, []), tuning, rng);
    expect(step.action).toBeNull(); // all six out
    // "Ny runda": same key, the rack is full again.
    const again = botStep(step.memory, view(guestTurn, 10), tuning, rng);
    expect(again.action?.pieceId).toBe('stick-0');
  });

  it('throws from behind its own baseline towards +z, spinning', () => {
    const rng = createRng(2);
    let step = botStep(freshBotMemory(), view(guestTurn, 0), tuning, rng);
    step = botStep(step.memory, view(guestTurn, 5), tuning, rng);
    const a = step.action;
    expect(a?.from[2]).toBeLessThan(halves.farBaselineZ);
    expect(a?.velocity[2]).toBeGreaterThan(0);
    expect(a?.spin[0]).toBe(22);
  });

  it('does nothing on the other side’s turn or after the match', () => {
    const rng = createRng(3);
    const hostTurn = initialMatchState();
    let step = botStep(freshBotMemory(), view(hostTurn, 0), tuning, rng);
    step = botStep(step.memory, view(hostTurn, 10), tuning, rng);
    expect(step.action).toBeNull();
    const won: MatchState = {
      ...guestTurn,
      winner: 'host',
      endReason: 'kingFelledEarly',
    };
    step = botStep(freshBotMemory(), view(won, 0), tuning, rng);
    step = botStep(step.memory, view(won, 10), tuning, rng);
    expect(step.action).toBeNull();
  });

  it('tosses each queued inkast kubb once per attempt', () => {
    const rng = createRng(4);
    const inkast: MatchState = {
      ...guestTurn,
      phase: 'inkast',
      inkastQueue: [{ kubbId: 'kubb-7', attempt: 1 }],
    };
    let step = botStep(freshBotMemory(), view(inkast, 0), tuning, rng);
    step = botStep(step.memory, view(inkast, 5), tuning, rng);
    expect(step.action?.pieceId).toBe('kubb-7');
    expect(step.action?.spin).toEqual([0, 0, 0]);
    // Still queued (in the air): never tossed twice.
    const twice = botStep(step.memory, view(inkast, 20), tuning, rng);
    expect(twice.action).toBeNull();
    // Out on the first try: attempt 2 is a new toss.
    const retry: MatchState = {
      ...inkast,
      inkastQueue: [{ kubbId: 'kubb-7', attempt: 2 }],
    };
    const second = botStep(twice.memory, view(retry, 21), tuning, rng);
    expect(second.action?.pieceId).toBe('kubb-7');
  });

  it('sizes the inkast spread to the court', () => {
    expect(inkastSpreadM(courtHalves({ widthM: 3, lengthM: 6 }), tuning)).toBe(
      1,
    );
    expect(inkastSpreadM(halves, tuning)).toBe(1.2);
  });

  it('a weaker level tosses some inkast kubbs out; the hardest never does', () => {
    const outOf = (factor: number) => {
      const rng = createRng(7);
      let out = 0;
      for (let i = 0; i < 200; i++) {
        const inkast: MatchState = {
          ...guestTurn,
          phase: 'inkast',
          inkastQueue: [{ kubbId: `kubb-${String(i % 10)}`, attempt: 1 }],
        };
        let step = botStep(
          freshBotMemory(),
          view(inkast, 0),
          { ...tuning, inkastSpreadFactor: factor },
          rng,
        );
        step = botStep(
          step.memory,
          view(inkast, 5),
          { ...tuning, inkastSpreadFactor: factor },
          rng,
        );
        const a = step.action;
        if (!a) continue;
        // The aim point: along the release direction to the middle of
        // the host half (z = centre / 2), where the toss is aimed.
        const aimZ = halves.centreZ / 2;
        const x =
          a.from[0] + (a.velocity[0] / a.velocity[2]) * (aimZ - a.from[2]);
        if (Math.abs(x) > halves.halfWidthM) out += 1;
      }
      return out;
    };
    expect(outOf(1)).toBe(0);
    expect(outOf(2.5)).toBeGreaterThan(0);
  });
});
