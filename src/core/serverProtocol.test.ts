import { BOT_LEVELS, match } from '../config.js';
import { describe, expect, it } from 'vitest';
import {
  botLevelSchema,
  buildServerMessage,
  parseClientMessage,
  isUnknownServerMessageType,
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

describe('serverProtocol — voice signaling', () => {
  it('accepts offer/answer/ice and rejects oversize or unknown kinds', () => {
    expect(
      parseClientMessage({
        type: 'signal',
        data: { kind: 'offer', sdp: 'v=0' },
      })?.type,
    ).toBe('signal');
    expect(
      parseClientMessage({
        type: 'signal',
        data: {
          kind: 'ice',
          candidate: 'candidate:1',
          sdpMid: '0',
          sdpMLineIndex: 0,
        },
      })?.type,
    ).toBe('signal');
    expect(
      parseClientMessage({
        type: 'signal',
        data: { kind: 'offer', sdp: 'x'.repeat(20_001) },
      }),
    ).toBeNull();
    expect(
      parseClientMessage({ type: 'signal', data: { kind: 'hello' } }),
    ).toBeNull();
  });
});

describe('serverProtocol — room settings', () => {
  it('setGameMode from a client, room from the server', () => {
    expect(
      parseClientMessage({ type: 'setGameMode', gameMode: 'advanced' })?.type,
    ).toBe('setGameMode');
    expect(
      parseClientMessage({ type: 'setGameMode', gameMode: 'huge' }),
    ).toBeNull();
    expect(parseServerMessage({ type: 'room', gameMode: 'simple' })).toEqual({
      type: 'room',
      gameMode: 'simple',
    });
  });
});

describe('room settings (2026-11-01)', () => {
  it('the protocol knows exactly the bot levels src/data/bot.json defines', () => {
    expect([...botLevelSchema.options].sort()).toEqual([...BOT_LEVELS].sort());
  });

  it('accepts every time-limit choice and setBot null; rejects nonsense', () => {
    for (const minutes of match.timeLimitChoicesMin) {
      expect(
        parseClientMessage({ type: 'setTimeLimit', minutes }),
      ).not.toBeNull();
    }
    expect(
      parseClientMessage({ type: 'setTimeLimit', minutes: 1.5 }),
    ).toBeNull();
    expect(parseClientMessage({ type: 'setBot', level: null })).not.toBeNull();
    expect(parseClientMessage({ type: 'setBot', level: 'godlike' })).toBeNull();
  });

  it('accepts setRules standard/simplified; rejects other rules', () => {
    for (const rules of ['standard', 'simplified']) {
      expect(parseClientMessage({ type: 'setRules', rules })).not.toBeNull();
    }
    expect(parseClientMessage({ type: 'setRules', rules: 'easy' })).toBeNull();
    expect(parseClientMessage({ type: 'setRules' })).toBeNull();
  });
});

describe('room settings server messages (review, 2026-11-01)', () => {
  it('roomSettings.rules defaults to standard for an older server', () => {
    const old = parseServerMessage({
      type: 'roomSettings',
      timeLimitMin: 0,
      bot: null,
    });
    expect(old).toMatchObject({ rules: 'standard' });
    const simplified = parseServerMessage({
      type: 'roomSettings',
      timeLimitMin: 0,
      bot: null,
      rules: 'simplified',
    });
    expect(simplified).toMatchObject({ rules: 'simplified' });
    expect(
      parseServerMessage({
        type: 'roomSettings',
        timeLimitMin: 0,
        bot: null,
        rules: 'odd',
      }),
    ).toBeNull();
  });

  it('parses roomSettings, clock and a bot player', () => {
    expect(
      parseServerMessage({
        type: 'roomSettings',
        timeLimitMin: 20,
        bot: 'easy',
      }),
    ).not.toBeNull();
    expect(
      parseServerMessage({ type: 'clock', remainingS: 61.5, timeUp: false }),
    ).not.toBeNull();
    expect(
      parseServerMessage({ type: 'clock', remainingS: -1, timeUp: false }),
    ).toBeNull();
    expect(
      parseServerMessage({
        type: 'players',
        host: { name: null, colorIndex: 0 },
        guest: { name: null, colorIndex: 4, bot: 'hard' },
      }),
    ).not.toBeNull();
  });
});

describe('unknown server message types (2026-11-01)', () => {
  it('tells a newer message type from a malformed known one', () => {
    expect(isUnknownServerMessageType({ type: 'fromTheFuture', x: 1 })).toBe(
      true,
    );
    expect(isUnknownServerMessageType({ type: 'snapshot', tick: 'bad' })).toBe(
      false,
    );
    expect(isUnknownServerMessageType({ type: 'impacts', items: [] })).toBe(
      false,
    );
    expect(isUnknownServerMessageType(null)).toBe(false);
  });
});
