import { describe, expect, it } from 'vitest';
import { initialMatchState, withKingFelled, withKubbFelled } from './match.js';
import {
  buildMatchSyncMessage,
  MATCH_SYNC_SCHEMA_VERSION,
  parseMatchSyncMessage,
  peekSchemaVersion,
} from './matchSync.js';

describe('matchSync v2', () => {
  it('stamps version 2', () => {
    expect(MATCH_SYNC_SCHEMA_VERSION).toBe(2);
    expect(buildMatchSyncMessage(initialMatchState()).version).toBe(2);
  });

  it('round-trips a mid-match and a finished state', () => {
    let s = withKubbFelled(initialMatchState(), 'kubb-0');
    expect(parseMatchSyncMessage(buildMatchSyncMessage(s))).toEqual(
      buildMatchSyncMessage(s),
    );
    s = withKingFelled(s);
    expect(
      parseMatchSyncMessage(buildMatchSyncMessage(s))?.state.endReason,
    ).toBe('kingFelledEarly');
  });

  it('rejects a v1 message and garbage', () => {
    const v1 = {
      version: 1,
      state: {
        currentTurn: 'host',
        hostKubbsRemaining: 5,
        guestKubbsRemaining: 5,
        winner: null,
      },
    };
    expect(parseMatchSyncMessage(v1)).toBeNull();
    expect(parseMatchSyncMessage(null)).toBeNull();
    expect(parseMatchSyncMessage({ version: 2, state: {} })).toBeNull();
  });

  it('rejects an unknown endReason', () => {
    const bad = buildMatchSyncMessage(initialMatchState());
    expect(
      parseMatchSyncMessage({
        ...bad,
        state: { ...bad.state, endReason: 'x' },
      }),
    ).toBeNull();
  });

  it('peeks the version of anything object-shaped, else null', () => {
    expect(peekSchemaVersion({ version: 1 })).toBe(1);
    expect(peekSchemaVersion({ version: '1' })).toBeNull();
    expect(peekSchemaVersion('nope')).toBeNull();
    expect(peekSchemaVersion(null)).toBeNull();
  });
});
