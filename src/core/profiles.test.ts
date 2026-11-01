import { describe, expect, it } from 'vitest';
import {
  claimProfile,
  clientProfile,
  emptyProfileStore,
  isKnownDevice,
  MAX_HEAD_TO_HEAD,
  parseProfileStore,
  profileKeyFor,
  recordBotResult,
  recordMatchResult,
  recordRoundFor,
  setProfileColor,
} from './profiles.js';

const round = {
  result: {
    roundNumber: 1,
    kubbsFelled: 2,
    kingFelled: false,
    sticksThrownWhenKingFelled: null,
  },
  sticksThrownThisRound: 6,
  longestThrowThisRoundM: 7.5,
  longestFellingThrowThisRoundM: 6,
  roundDurationS: 40,
};

describe('profile store', () => {
  it('an unknown device plays anonymously; nothing is stored until it matters', () => {
    const { store, key } = profileKeyFor(emptyProfileStore(), 'dev-1');
    expect(key).toBe('device:dev-1');
    expect(store).toEqual(emptyProfileStore());
    expect(isKnownDevice(store, 'dev-1')).toBe(false);
    expect(clientProfile(store, key)).toMatchObject({
      name: null,
      colorIndex: 0,
    });
    const coloured = setProfileColor(store, key, 2);
    expect(isKnownDevice(coloured, 'dev-1')).toBe(true);
    expect(profileKeyFor(coloured, 'dev-1').key).toBe(key);
  });

  it('a match between two seats on the same profile records nothing', () => {
    const store = claimProfile(emptyProfileStore(), 'a', 'Erik');
    expect(recordMatchResult(store, 'name:Erik', 'name:Erik')).toBe(store);
  });

  it('sends at most MAX_HEAD_TO_HEAD rows, most played first', () => {
    let store = claimProfile(emptyProfileStore(), 'a', 'Erik');
    for (let i = 0; i < MAX_HEAD_TO_HEAD + 5; i++) {
      store = recordMatchResult(store, 'name:Erik', `device:x${i}`);
    }
    store = recordMatchResult(store, 'device:x60', 'name:Erik');
    const rows = clientProfile(store, 'name:Erik').headToHead;
    expect(rows).toHaveLength(MAX_HEAD_TO_HEAD);
    expect(rows[0]).toMatchObject({ won: 1, lost: 1 }); // x60: 2 games
  });

  it('choosing a name claims that profile; the device keeps it', () => {
    let { store } = profileKeyFor(emptyProfileStore(), 'dev-1');
    store = setProfileColor(store, 'device:dev-1', 3);
    store = claimProfile(store, 'dev-1', 'Erik');
    const { key } = profileKeyFor(store, 'dev-1');
    expect(key).toBe('name:Erik');
    // A brand-new named profile starts with the colour already chosen.
    expect(clientProfile(store, key).colorIndex).toBe(3);
  });

  it('another device picking the same name gets the same profile back', () => {
    let { store } = profileKeyFor(emptyProfileStore(), 'old-device');
    store = claimProfile(store, 'old-device', 'Erik');
    store = setProfileColor(store, 'name:Erik', 4);
    store = recordRoundFor(store, 'name:Erik', round);
    store = claimProfile(store, 'new-device', 'Erik');
    const { key } = profileKeyFor(store, 'new-device');
    const profile = clientProfile(store, key);
    expect(profile.colorIndex).toBe(4);
    expect(profile.stats.lifetimeTotals.roundsPlayed).toBe(1);
  });

  it('choosing no name goes back to the anonymous profile', () => {
    let store = claimProfile(emptyProfileStore(), 'dev-1', 'Erik');
    store = claimProfile(store, 'dev-1', null);
    expect(profileKeyFor(store, 'dev-1').key).toBe('device:dev-1');
  });

  it('a round lands in that profile only', () => {
    let store = claimProfile(emptyProfileStore(), 'a', 'Erik');
    store = claimProfile(store, 'b', 'Gast');
    store = recordRoundFor(store, 'name:Erik', round);
    expect(
      clientProfile(store, 'name:Erik').stats.lifetimeTotals.kubbsFelled,
    ).toBe(2);
    expect(
      clientProfile(store, 'name:Gast').stats.lifetimeTotals.roundsPlayed,
    ).toBe(0);
  });

  it('a match result counts for both, by the opponent name', () => {
    let store = claimProfile(emptyProfileStore(), 'a', 'Erik');
    store = claimProfile(store, 'b', 'Gast');
    store = recordMatchResult(store, 'name:Erik', 'name:Gast');
    store = recordMatchResult(store, 'name:Erik', 'name:Gast');
    store = recordMatchResult(store, 'name:Gast', 'name:Erik');
    expect(clientProfile(store, 'name:Erik').headToHead).toEqual([
      { opponentName: 'Gast', won: 2, lost: 1 },
    ]);
    expect(clientProfile(store, 'name:Gast').headToHead).toEqual([
      { opponentName: 'Erik', won: 1, lost: 2 },
    ]);
  });

  it('colour indices are clamped to the presence range', () => {
    const { store, key } = profileKeyFor(emptyProfileStore(), 'd');
    expect(clientProfile(setProfileColor(store, key, 99), key).colorIndex).toBe(
      15,
    );
  });

  it('a corrupt or foreign file starts a fresh store, never throws', () => {
    expect(parseProfileStore('{nope')).toEqual(emptyProfileStore());
    expect(parseProfileStore(JSON.stringify({ version: 99 }))).toEqual(
      emptyProfileStore(),
    );
    let store = claimProfile(emptyProfileStore(), 'a', 'Erik');
    store = recordRoundFor(store, 'name:Erik', round);
    expect(parseProfileStore(JSON.stringify(store))).toEqual(store);
  });
});

describe('results against the bot (2026-11-01)', () => {
  it('counts wins and losses per level in the person’s profile', () => {
    let store = claimProfile(emptyProfileStore(), 'dev-1', 'Kalle');
    const key = profileKeyFor(store, 'dev-1').key;
    store = recordBotResult(store, key, 'hard', false);
    store = recordBotResult(store, key, 'hard', true);
    store = recordBotResult(store, key, 'easy', true);
    expect(clientProfile(store, key).botRecord).toEqual({
      hard: { won: 1, lost: 1 },
      easy: { won: 1, lost: 0 },
    });
    expect(clientProfile(store, key).headToHead).toEqual([]);
  });

  it('a profile saved before the bot record existed still loads', () => {
    const old = {
      version: 1,
      profiles: {
        'name:Kalle': {
          name: 'Kalle',
          colorIndex: 2,
          stats: clientProfile(emptyProfileStore(), 'x').stats,
          headToHead: {},
        },
      },
      devices: { 'dev-1': 'name:Kalle' },
    };
    const store = parseProfileStore(JSON.stringify(old));
    expect(store.profiles['name:Kalle']?.colorIndex).toBe(2);
    expect(clientProfile(store, 'name:Kalle').botRecord).toEqual({});
  });
});
