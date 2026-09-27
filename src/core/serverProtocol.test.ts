import { describe, expect, it } from 'vitest';
import {
  buildServerMessage,
  parseClientMessage,
  parseServerMessage,
  SERVER_PROTOCOL_VERSION,
} from './serverProtocol.js';

const pose = {
  pieceId: 'stick-0',
  position: [0, 1, 0] as [number, number, number],
  quaternion: [0, 0, 0, 1] as [number, number, number, number],
  linearVelocity: [0, 3, -7] as [number, number, number],
  angularVelocity: [-20, 0, 0] as [number, number, number],
};

describe('serverProtocol', () => {
  it('accepts a join and a throw from a client', () => {
    expect(
      parseClientMessage({
        type: 'join',
        protocol: SERVER_PROTOCOL_VERSION,
        gameMode: 'advanced',
        clientId: 'abcdef123456',
      }),
    ).toEqual({
      type: 'join',
      protocol: SERVER_PROTOCOL_VERSION,
      gameMode: 'advanced',
      clientId: 'abcdef123456',
    });
    expect(parseClientMessage({ type: 'throw', ...pose })?.type).toBe('throw');
  });
  it('rejects garbage, unknown types and non-finite numbers', () => {
    expect(parseClientMessage(null)).toBeNull();
    expect(parseClientMessage({ type: 'teleport' })).toBeNull();
    expect(
      parseClientMessage({
        type: 'throw',
        ...pose,
        linearVelocity: [0, Infinity, 0],
      }),
    ).toBeNull();
    expect(
      parseClientMessage({ type: 'throw', ...pose, pieceId: 'x'.repeat(40) }),
    ).toBeNull();
  });
  it('round-trips server messages', () => {
    const welcome = buildServerMessage({
      type: 'welcome',
      protocol: SERVER_PROTOCOL_VERSION,
      side: 'guest',
      gameMode: 'advanced',
    });
    expect(parseServerMessage(JSON.parse(JSON.stringify(welcome)))).toEqual(
      welcome,
    );
    const snapshot = buildServerMessage({
      type: 'snapshot',
      tick: 120,
      pieces: [
        { id: 'king', position: [0, 0.15, -3], quaternion: [0, 0, 0, 1] },
      ],
    });
    expect(parseServerMessage(snapshot)).toEqual(snapshot);
    expect(
      parseServerMessage({ type: 'snapshot', tick: -1, pieces: [] }),
    ).toBeNull();
  });
});

describe('serverProtocol — magnitudes (review)', () => {
  it('rejects absurd velocities and positions far off the court', () => {
    expect(
      parseClientMessage({
        type: 'throw',
        ...pose,
        linearVelocity: [0, 0, -1e12],
      }),
    ).toBeNull();
    expect(
      parseClientMessage({
        type: 'throw',
        ...pose,
        angularVelocity: [500, 0, 0],
      }),
    ).toBeNull();
    expect(
      parseClientMessage({ type: 'throw', ...pose, position: [0, 1, -500] }),
    ).toBeNull();
  });
});

describe('serverProtocol v2 (MP6)', () => {
  it('join needs a clientId; reset is a message', () => {
    expect(
      parseClientMessage({
        type: 'join',
        protocol: SERVER_PROTOCOL_VERSION,
        gameMode: 'simple',
      }),
    ).toBeNull();
    expect(parseClientMessage({ type: 'reset' })).toEqual({ type: 'reset' });
  });
  it('round and match messages parse', () => {
    const round = {
      type: 'round',
      side: 'guest',
      result: {
        roundNumber: 2,
        kubbsFelled: 1,
        kingFelled: false,
        sticksThrownWhenKingFelled: null,
      },
      sticksThrownThisRound: 6,
      longestThrowM: 6.2,
      longestFellingThrowM: null,
      roundDurationS: 31.5,
    };
    expect(parseServerMessage(round)).toEqual(round);
    expect(parseServerMessage({ type: 'match', state: null })).toEqual({
      type: 'match',
      state: null,
    });
  });
});
