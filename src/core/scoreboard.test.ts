import { describe, expect, it } from 'vitest';
import { initialMatchState, withKubbFelled } from './match.js';
import { scoreboardFor } from './scoreboard.js';

const players = {
  host: { name: 'Erik', colorIndex: 1 },
  guest: { name: null, colorIndex: 0 },
};

describe('scoreboardFor', () => {
  it('names, colours and five kubbs each to knock down at the start', () => {
    expect(scoreboardFor(initialMatchState(), players)).toEqual({
      host: { name: 'Erik', colorIndex: 1, toFell: 5 },
      guest: { name: null, colorIndex: 0, toFell: 5 },
      turn: 'host',
      phase: 'throwing',
      winner: null,
    });
  });

  it("counts down the thrower's own row as it fells the opponent's kubbs", () => {
    // kubb-0 stands on the guest's baseline: the HOST knocked it down.
    const s = withKubbFelled(initialMatchState(), 'kubb-0', 0, -7.9).state;
    const board = scoreboardFor(s, players);
    expect(board.host.toFell).toBe(4);
    expect(board.guest.toFell).toBe(5);
  });

  it("field kubbs in a player's half count for the OPPONENT's row", () => {
    // Bot match, 2026-10-31: "Spelare A 8 kvar" counted the kubbs tossed
    // into A's half — they are B's to knock down, not A's.
    const s = {
      ...initialMatchState(),
      fieldKubbs: [
        { kubbId: 'kubb-0', half: 'host' as const, x: 0, z: -2 },
        { kubbId: 'kubb-1', half: 'host' as const, x: 1, z: -2 },
      ],
      baselineKubbs: {
        host: initialMatchState().baselineKubbs.host,
        guest: initialMatchState().baselineKubbs.guest.slice(2),
      },
    };
    const board = scoreboardFor(s, players);
    expect(board.host.toFell).toBe(3);
    expect(board.guest.toFell).toBe(7);
  });

  it('without a match: names only, no turn', () => {
    const board = scoreboardFor(null, { host: null, guest: null });
    expect(board.turn).toBeNull();
    expect(board.host).toEqual({ name: null, colorIndex: null, toFell: 5 });
  });
});
