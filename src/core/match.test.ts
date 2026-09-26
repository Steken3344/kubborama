import { describe, expect, it } from 'vitest';
import { courtHalves } from './inkast.js';
import {
  advantageLineZ,
  initialMatchState,
  isFinished,
  kubbIndexFromId,
  kubbSide,
  otherSide,
  standingKubbs,
  turnPassedTo,
  withInkastLanded,
  withKingFelled,
  withKubbFelled,
  withTurnAdvanced,
} from './match.js';
import type { MatchState } from './match.js';

// Tournament court: host half z ∈ [-4, 0], guest half z ∈ [-8, -4].
const halves = courtHalves({ widthM: 5, lengthM: 8 });
const opts = { insetM: 0.05, minSeparationM: 0.12 };
const GUEST_Z = -7.9; // a guest baseline kubb's rest z
const HOST_Z = -0.1;

function fell(s: MatchState, id: string, x = 0, z = GUEST_Z): MatchState {
  return withKubbFelled(s, id, x, z).state;
}

function land(s: MatchState, id: string, x: number, z: number) {
  return withInkastLanded(s, id, x, z, halves, [], opts);
}

/** Host fells kubb-0 and kubb-1, turn passes, guest tosses both onto
 * the host half — the guest is now throwing at two field kubbs. */
function guestWithTwoFieldKubbs(): MatchState {
  let s = fell(fell(initialMatchState(), 'kubb-0'), 'kubb-1');
  s = withTurnAdvanced(s);
  s = land(s, 'kubb-0', -0.5, -2).state;
  s = land(s, 'kubb-1', 0.5, -3).state;
  return s;
}

describe('initialMatchState', () => {
  it('starts throwing with every kubb on its baseline', () => {
    expect(initialMatchState()).toEqual({
      currentTurn: 'host',
      phase: 'throwing',
      baselineKubbs: {
        guest: ['kubb-0', 'kubb-1', 'kubb-2', 'kubb-3', 'kubb-4'],
        host: ['kubb-5', 'kubb-6', 'kubb-7', 'kubb-8', 'kubb-9'],
      },
      fieldKubbs: [],
      felledThisTurn: [],
      inkastQueue: [],
      winner: null,
      endReason: null,
    });
    expect(standingKubbs(initialMatchState())).toEqual({ host: 5, guest: 5 });
  });
});

describe('helpers', () => {
  it('otherSide / kubbSide / kubbIndexFromId / turnPassedTo', () => {
    expect(otherSide('host')).toBe('guest');
    expect(kubbSide(0, 5)).toBe('guest');
    expect(kubbSide(9, 5)).toBe('host');
    expect(kubbSide(10, 5)).toBeNull();
    expect(kubbIndexFromId('kubb-7')).toBe(7);
    expect(kubbIndexFromId('king')).toBeNull();
    expect(turnPassedTo('host', 'guest', 'guest')).toBe(true);
    expect(turnPassedTo('guest', 'guest', 'guest')).toBe(false);
    expect(turnPassedTo(null, 'host', 'host')).toBe(false);
  });
});

describe('withKubbFelled — throwing', () => {
  it('counts a target-half baseline kubb when no field kubb stands', () => {
    const step = withKubbFelled(initialMatchState(), 'kubb-2', 0, GUEST_Z);
    expect(step.state.baselineKubbs.guest).not.toContain('kubb-2');
    expect(step.state.felledThisTurn).toEqual(['kubb-2']);
    expect(step.effects).toEqual([]);
  });
  it('raises an early baseline kubb while a field kubb stands (rule 5)', () => {
    const s = guestWithTwoFieldKubbs();
    const step = withKubbFelled(s, 'kubb-7', 0, HOST_Z);
    expect(step.state).toBe(s);
    expect(step.effects).toEqual([
      { type: 'restoreHome', kubbId: 'kubb-7', reason: 'earlyBaseline' },
    ]);
  });
  it('counts field kubbs, then the baseline kubb', () => {
    let s = guestWithTwoFieldKubbs();
    s = fell(s, 'kubb-0', -0.5, -2);
    s = fell(s, 'kubb-1', 0.5, -3);
    expect(s.fieldKubbs).toEqual([]);
    const step = withKubbFelled(s, 'kubb-7', 0, HOST_Z);
    expect(step.effects).toEqual([]);
    expect(step.state.felledThisTurn).toEqual(['kubb-0', 'kubb-1', 'kubb-7']);
  });
  it('raises an own-half kubb knocked by a rebound (rule 6)', () => {
    const s = initialMatchState();
    const step = withKubbFelled(s, 'kubb-6', 0.2, HOST_Z);
    expect(step.state).toBe(s);
    expect(step.effects).toEqual([
      { type: 'restoreHome', kubbId: 'kubb-6', reason: 'rebound' },
    ]);
  });
  it('re-raises an own-half field kubb where it came to rest', () => {
    // Guest's field kubbs stand on the host half; on the HOST's next turn
    // they are on the thrower's own half.
    let s = guestWithTwoFieldKubbs();
    s = withTurnAdvanced(s);
    const step = withKubbFelled(s, 'kubb-0', -0.4, -2.2);
    expect(step.effects).toEqual([
      { type: 'raise', kubbId: 'kubb-0', x: -0.4, z: -2.2, reason: 'rebound' },
    ]);
    expect(step.state.fieldKubbs.find((k) => k.kubbId === 'kubb-0')).toEqual({
      kubbId: 'kubb-0',
      half: 'host',
      x: -0.4,
      z: -2.2,
    });
  });
  it('ignores unknown, already felled and queued ids', () => {
    const s = fell(initialMatchState(), 'kubb-2');
    expect(withKubbFelled(s, 'kubb-2', 0, 0).state).toBe(s);
    expect(withKubbFelled(s, 'king', 0, 0).state).toBe(s);
    const queued = withTurnAdvanced(s);
    expect(withKubbFelled(queued, 'kubb-2', 0, 0).state).toBe(queued);
  });
});

describe('withTurnAdvanced (rule 10)', () => {
  it('queues the felled kubbs for the next thrower and enters inkast', () => {
    const s = withTurnAdvanced(
      fell(fell(initialMatchState(), 'kubb-0'), 'kubb-1'),
    );
    expect(s.currentTurn).toBe('guest');
    expect(s.phase).toBe('inkast');
    expect(s.inkastQueue).toEqual([
      { kubbId: 'kubb-0', attempt: 1 },
      { kubbId: 'kubb-1', attempt: 1 },
    ]);
    expect(s.felledThisTurn).toEqual([]);
  });
  it('goes straight to throwing when nothing was felled', () => {
    const s = withTurnAdvanced(initialMatchState());
    expect(s.phase).toBe('throwing');
    expect(s.currentTurn).toBe('guest');
  });
});

describe('withInkastLanded (rules 2–3)', () => {
  const queued = () =>
    withTurnAdvanced(fell(fell(initialMatchState(), 'kubb-0'), 'kubb-1'));
  it('raises a legal landing as a field kubb on the target half', () => {
    const step = land(queued(), 'kubb-0', 1, -2);
    expect(step.state.fieldKubbs).toEqual([
      { kubbId: 'kubb-0', half: 'host', x: 1, z: -2 },
    ]);
    expect(step.state.inkastQueue).toEqual([{ kubbId: 'kubb-1', attempt: 1 }]);
    expect(step.effects).toEqual([
      { type: 'raise', kubbId: 'kubb-0', x: 1, z: -2, reason: 'inkast' },
    ]);
  });
  it('sends a first miss back to the rack for attempt 2', () => {
    const step = land(queued(), 'kubb-0', 0, -5);
    expect(step.state.inkastQueue[0]).toEqual({ kubbId: 'kubb-0', attempt: 2 });
    expect(step.effects).toEqual([{ type: 'returnToRack', kubbId: 'kubb-0' }]);
  });
  it('clamps a second miss just inside the target half (house rule)', () => {
    const s = land(queued(), 'kubb-0', 0, -5).state;
    const step = land(s, 'kubb-0', 3.5, -5);
    expect(step.effects).toEqual([
      {
        type: 'raise',
        kubbId: 'kubb-0',
        x: 2.45,
        z: -3.95,
        reason: 'inkastClamped',
      },
    ]);
  });
  it('switches to throwing when the last kubb has landed', () => {
    let s = land(queued(), 'kubb-0', -1, -2).state;
    expect(s.phase).toBe('inkast');
    s = land(s, 'kubb-1', 1, -2).state;
    expect(s.phase).toBe('throwing');
  });
  it('nudges a landing that would stand inside another piece', () => {
    const step = withInkastLanded(
      queued(),
      'kubb-0',
      0,
      -2,
      halves,
      [{ x: 0, z: -2 }],
      opts,
    );
    expect(step.state.fieldKubbs[0]?.x).toBeCloseTo(0.12);
  });
  it('ignores an id that is not queued, or any landing while throwing', () => {
    const s = queued();
    expect(land(s, 'kubb-4', 0, -2).state).toBe(s);
    const t = initialMatchState();
    expect(land(t, 'kubb-0', 0, -2).state).toBe(t);
  });
});

describe('withKubbFelled — inkast (rule 4)', () => {
  it('raises anything a tossed kubb knocks over, counting nothing', () => {
    let s = guestWithTwoFieldKubbs();
    s = fell(s, 'kubb-0', -0.5, -2);
    s = fell(s, 'kubb-7', 0, HOST_Z);
    s = withTurnAdvanced(s); // host's inkast (kubb-7 was raised, not counted)
    const hitBaseline = withKubbFelled(s, 'kubb-3', 0, GUEST_Z);
    expect(hitBaseline.effects).toEqual([
      { type: 'restoreHome', kubbId: 'kubb-3', reason: 'inkastHit' },
    ]);
    expect(hitBaseline.state.felledThisTurn).toEqual([]);
  });
});

describe('withKingFelled (rules 4, 9)', () => {
  it('is a loss when kubbs still stand on the target half', () => {
    const s = withKingFelled(initialMatchState());
    expect(s.winner).toBe('guest');
    expect(s.endReason).toBe('kingFelledEarly');
  });
  it('is a win once the target half is empty', () => {
    const s = ['kubb-0', 'kubb-1', 'kubb-2', 'kubb-3', 'kubb-4'].reduce(
      (acc, id) => fell(acc, id),
      initialMatchState(),
    );
    expect(standingKubbs(s).guest).toBe(0);
    const won = withKingFelled(s);
    expect(won.winner).toBe('host');
    expect(won.endReason).toBe('allKubbsAndKing');
  });
  it('field kubbs on the target half must be down too', () => {
    const s = withKingFelled(guestWithTwoFieldKubbs());
    expect(s.endReason).toBe('kingFelledEarly');
  });
  it('judges by the phase the king fell in, not the phase at decision time', () => {
    // The last tossed kubb can land (phase → throwing) before the king's
    // deferred decision is applied — the decision must still be rule 4.
    const s = initialMatchState(); // phase 'throwing' now
    const lost = withKingFelled(s, 'inkast');
    expect(lost.endReason).toBe('kingFelledByInkast');
    expect(lost.winner).toBe('guest');
  });
  it('a king felled during the inkast is a loss for the tosser', () => {
    const s = withTurnAdvanced(fell(initialMatchState(), 'kubb-0'));
    const lost = withKingFelled(s);
    expect(lost.winner).toBe('host');
    expect(lost.endReason).toBe('kingFelledByInkast');
    expect(isFinished(lost)).toBe(true);
    expect(withKingFelled(lost)).toBe(lost);
    expect(withTurnAdvanced(lost)).toBe(lost);
  });
});

describe('advantageLineZ (rule 8)', () => {
  it('is the z of the own-half field kubb closest to the centre', () => {
    const s = withTurnAdvanced(guestWithTwoFieldKubbs()); // host's turn
    expect(advantageLineZ(s, 'host', halves)).toBe(-3);
    expect(advantageLineZ(s, 'guest', halves)).toBeNull();
  });
});

describe('a full field-kubb turn', () => {
  it('knock, toss back, raise, field first, re-knock', () => {
    let s = guestWithTwoFieldKubbs();
    expect(s.phase).toBe('throwing');
    expect(standingKubbs(s)).toEqual({ host: 7, guest: 3 });
    s = fell(s, 'kubb-0', -0.5, -2);
    s = fell(s, 'kubb-1', 0.5, -3);
    s = fell(s, 'kubb-9', 1, HOST_Z);
    s = withTurnAdvanced(s);
    expect(s.currentTurn).toBe('host');
    expect(s.inkastQueue.map((i) => i.kubbId)).toEqual([
      'kubb-0',
      'kubb-1',
      'kubb-9',
    ]);
    expect(standingKubbs(s)).toEqual({ host: 4, guest: 3 });
  });
});
