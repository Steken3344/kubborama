import { describe, expect, it } from 'vitest';
import {
  claimProfile,
  clientProfile,
  emptyProfileStore,
  parseProfileStore,
  profileKeyFor,
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
  it('an unknown device gets an anonymous profile of its own', () => {
    const { store, key } = profileKeyFor(emptyProfileStore(), 'dev-1');
    expect(key).toBe('device:dev-1');
    expect(clientProfile(store, key)).toMatchObject({
      name: null,
      colorIndex: 0,
    });
    expect(profileKeyFor(store, 'dev-1').key).toBe(key); // remembered
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
