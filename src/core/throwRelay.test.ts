import { describe, expect, it } from 'vitest';
import {
  buildThrowRelayMessage,
  parseThrowRelayMessage,
  THROW_RELAY_SCHEMA_VERSION,
} from './throwRelay.js';

const base = {
  stickId: 'stick-2',
  position: [0.5, 0.9, -0.3] as [number, number, number],
  quaternion: [0, 0, 0, 1] as [number, number, number, number],
  linearVelocity: [1.2, 3.4, -5.6] as [number, number, number],
  angularVelocity: [0.1, 0.2, 0.3] as [number, number, number],
  hand: 'right' as const,
};

describe('buildThrowRelayMessage', () => {
  it('stamps the current schema version', () => {
    const message = buildThrowRelayMessage(base);
    expect(message.version).toBe(THROW_RELAY_SCHEMA_VERSION);
    expect(message.stickId).toBe('stick-2');
  });
});

describe('parseThrowRelayMessage (untrusted network boundary)', () => {
  it('round-trips a message built by buildThrowRelayMessage', () => {
    const message = buildThrowRelayMessage(base);
    expect(parseThrowRelayMessage(message)).toEqual(message);
  });

  it('rejects non-object garbage', () => {
    expect(parseThrowRelayMessage('not an object')).toBeNull();
    expect(parseThrowRelayMessage(null)).toBeNull();
    expect(parseThrowRelayMessage(42)).toBeNull();
  });

  it('rejects a mismatched schema version', () => {
    const message = buildThrowRelayMessage(base);
    expect(parseThrowRelayMessage({ ...message, version: 999 })).toBeNull();
  });

  it('rejects a missing stickId', () => {
    const { stickId: _stickId, ...rest } = buildThrowRelayMessage(base);
    expect(parseThrowRelayMessage(rest)).toBeNull();
  });

  it('rejects a wrong-length velocity tuple', () => {
    const malformed = {
      ...buildThrowRelayMessage(base),
      linearVelocity: [1, 2],
    };
    expect(parseThrowRelayMessage(malformed)).toBeNull();
  });

  it('rejects a hand value outside left/right', () => {
    const malformed = { ...buildThrowRelayMessage(base), hand: 'both' };
    expect(parseThrowRelayMessage(malformed)).toBeNull();
  });
});
