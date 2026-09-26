import { describe, expect, it } from 'vitest';
import { KUBB_COUNT } from './court-layout.js';
import {
  initialMatchState,
  withKingFelled,
  withKubbFelled,
  withTurnAdvanced,
} from './match.js';
import {
  buildMatchSyncMessage,
  MATCH_SYNC_SCHEMA_VERSION,
  parseMatchSyncMessage,
  peekSchemaVersion,
} from './matchSync.js';

describe('matchSync v3', () => {
  it('stamps version 3', () => {
    expect(MATCH_SYNC_SCHEMA_VERSION).toBe(3);
    expect(buildMatchSyncMessage(initialMatchState()).version).toBe(3);
  });

  it('round-trips an inkast state and a finished state', () => {
    let s = withKubbFelled(initialMatchState(), 'kubb-0', 0, -7.9).state;
    s = withTurnAdvanced(s);
    expect(s.phase).toBe('inkast');
    expect(parseMatchSyncMessage(buildMatchSyncMessage(s))).toEqual(
      buildMatchSyncMessage(s),
    );
    s = withKingFelled(s);
    expect(
      parseMatchSyncMessage(buildMatchSyncMessage(s))?.state.endReason,
    ).toBe('kingFelledByInkast');
  });

  it('rejects a v2 message (and says it was v2) and garbage', () => {
    const v2 = {
      version: 2,
      state: {
        currentTurn: 'host',
        felledKubbIds: { host: [], guest: [] },
        winner: null,
        endReason: null,
      },
    };
    expect(parseMatchSyncMessage(v2)).toBeNull();
    expect(peekSchemaVersion(v2)).toBe(2);
    expect(parseMatchSyncMessage(null)).toBeNull();
    expect(parseMatchSyncMessage({ version: 3, state: {} })).toBeNull();
  });

  it('rejects oversize lists and non-finite positions', () => {
    const ok = buildMatchSyncMessage(initialMatchState());
    const tooMany = Array.from({ length: KUBB_COUNT * 2 + 1 }, (_, i) => ({
      kubbId: `kubb-${i}`,
      half: 'host',
      x: 0,
      z: -1,
    }));
    expect(
      parseMatchSyncMessage({
        ...ok,
        state: { ...ok.state, fieldKubbs: tooMany },
      }),
    ).toBeNull();
    expect(
      parseMatchSyncMessage({
        ...ok,
        state: {
          ...ok.state,
          fieldKubbs: [{ kubbId: 'kubb-0', half: 'host', x: Infinity, z: 0 }],
        },
      }),
    ).toBeNull();
  });
});
