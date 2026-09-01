import { describe, expect, it } from 'vitest';
import {
  buildMatchSyncMessage,
  MATCH_SYNC_SCHEMA_VERSION,
  parseMatchSyncMessage,
} from './matchSync.js';
import { initialMatchState, withKubbFelled } from './match.js';

describe('buildMatchSyncMessage', () => {
  it('stamps the current schema version', () => {
    const message = buildMatchSyncMessage(initialMatchState(5));
    expect(message.version).toBe(MATCH_SYNC_SCHEMA_VERSION);
    expect(message.state.currentTurn).toBe('host');
  });
});

describe('parseMatchSyncMessage (untrusted network boundary)', () => {
  it('round-trips a message built by buildMatchSyncMessage', () => {
    const state = withKubbFelled(initialMatchState(5), 'guest');
    const message = buildMatchSyncMessage(state);
    expect(parseMatchSyncMessage(message)).toEqual(message);
  });

  it('rejects non-object garbage', () => {
    expect(parseMatchSyncMessage('not an object')).toBeNull();
    expect(parseMatchSyncMessage(null)).toBeNull();
  });

  it('rejects a mismatched schema version', () => {
    const message = buildMatchSyncMessage(initialMatchState(5));
    expect(parseMatchSyncMessage({ ...message, version: 999 })).toBeNull();
  });

  it('rejects an invalid side value', () => {
    const malformed = {
      version: MATCH_SYNC_SCHEMA_VERSION,
      state: {
        currentTurn: 'referee',
        hostKubbsRemaining: 5,
        guestKubbsRemaining: 5,
        winner: null,
      },
    };
    expect(parseMatchSyncMessage(malformed)).toBeNull();
  });

  it('rejects a negative kubb count', () => {
    const malformed = {
      version: MATCH_SYNC_SCHEMA_VERSION,
      state: {
        currentTurn: 'host',
        hostKubbsRemaining: -1,
        guestKubbsRemaining: 5,
        winner: null,
      },
    };
    expect(parseMatchSyncMessage(malformed)).toBeNull();
  });
});
