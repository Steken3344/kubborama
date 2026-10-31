import { describe, expect, it } from 'vitest';
import { initialMatchState, withKubbFelled } from './match.js';
import { scoreboardFor } from './scoreboard.js';

const players = {
  host: { name: 'Erik', colorIndex: 1 },
  guest: { name: null, colorIndex: 0 },
};

describe('scoreboardFor', () => {
  it('names, colours and five standing kubbs a side at the start', () => {
    expect(scoreboardFor(initialMatchState(), players)).toEqual({
      host: { name: 'Erik', colorIndex: 1, standing: 5 },
      guest: { name: null, colorIndex: 0, standing: 5 },
      turn: 'host',
      phase: 'throwing',
      winner: null,
    });
  });

  it('counts down as kubbs fall', () => {
    const s = withKubbFelled(initialMatchState(), 'kubb-0', 0, -7.9).state;
    expect(scoreboardFor(s, players).guest.standing).toBe(4);
  });

  it('without a match: names only, no turn', () => {
    const board = scoreboardFor(null, { host: null, guest: null });
    expect(board.turn).toBeNull();
    expect(board.host).toEqual({ name: null, colorIndex: null, standing: 5 });
  });
});
