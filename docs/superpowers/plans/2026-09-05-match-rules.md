# Match Rules (MP3a) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the 2-headset session into a real kubb match — felled kubbs stay out of play (sin-bin per side) until the match ends, score is `A – B`, felling the king before all opponent kubbs loses, after them wins, and a new match auto-starts 10 s later.

**Architecture:** A pure reducer in `src/core/match.ts` (host-only transitions, guest receives whole states over the existing `matchSync` action) plus a pure `sinBinPlacements()` that both clients evaluate identically. A new thin adapter `MatchRulesSystem` diffs placements on `MatchStateChanged` and applies them physically; existing systems get one-line gates on a shared `matchActivity` flag. Resets are requested over the bus (`ResetRequested`) so the timer, disconnect and the guest's relayed "Ny runda" share one path. Spec: `docs/superpowers/specs/2026-09-05-match-rules-design.md`.

**Tech Stack:** TypeScript strict, IWSDK/elics ECS, zod, vitest, Trystero.

## Global Constraints

- `src/core/*` imports nothing from `@iwsdk/core`, `three`, or Havok (CLAUDE.md functional core).
- All tunables in JSON under `src/data/`, exported via `src/config.ts` — never code literals.
- zod `safeParse` at every network boundary; parse functions never throw.
- No allocation in any `update()`; event handlers may allocate.
- Chat Swedish; code, comments, commits English (conventional commits).
- After every task: `npx tsc --noEmit && npx eslint . && npx prettier --write . && npx vitest run` must be green before committing.
- Register subscription teardowns in `this.cleanupFuncs` (or the system's `destroy()` — follow the file's existing pattern).

---

### Task 1: Pure match reducer v2 (`core/match.ts`)

**Files:**

- Modify: `src/core/match.ts` (full rewrite, keep `kubbSide`/`otherSide`)
- Modify: `src/core/match.test.ts` (full rewrite)

**Interfaces:**

- Consumes: `KUBB_COUNT` from `src/core/court-layout.ts`.
- Produces: `MatchSide`, `MatchEndReason`, `MatchState`, `initialMatchState()`, `otherSide()`, `kubbSide(index, kubbsPerSide?)`, `kubbIndexFromId(id): number | null`, `isFinished(state)`, `withKubbFelled(state, kubbId, kubbsPerSide?)`, `withKingFelled(state, kubbsPerSide?)`, `withTurnAdvanced(state)`, `score(state): { host: number; guest: number }`.

- [ ] **Step 1: Replace the test file**

```ts
// src/core/match.test.ts
import { describe, expect, it } from 'vitest';
import {
  initialMatchState,
  isFinished,
  kubbIndexFromId,
  kubbSide,
  otherSide,
  score,
  withKingFelled,
  withKubbFelled,
  withTurnAdvanced,
} from './match.js';

// kubb-0..4 = guest side (far baseline), kubb-5..9 = host side (near).
const GUEST_KUBBS = ['kubb-0', 'kubb-1', 'kubb-2', 'kubb-3', 'kubb-4'];
const HOST_KUBBS = ['kubb-5', 'kubb-6', 'kubb-7', 'kubb-8', 'kubb-9'];

function afterHostFells(ids: string[]) {
  return ids.reduce((s, id) => withKubbFelled(s, id), initialMatchState());
}

describe('initialMatchState', () => {
  it('starts with the host on turn, nothing felled, no winner', () => {
    expect(initialMatchState()).toEqual({
      currentTurn: 'host',
      felledKubbIds: { host: [], guest: [] },
      winner: null,
      endReason: null,
    });
  });
});

describe('otherSide / kubbSide / kubbIndexFromId', () => {
  it('flips sides', () => {
    expect(otherSide('host')).toBe('guest');
    expect(otherSide('guest')).toBe('host');
  });
  it('maps low indices to guest, high to host, out of range to null', () => {
    expect(kubbSide(0, 5)).toBe('guest');
    expect(kubbSide(4, 5)).toBe('guest');
    expect(kubbSide(5, 5)).toBe('host');
    expect(kubbSide(9, 5)).toBe('host');
    expect(kubbSide(10, 5)).toBeNull();
  });
  it('parses scene ids and rejects anything else', () => {
    expect(kubbIndexFromId('kubb-7')).toBe(7);
    expect(kubbIndexFromId('king')).toBeNull();
    expect(kubbIndexFromId('stick-1')).toBeNull();
    expect(kubbIndexFromId('kubb-x')).toBeNull();
  });
});

describe('withKubbFelled', () => {
  it('records an opponent kubb on its side, in felling order', () => {
    const s = afterHostFells(['kubb-2', 'kubb-0']);
    expect(s.felledKubbIds.guest).toEqual(['kubb-2', 'kubb-0']);
    expect(s.felledKubbIds.host).toEqual([]);
    expect(s.winner).toBeNull();
  });
  it('ignores a duplicate id', () => {
    const s = afterHostFells(['kubb-2', 'kubb-2']);
    expect(s.felledKubbIds.guest).toEqual(['kubb-2']);
  });
  it("ignores the thrower's own-side kubb (ricochet)", () => {
    const s = withKubbFelled(initialMatchState(), 'kubb-7');
    expect(s).toEqual(initialMatchState());
  });
  it('ignores an id that is not a kubb', () => {
    expect(withKubbFelled(initialMatchState(), 'king')).toEqual(
      initialMatchState(),
    );
  });
  it('never decides the match by kubbs alone', () => {
    const s = afterHostFells(GUEST_KUBBS);
    expect(s.felledKubbIds.guest).toHaveLength(5);
    expect(s.winner).toBeNull();
    expect(isFinished(s)).toBe(false);
  });
  it('is a no-op once finished', () => {
    const finished = withKingFelled(initialMatchState());
    expect(withKubbFelled(finished, 'kubb-1')).toBe(finished);
  });
});

describe('withKingFelled', () => {
  it('king after all opponent kubbs = thrower wins', () => {
    const s = withKingFelled(afterHostFells(GUEST_KUBBS));
    expect(s.winner).toBe('host');
    expect(s.endReason).toBe('allKubbsAndKing');
    expect(isFinished(s)).toBe(true);
  });
  it('king with any opponent kubb standing = thrower loses', () => {
    const s = withKingFelled(afterHostFells(['kubb-0', 'kubb-1']));
    expect(s.winner).toBe('guest');
    expect(s.endReason).toBe('kingFelledEarly');
  });
  it('uses the current turn, not a fixed side', () => {
    let s = withTurnAdvanced(initialMatchState());
    s = HOST_KUBBS.reduce((acc, id) => withKubbFelled(acc, id), s);
    s = withKingFelled(s);
    expect(s.winner).toBe('guest');
    expect(s.endReason).toBe('allKubbsAndKing');
  });
  it('respects kubbsPerSide', () => {
    const s = withKingFelled(afterHostFells(['kubb-0']), 1);
    expect(s.winner).toBe('host');
  });
  it('is a no-op once finished', () => {
    const finished = withKingFelled(initialMatchState());
    expect(withKingFelled(finished)).toBe(finished);
  });
});

describe('withTurnAdvanced / score', () => {
  it('flips the turn and is a no-op once finished', () => {
    expect(withTurnAdvanced(initialMatchState()).currentTurn).toBe('guest');
    const finished = withKingFelled(initialMatchState());
    expect(withTurnAdvanced(finished)).toBe(finished);
  });
  it('scores each side by the OPPONENT kubbs it has felled', () => {
    let s = afterHostFells(['kubb-0', 'kubb-1']);
    s = withTurnAdvanced(s);
    s = withKubbFelled(s, 'kubb-9');
    expect(score(s)).toEqual({ host: 2, guest: 1 });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/core/match.test.ts`
Expected: FAIL — `kubbIndexFromId`, `isFinished`, `score`, `withKingFelled` not exported; `initialMatchState()` shape mismatch.

- [ ] **Step 3: Rewrite `src/core/match.ts`**

```ts
import { KUBB_COUNT } from './court-layout.js';

export type MatchSide = 'host' | 'guest';
export type MatchEndReason = 'allKubbsAndKing' | 'kingFelledEarly';

export interface MatchState {
  currentTurn: MatchSide;
  /** Scene ids (`kubb-N`) of felled kubbs, keyed by the SIDE that owns/
   * defends them, in felling order. `computeCourtLayout()` lays out
   * kubb-0..4 as the far baseline (guest's side, per MP1's
   * mirrorPoseToFarBaseline() decision) and kubb-5..9 as the near
   * baseline (host's side) — see `kubbSide()`. */
  felledKubbIds: { host: string[]; guest: string[] };
  winner: MatchSide | null;
  endReason: MatchEndReason | null;
}

/**
 * MP3a (Erik, 2026-09-05, see docs/superpowers/specs/2026-09-05-match-
 * rules-design.md): a real kubb match. Felled kubbs stay down for the
 * whole match, the score is how many OPPONENT kubbs each side has
 * felled, and the king decides: felled after every opponent kubb is
 * down = the thrower wins; felled while any still stands = the thrower
 * loses. Only the host calls these transitions; the guest receives
 * whole states (core/matchSync.ts). Every transition returns the input
 * object unchanged (same reference) when nothing applies, so callers
 * can skip a broadcast with `===`.
 */
export function initialMatchState(): MatchState {
  return {
    currentTurn: 'host',
    felledKubbIds: { host: [], guest: [] },
    winner: null,
    endReason: null,
  };
}

export function otherSide(side: MatchSide): MatchSide {
  return side === 'host' ? 'guest' : 'host';
}

/** kubb-0..(kubbsPerSide-1) are the far baseline (guest's side);
 * kubb-(kubbsPerSide)..(2*kubbsPerSide-1) the near baseline (host's).
 * `null` for an out-of-range index. */
export function kubbSide(
  kubbIndex: number,
  kubbsPerSide: number = KUBB_COUNT,
): MatchSide | null {
  if (kubbIndex < 0 || kubbIndex >= kubbsPerSide * 2) {
    return null;
  }
  return kubbIndex < kubbsPerSide ? 'guest' : 'host';
}

/** `kubb-7` → 7; anything that isn't a kubb scene id → null. */
export function kubbIndexFromId(kubbId: string): number | null {
  const match = /^kubb-(\d+)$/u.exec(kubbId);
  return match ? Number(match[1]) : null;
}

export function isFinished(state: MatchState): boolean {
  return state.winner !== null;
}

/** Ignored (same reference back): not a kubb id, already felled, or on
 * the THROWER's own side — a ricochet into your own baseline neither
 * scores for the opponent nor goes to the sin-bin; the round-end reset
 * stands it back up, as in real kubb (spec review I2). */
export function withKubbFelled(
  state: MatchState,
  kubbId: string,
  kubbsPerSide: number = KUBB_COUNT,
): MatchState {
  if (isFinished(state)) {
    return state;
  }
  const index = kubbIndexFromId(kubbId);
  const side = index === null ? null : kubbSide(index, kubbsPerSide);
  if (side === null || side === state.currentTurn) {
    return state;
  }
  if (state.felledKubbIds[side].includes(kubbId)) {
    return state;
  }
  return {
    ...state,
    felledKubbIds: {
      ...state.felledKubbIds,
      [side]: [...state.felledKubbIds[side], kubbId],
    },
  };
}

/** The thrower is `currentTurn` (guaranteed today by locomotion being
 * off and sticks living at exactly one rack per turn — see the spec's
 * locked assumptions). */
export function withKingFelled(
  state: MatchState,
  kubbsPerSide: number = KUBB_COUNT,
): MatchState {
  if (isFinished(state)) {
    return state;
  }
  const thrower = state.currentTurn;
  const opponent = otherSide(thrower);
  const opponentCleared = state.felledKubbIds[opponent].length >= kubbsPerSide;
  return {
    ...state,
    winner: opponentCleared ? thrower : opponent,
    endReason: opponentCleared ? 'allKubbsAndKing' : 'kingFelledEarly',
  };
}

export function withTurnAdvanced(state: MatchState): MatchState {
  if (isFinished(state)) {
    return state;
  }
  return { ...state, currentTurn: otherSide(state.currentTurn) };
}

/** Each side's score is how many of the OPPONENT's kubbs it has felled. */
export function score(state: MatchState): { host: number; guest: number } {
  return {
    host: state.felledKubbIds.guest.length,
    guest: state.felledKubbIds.host.length,
  };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/core/match.test.ts`
Expected: PASS (17 tests). `npx tsc --noEmit` will now FAIL in `matchSync.ts`/`multiplayer.ts`/`hud.ts` — expected: the new `MatchState` shape is consumed there and Tasks 3, 5 and 7 update those files. Committing with a red `tsc` is acceptable for Tasks 1-6 (there is no pre-commit hook), but do NOT push until Task 7's verify step reports `tsc` clean — CI runs `typecheck` and would go red.

- [ ] **Step 5: Commit**

```bash
git add src/core/match.ts src/core/match.test.ts
git commit -m "feat(mp3): match reducer v2 — felled-kubb lists, king decides, ricochet ignored"
```

---

### Task 2: Pure sin-bin placements + far-baseline helper + match config

**Files:**

- Modify: `src/core/court-layout.ts` (add `farBaselineZ`)
- Create: `src/core/matchSinBin.ts`, `src/core/matchSinBin.test.ts`
- Create: `src/data/match.json`
- Modify: `src/config.ts` (export `match`)
- Modify: `src/core/court-layout.test.ts` if it exists (add one test) — else put the `farBaselineZ` test in `matchSinBin.test.ts`.

**Interfaces:**

- Consumes: `sinBinSlotPosition(index, kubbHeightM, config)` from `core/sinBin.ts`; `mirrorPoseToFarBaseline(pose, farZ)` from `core/presence.ts`; `kubbIndexFromId`, `kubbSide`, `MatchState` from Task 1.
- Produces: `farBaselineZ(preset: CourtPreset): number`; `SinBinPlacement { kubbId: string; position: Vec3; quaternion: [number, number, number, number] }`; `sinBinPlacements(state, opts: { sinBin: SinBinConfig; kubbHeightM: number; farZ: number; kubbsPerSide?: number }): SinBinPlacement[]`; `match.kingDecisionGraceS`, `match.restartDelayS` from `src/config.ts`.

- [ ] **Step 1: Write the failing tests**

```ts
// src/core/matchSinBin.test.ts
import { describe, expect, it } from 'vitest';
import { farBaselineZ } from './court-layout.js';
import {
  initialMatchState,
  withKubbFelled,
  withTurnAdvanced,
} from './match.js';
import { sinBinPlacements } from './matchSinBin.js';
import { sinBinSlotPosition } from './sinBin.js';

const OPTS = {
  sinBin: { xM: 3.3, startZM: -0.3, spacingM: 0.14 },
  kubbHeightM: 0.15,
  farZ: -6,
};

describe('farBaselineZ', () => {
  it('is minus the court length for every preset', () => {
    expect(farBaselineZ({ widthM: 3, lengthM: 6 })).toBe(-6);
    expect(farBaselineZ({ widthM: 5, lengthM: 8 })).toBe(-8);
    expect(farBaselineZ({ widthM: 2, lengthM: 5 })).toBe(-5);
  });
});

describe('sinBinPlacements', () => {
  it('is empty for a fresh match', () => {
    expect(sinBinPlacements(initialMatchState(), OPTS)).toEqual([]);
  });

  it('places guest-side kubbs (felled by the host) on the mirrored far row, slot = list index', () => {
    let s = withKubbFelled(initialMatchState(), 'kubb-3');
    s = withKubbFelled(s, 'kubb-0');
    const placements = sinBinPlacements(s, OPTS);
    expect(placements.map((p) => p.kubbId)).toEqual(['kubb-3', 'kubb-0']);
    const [slot0, slot1] = placements;
    // Host-side slot 0 would be (3.3, 0.075, -0.3); mirrored: x flips,
    // z = farZ - z.
    expect(slot0?.position[0]).toBeCloseTo(-3.3);
    expect(slot0?.position[1]).toBeCloseTo(0.075);
    expect(slot0?.position[2]).toBeCloseTo(-6 - -0.3);
    expect(slot1?.position[2]).toBeCloseTo(-6 - (-0.3 - 0.14));
    // 180° yaw of the identity quaternion.
    expect(slot0?.quaternion).toEqual([0, 1, -0, -0]);
  });

  it('places host-side kubbs (felled by the guest) on the near row, upright', () => {
    let s = withTurnAdvanced(initialMatchState());
    s = withKubbFelled(s, 'kubb-9');
    const [p] = sinBinPlacements(s, OPTS);
    expect(p?.kubbId).toBe('kubb-9');
    expect(p?.position).toEqual(sinBinSlotPosition(0, 0.15, OPTS.sinBin));
    expect(p?.quaternion).toEqual([0, 0, 0, 1]);
  });

  it('derives slots from list position, so a 3-id first snapshot yields slots 0,1,2', () => {
    const s = {
      ...initialMatchState(),
      felledKubbIds: { host: [], guest: ['kubb-1', 'kubb-4', 'kubb-2'] },
    };
    const zs = sinBinPlacements(s, OPTS).map((p) => p.position[2]);
    expect(zs[1]! - zs[0]!).toBeCloseTo(0.14);
    expect(zs[2]! - zs[1]!).toBeCloseTo(0.14);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/core/matchSinBin.test.ts`
Expected: FAIL — cannot resolve `./matchSinBin.js`; `farBaselineZ` not exported.

- [ ] **Step 3: Add `farBaselineZ` to `src/core/court-layout.ts`** (after `KUBB_COUNT`)

```ts
/** The far baseline's z — the player origin is the near baseline at
 * z=0 facing -Z (see computeCourtLayout). Shared by everything that
 * mirrors to the far end (player teleport, second stick rack, guest
 * sin-bin row) so no system hardcodes the default preset's length
 * (spec review I5: Advanced uses the 8 m tournament court). */
export function farBaselineZ(preset: CourtPreset): number {
  return -preset.lengthM;
}
```

- [ ] **Step 4: Create `src/core/matchSinBin.ts`**

```ts
import type { MatchState } from './match.js';
import { kubbIndexFromId, kubbSide } from './match.js';
import { mirrorPoseToFarBaseline } from './presence.js';
import { sinBinSlotPosition } from './sinBin.js';
import type { SinBinConfig } from './sinBin.js';
import type { Vec3 } from './vec3.js';

export interface SinBinPlacement {
  kubbId: string;
  position: Vec3;
  quaternion: [number, number, number, number];
}

export interface SinBinPlacementOptions {
  sinBin: SinBinConfig;
  kubbHeightM: number;
  /** farBaselineZ(activePreset) — the guest row is the host row
   * mirrored to the far end. */
  farZ: number;
  kubbsPerSide?: number;
}

const IDENTITY: [number, number, number, number] = [0, 0, 0, 1];

/**
 * Where every felled kubb in `state` sits, derived from the state alone:
 * slot = its index in its side's `felledKubbIds` list (never a counter —
 * a late-joining guest's first snapshot can carry several ids at once,
 * spec review I7). Host-side kubbs (kubb-5..9) use the authored sin-bin
 * row beside the near baseline; guest-side kubbs use the same row
 * mirrored to the far baseline with the one transform every far-end
 * placement shares. Both clients evaluate this from identical state, so
 * they agree without any extra message.
 */
export function sinBinPlacements(
  state: MatchState,
  opts: SinBinPlacementOptions,
): SinBinPlacement[] {
  const placements: SinBinPlacement[] = [];
  for (const side of ['guest', 'host'] as const) {
    state.felledKubbIds[side].forEach((kubbId, slot) => {
      const index = kubbIndexFromId(kubbId);
      if (index === null || kubbSide(index, opts.kubbsPerSide) !== side) {
        return;
      }
      const near = {
        position: sinBinSlotPosition(slot, opts.kubbHeightM, opts.sinBin),
        quaternion: IDENTITY,
      };
      const pose =
        side === 'host' ? near : mirrorPoseToFarBaseline(near, opts.farZ);
      placements.push({
        kubbId,
        position: pose.position,
        quaternion: pose.quaternion,
      });
    });
  }
  return placements;
}
```

Check `mirrorPoseToFarBaseline`'s parameter type in `src/core/presence.ts`: it takes a `Pose` (`{ position: Vec3; quaternion: [n,n,n,n] }`) — the `near` literal above matches it. If `Pose.position` is typed as a mutable tuple and `sinBinSlotPosition` returns `Vec3` from `core/vec3.ts`, they are the same alias; if `tsc` complains, spread into a fresh tuple.

- [ ] **Step 5: Add the config**

```json
// src/data/match.json
{
  "kingDecisionGraceS": 1.5,
  "restartDelayS": 10
}
```

In `src/config.ts`, after the `multiplayerData` import add
`import matchData from './data/match.json' with { type: 'json' };`
and after `export const multiplayer = multiplayerData;` add
`export const match = matchData;`.

- [ ] **Step 6: Run to verify it passes**

Run: `npx vitest run src/core/matchSinBin.test.ts`
Expected: PASS (5 tests). If the quaternion assertion fails on `-0` vs `0`, change the expectation to `toEqual([0, 1, expect.closeTo(0), expect.closeTo(0)])` — the sign of zero is not the point.

- [ ] **Step 7: Commit**

```bash
git add src/core/court-layout.ts src/core/matchSinBin.ts src/core/matchSinBin.test.ts src/data/match.json src/config.ts
git commit -m "feat(mp3): pure sin-bin placements, farBaselineZ, match config"
```

---

### Task 3: Wire format — matchSync v2, reset relay, version peek

**Files:**

- Modify: `src/core/matchSync.ts`, `src/core/matchSync.test.ts`
- Create: `src/core/resetRelay.ts`, `src/core/resetRelay.test.ts`

**Interfaces:**

- Produces: `MATCH_SYNC_SCHEMA_VERSION = 2`; `buildMatchSyncMessage(state)`; `parseMatchSyncMessage(data)`; `peekSchemaVersion(data): number | null`; `RESET_RELAY_SCHEMA_VERSION = 1`; `ResetRequestMessage`; `buildResetRequest()`; `parseResetRequest(data)`.

- [ ] **Step 1: Rewrite `src/core/matchSync.test.ts`**

```ts
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
```

- [ ] **Step 2: Write `src/core/resetRelay.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import {
  buildResetRequest,
  parseResetRequest,
  RESET_RELAY_SCHEMA_VERSION,
} from './resetRelay.js';

describe('resetRelay', () => {
  it('round-trips', () => {
    const m = buildResetRequest();
    expect(m.version).toBe(RESET_RELAY_SCHEMA_VERSION);
    expect(parseResetRequest(m)).toEqual(m);
  });
  it('rejects garbage and a wrong version', () => {
    expect(parseResetRequest(null)).toBeNull();
    expect(parseResetRequest({})).toBeNull();
    expect(parseResetRequest({ version: 99 })).toBeNull();
  });
});
```

- [ ] **Step 3: Run both to verify they fail**

Run: `npx vitest run src/core/matchSync.test.ts src/core/resetRelay.test.ts`
Expected: FAIL (version 1, missing exports, missing module).

- [ ] **Step 4: Rewrite `src/core/matchSync.ts`**

```ts
import { z } from 'zod';
import type { MatchState } from './match.js';

/**
 * MP2 phase 3 / MP3a: the host is authoritative for match state (same
 * "först in äger spelet" model as core/pieceSync.ts), broadcast
 * event-driven rather than at ~20 Hz. Network messages are an untrusted
 * boundary (CLAUDE.md): malformed data is dropped, never trusted.
 *
 * v2 (MP3a, 2026-09-05): per-side felled-kubb id lists replace the two
 * remaining-counters, `endReason` added. v1 is rejected; with the PWA's
 * autoUpdate one headset can briefly run the old build until it
 * reloads, so the receiver logs a distinct version-mismatch warning
 * (see peekSchemaVersion) instead of a generic "malformed".
 */
export const MATCH_SYNC_SCHEMA_VERSION = 2;

const matchSideSchema = z.enum(['host', 'guest']);

const matchStateSchema = z.object({
  currentTurn: matchSideSchema,
  felledKubbIds: z.object({
    host: z.array(z.string()),
    guest: z.array(z.string()),
  }),
  winner: matchSideSchema.nullable(),
  endReason: z.enum(['allKubbsAndKing', 'kingFelledEarly']).nullable(),
});

const matchSyncMessageSchema = z.object({
  version: z.literal(MATCH_SYNC_SCHEMA_VERSION),
  state: matchStateSchema,
});
export type MatchSyncMessage = z.infer<typeof matchSyncMessageSchema>;

export function buildMatchSyncMessage(state: MatchState): MatchSyncMessage {
  return { version: MATCH_SYNC_SCHEMA_VERSION, state };
}

/** Never throws — see core/presence.ts's parsePresenceMessage for the
 * same untrusted-network-boundary rationale. */
export function parseMatchSyncMessage(data: unknown): MatchSyncMessage | null {
  const result = matchSyncMessageSchema.safeParse(data);
  return result.success ? result.data : null;
}

const versionOnlySchema = z.object({ version: z.number() });

/** The `version` of an otherwise-unvalidated message, for a targeted
 * "schema mismatch" log — null when there is no numeric version. */
export function peekSchemaVersion(data: unknown): number | null {
  const result = versionOnlySchema.safeParse(data);
  return result.success ? result.data.version : null;
}
```

- [ ] **Step 5: Create `src/core/resetRelay.ts`**

```ts
import { z } from 'zod';

/**
 * MP3a (spec review C2): the GUEST's "Ny runda" must abort the match
 * too, but only the host is authoritative — so the guest's local
 * Reset{manual} is relayed to the host as this message, and the host
 * performs the real reset (which it then broadcasts as fresh match
 * state). Carries nothing but a version: the request IS the payload.
 */
export const RESET_RELAY_SCHEMA_VERSION = 1;

const resetRequestSchema = z.object({
  version: z.literal(RESET_RELAY_SCHEMA_VERSION),
});
export type ResetRequestMessage = z.infer<typeof resetRequestSchema>;

export function buildResetRequest(): ResetRequestMessage {
  return { version: RESET_RELAY_SCHEMA_VERSION };
}

/** Never throws — same boundary rule as every other message type. */
export function parseResetRequest(data: unknown): ResetRequestMessage | null {
  const result = resetRequestSchema.safeParse(data);
  return result.success ? result.data : null;
}
```

- [ ] **Step 6: Run to verify they pass**

Run: `npx vitest run src/core/`
Expected: all core tests PASS. `npx tsc --noEmit` still fails in `multiplayer.ts`/`hud.ts` (old `hostKubbsRemaining` uses) — fixed in Tasks 5 and 7.

- [ ] **Step 7: Commit**

```bash
git add src/core/matchSync.ts src/core/matchSync.test.ts src/core/resetRelay.ts src/core/resetRelay.test.ts
git commit -m "feat(mp3): matchSync v2 wire format, reset relay message, version peek"
```

---

### Task 4: Bus + shared flag + gates in Topple/SimpleRules/Menu

**Files:**

- Modify: `src/core/events.ts` (add `ResetRequested`)
- Create: `src/matchActivityState.ts`
- Create: `src/systems/activeCourt.ts`
- Modify: `src/systems/topple.ts:43-51` (exclude `OutOfPlay`)
- Modify: `src/systems/simpleRules.ts` (three early returns)
- Modify: `src/systems/menu.ts` (query, resetAll, ResetRequested, game-mode lock)
- Modify: `src/data/i18n/sv.json`, `src/data/i18n/en.json` (`lockedDuringMatch`)

**Interfaces:**

- Produces: `GameEvents['ResetRequested']` (`Record<string, never>`); `matchActivity.current.active: boolean`; `activeFarBaselineZ(): number` (from `src/systems/activeCourt.ts`).

- [ ] **Step 1: Add the event** — in `src/core/events.ts`, after the `MultiplayerPeerDisconnected` entry:

```ts
/** MP3a: "please perform a full manual reset" — emitted by
 * MatchRulesSystem (auto-restart timer, room emptied) and by
 * MultiplayerSystem (a guest's relayed "Ny runda"); handled by
 * MenuSystem, the one owner of resetAll(). Keeps the reset trigger on
 * the bus instead of three systems calling into MenuSystem. */
ResetRequested: Record<string, never>;
```

- [ ] **Step 2: Create `src/matchActivityState.ts`**

```ts
/** Shared "a multiplayer match is in progress" flag — same module-state
 * pattern as settingsState.ts. Written ONLY by MatchRulesSystem (true on
 * the first MatchStateChanged, false on MultiplayerPeerDisconnected);
 * read by MenuSystem (which pieces a round-end reset may move, game-mode
 * button lock) and SimpleRulesSystem (solo-only rules switch off). It
 * only ever flips at connect/disconnect, so it is stable through the
 * whole synchronous round-end cascade. */
export const matchActivity: { current: { active: boolean } } = {
  current: { active: false },
};
```

- [ ] **Step 3: Create `src/systems/activeCourt.ts`**

```ts
import { courtPresetForMode, getCourtPreset } from '../config.js';
import { farBaselineZ } from '../core/court-layout.js';
import { settingsState } from '../settingsState.js';

/** The far baseline of the court the ACTIVE game mode uses — not the
 * default preset (spec review I5: Advanced plays on the 8 m tournament
 * court; a 6 m constant would put mirrored placements inside it). Read
 * at call time, so a mode switch is picked up by the next placement. */
export function activeFarBaselineZ(): number {
  return farBaselineZ(
    getCourtPreset(courtPresetForMode(settingsState.current.gameMode)),
  );
}
```

- [ ] **Step 4: ToppleSystem excludes `OutOfPlay`** — in `src/systems/topple.ts` add `import { OutOfPlay } from '../components/out-of-play.js';` and change the query to:

```ts
    // KingProtected: Simple mode's rule that the king can't be felled
    // until every kubb is down (SimpleRulesSystem owns the tag) — the
    // king simply never enters this query while it's present, so no
    // rest/angle tracking exists for it to fire early on.
    // OutOfPlay (MP3a): a kubb already in the sin-bin must not re-emit
    // KubbFelled if a stray stick knocks it over — felledReported is
    // cleared on every Reset, so the tag is the guard that survives a
    // round end (the match reducer's duplicate check is the second one).
    excluded: [StickState, KingProtected, OutOfPlay],
```

- [ ] **Step 5: Gate SimpleRulesSystem** — in `src/systems/simpleRules.ts` add `import { matchActivity } from '../matchActivityState.js';` and as the FIRST line of `onKubbFelled`, `onReset` and `applyKingProtection`:

```ts
if (matchActivity.current.active) {
  return; // MP3a: MatchRulesSystem owns sin-bin/king during a match
}
```

Also update the class doc comment's first paragraph with one sentence: "While a multiplayer match is active (matchActivityState.ts) this system stands down entirely — MatchRulesSystem owns the sin-bin and the king; the disconnect path ends with a manual Reset, which is when protection is re-derived for solo play."

- [ ] **Step 6: MenuSystem** — in `src/systems/menu.ts`:

Imports: add `import { OutOfPlay } from '../components/out-of-play.js';` and `import { matchActivity } from '../matchActivityState.js';`.

Queries:

```ts
export class MenuSystem extends createSystem({
  resettable: { required: [Resettable] },
  // MP3a: during a match a ROUND-end reset must leave sin-binned kubbs
  // where they are; only a manual reset (abort / auto-restart) moves
  // everything. Two queries, picked by cause — not an if in the loop.
  resettableInPlay: { required: [Resettable], excluded: [OutOfPlay] },
}) {
```

Subscriptions (inside the existing `this.cleanupFuncs.push(` block that already has `RoundEnded` and `LanguageChanged`):

```ts
      gameEvents.on('ResetRequested', () => {
        this.resetAll('manual');
      }),
```

Game-mode button handler:

```ts
this.wireButton('game-mode-button', () => {
  if (matchActivity.current.active) {
    return; // MP3a: a court relayout mid-match is undefined; locked
  }
  this.settingsSystem.toggleGameMode();
  this.refreshLabels();
});
```

In `refreshLabels()`, the game-mode label (around line 252) becomes:

```ts
this.menuPanel.requireElementById('game-mode-button-label').setProperties({
  text:
    (s.gameMode === 'simple'
      ? t('gameModeNameSimple')
      : t('gameModeNameAdvanced')) +
    (matchActivity.current.active ? t('lockedDuringMatch') : ''),
});
```

(Keep whatever the existing call passes besides `text` — if it currently passes only `text`, this replaces it 1:1.)

`resetAll`:

```ts
  private resetAll(cause: GameEvents['Reset']['cause']): void {
    const query =
      cause === 'roundEnd' && matchActivity.current.active
        ? this.queries.resettableInPlay
        : this.queries.resettable;
    for (const entity of query.entities) {
      this.resetOne(entity);
    }
    gameEvents.emit('Reset', { timeS: this.currentTimeS, cause });
    log('info', 'state', 'reset', { cause });
  }
```

- [ ] **Step 7: i18n** — add to both files (keep alphabetical-ish placement near the `match*` keys):

`sv.json`: `"lockedDuringMatch": " (låst under match)"` — `en.json`: `"lockedDuringMatch": " (locked during match)"`.

- [ ] **Step 8: Verify** — `npx tsc --noEmit` (still red only in `multiplayer.ts`/`hud.ts`), `npx eslint src/systems/topple.ts src/systems/simpleRules.ts src/systems/menu.ts src/matchActivityState.ts src/systems/activeCourt.ts src/core/events.ts`, `npx vitest run`. Expected: eslint clean, vitest green.

- [ ] **Step 9: Commit**

```bash
git add src/core/events.ts src/matchActivityState.ts src/systems/activeCourt.ts src/systems/topple.ts src/systems/simpleRules.ts src/systems/menu.ts src/data/i18n/sv.json src/data/i18n/en.json
git commit -m "feat(mp3): ResetRequested event, match-activity flag, solo-rule gates, round-end reset skips sin-bin"
```

---

### Task 5: MultiplayerSystem — reducer v2, king grace, reset relay, active far Z

**Files:**

- Modify: `src/systems/multiplayer.ts`

**Interfaces:**

- Consumes: Task 1 (`withKubbFelled(state, pieceId)`, `withKingFelled`, `isFinished`), Task 3 (`peekSchemaVersion`, `buildResetRequest`, `parseResetRequest`, `ResetRequestMessage`), Task 4 (`activeFarBaselineZ`, `ResetRequested`), `match` from `src/config.ts`.
- Produces: `resetRequest` Trystero action; emits `ResetRequested` on the host when a guest relays.

- [ ] **Step 1: Imports** — replace
      `import { defaultCourtPreset, getCourtPreset, multiplayer } from '../config.js';`
      with `import { match, multiplayer } from '../config.js';`, add
      `import { activeFarBaselineZ } from './activeCourt.js';`,
      `import { buildResetRequest, parseResetRequest } from '../core/resetRelay.js';`,
      `import type { ResetRequestMessage } from '../core/resetRelay.js';`,
      change the match import to `import { initialMatchState, isFinished, withKingFelled, withKubbFelled, withTurnAdvanced } from '../core/match.js';` (drop `kubbSide`), and add `peekSchemaVersion` to the matchSync import. Delete the `FAR_Z` constant and its comment block (lines ~71-77) — replace the two uses (`maybeRepositionAsGuest`, `moveSticksToFarRack`) with `activeFarBaselineZ()`.

- [ ] **Step 2: Fields** — add:

```ts
  private resetRequestAction?: MessageAction<ResetRequestMessage>;
  /** MP3a: KingFelled is applied after `match.kingDecisionGraceS`, not
   * immediately — ToppleSystem emits per piece in rest order, so a kubb
   * toppled by the same stick must get counted first (spec review I1).
   * null = no decision pending. */
  private kingFelledAtS: number | null = null;
  private nowS = 0;
```

- [ ] **Step 3: `update`** — change the signature to `update(delta: number, time: number): void {` and add at the top:

```ts
this.nowS = time;
if (
  this.kingFelledAtS !== null &&
  time - this.kingFelledAtS >= match.kingDecisionGraceS
) {
  this.kingFelledAtS = null;
  const next = withKingFelled(this.matchState);
  if (next !== this.matchState) {
    log('info', 'state', 'match decided by the king', {
      winner: next.winner,
      endReason: next.endReason,
    });
    this.setMatchState(next);
    this.broadcastMatchState();
  }
}
```

- [ ] **Step 4: Subscriptions** — in the `cleanupFuncs.push(` block add after the `KubbFelled` handler:

```ts
      gameEvents.on('KingFelled', () => {
        if (!this.isHostNow() || !this.hasMultiplayerPeer()) {
          return;
        }
        if (this.kingFelledAtS === null && !isFinished(this.matchState)) {
          this.kingFelledAtS = this.nowS;
        }
      }),
```

- [ ] **Step 5: `onKubbFelledForMatch`** — replace the body:

```ts
  private onKubbFelledForMatch(entityId: string): void {
    if (!this.isHostNow() || !this.hasMultiplayerPeer()) {
      return;
    }
    const pieceId = this.entityIndexToPieceId.get(Number(entityId));
    if (!pieceId) {
      return;
    }
    // The reducer ignores non-kubb ids, duplicates and own-side
    // ricochets by returning the same reference — nothing to broadcast.
    const nextState = withKubbFelled(this.matchState, pieceId);
    if (nextState === this.matchState) {
      return;
    }
    this.setMatchState(nextState);
    this.broadcastMatchState();
  }
```

- [ ] **Step 6: Reset relay** — in `init()`, after the `matchSyncAction` wiring:

```ts
this.resetRequestAction =
  this.room.makeAction<ResetRequestMessage>('resetRequest');
this.resetRequestAction.onMessage = (data, { peerId }) => {
  // A guest's "Ny runda" (spec review C2). Only the host acts, and
  // only for a peer that is actually in the room.
  if (!this.isHostNow() || !(peerId in (this.room?.getPeers() ?? {}))) {
    return;
  }
  if (!parseResetRequest(data)) {
    log('warn', 'net', 'dropped malformed reset request', { peerId });
    return;
  }
  log('info', 'net', 'guest requested a reset', { peerId });
  gameEvents.emit('ResetRequested', {});
};
```

And in `onResetForMatch`, change the `'manual'` branch:

```ts
if (!this.hasMultiplayerPeer()) {
  return;
}
if (!this.isHostNow()) {
  // Guest pressed "Ny runda": not authoritative — relay it. The
  // host's resulting reset + fresh match state overwrite the guest's
  // local teleport via pieceSync/matchSync within a tick.
  void this.resetRequestAction?.send(buildResetRequest());
  return;
}
this.kingFelledAtS = null;
this.setMatchState(initialMatchState());
this.broadcastMatchState();
```

- [ ] **Step 7: Version-mismatch log** — in `matchSyncAction.onMessage`, replace the malformed-warn:

```ts
if (!message) {
  const version = peekSchemaVersion(data);
  if (version !== null && version !== MATCH_SYNC_SCHEMA_VERSION) {
    log('warn', 'net', 'match-sync schema version mismatch', {
      peerId,
      theirs: version,
      ours: MATCH_SYNC_SCHEMA_VERSION,
    });
  } else {
    log('warn', 'net', 'dropped malformed match-sync message', {
      peerId,
    });
  }
  return;
}
```

(add `MATCH_SYNC_SCHEMA_VERSION` to the matchSync import.)

- [ ] **Step 8: Disconnect** — in the room-empty block of `onPeerLeave`, add `this.kingFelledAtS = null;` next to the pending-buffer clears.

- [ ] **Step 9: Doc comment** — replace the class doc's "MP2 phase 3" and "NOT enforced" paragraphs' win-condition sentences with: "MP3a (2026-09-05): a real match — see core/match.ts and systems/matchRules.ts. The king decides (after a grace, see kingFelledAtS); KingProtected is not used in a match." Keep the rest.

- [ ] **Step 10: Verify** — `npx tsc --noEmit` should now fail ONLY in `src/systems/hud.ts`. `npx eslint src/systems/multiplayer.ts` clean.

- [ ] **Step 11: Commit**

```bash
git add src/systems/multiplayer.ts
git commit -m "feat(mp3): host applies king rule after a grace, relays guest resets, uses active court length"
```

---

### Task 6: MatchRulesSystem + registration

**Files:**

- Create: `src/systems/matchRules.ts`
- Modify: `src/index.ts` (register after `MultiplayerSystem`)

**Interfaces:**

- Consumes: Task 2 (`sinBinPlacements`, `SinBinPlacement`), Task 4 (`matchActivity`, `activeFarBaselineZ`, `ResetRequested`), `match`/`pieces`/`sinBin` from config, `KingPiece`/`KingProtected`/`OutOfPlay` components, `KUBB_COUNT`.

- [ ] **Step 1: Create the system**

```ts
import { createSystem, PhysicsSystem } from '@iwsdk/core';
import type { Entity } from '@iwsdk/core';
import { KingPiece } from '../components/king-piece.js';
import { KingProtected } from '../components/king-protected.js';
import { OutOfPlay } from '../components/out-of-play.js';
import { match, pieces, sinBin } from '../config.js';
import { KUBB_COUNT } from '../core/court-layout.js';
import { gameEvents } from '../core/events.js';
import type { GameEvents } from '../core/events.js';
import { isFinished } from '../core/match.js';
import { sinBinPlacements } from '../core/matchSinBin.js';
import type { SinBinPlacement } from '../core/matchSinBin.js';
import { log } from '../core/log.js';
import { matchActivity } from '../matchActivityState.js';
import { activeFarBaselineZ } from './activeCourt.js';

/**
 * MP3a (Erik, 2026-09-05 — docs/superpowers/specs/2026-09-05-match-
 * rules-design.md): the physical side of a multiplayer match. Purely
 * event-driven off the bus, never off the network:
 *
 * - MatchStateChanged: on the first one, switch the shared
 *   matchActivity flag on and strip KingProtected from the king (in the
 *   default Simple mode it is already present from solo play and
 *   nothing else would ever remove it — the match could never be won,
 *   spec review C1). Then diff `sinBinPlacements(state)` against the
 *   placements last applied: added → teleport + OutOfPlay; removed →
 *   drop OutOfPlay (positions come from MenuSystem's teleport on the
 *   host and pieceSync on the guest). Runs identically on BOTH clients
 *   from the same state, so no extra message is needed. On the host, a
 *   finished match starts the auto-restart countdown (idempotent — the
 *   reducer re-emits the same finished state on every round end).
 * - MultiplayerPeerDisconnected: flag off, forget placements, cancel the
 *   countdown, then ask for a full reset so the ex-player is not left
 *   with kubbs in the sin-bin, ToppleSystem's felledReported still set,
 *   and a stale king tag (spec review I3).
 *
 * Why OutOfPlay matters on the GUEST too: its own RoundSystem ends
 * rounds after six local throws and its MenuSystem then runs
 * resetAll('roundEnd') — without the tag that reset would visibly yank
 * the sin-bin kubbs home until the next pieceSync (spec review I4).
 */
export class MatchRulesSystem extends createSystem({
  king: { required: [KingPiece] },
}) {
  private physicsSystem!: PhysicsSystem;
  private kubbEntities = new Map<string, Entity>();
  private applied: SinBinPlacement[] = [];
  /** Seconds left until the auto-restart; null = not counting. */
  private restartInS: number | null = null;

  init(): void {
    const physicsSystem = this.world.getSystem(PhysicsSystem);
    if (!physicsSystem) {
      throw new Error(
        'MatchRulesSystem requires PhysicsSystem — enable the "physics" world feature in iwsdk.config.json',
      );
    }
    this.physicsSystem = physicsSystem;
    for (let i = 0; i < KUBB_COUNT * 2; i++) {
      const id = `kubb-${i}`;
      this.kubbEntities.set(id, this.world.requireSceneEntity(id));
    }
    this.cleanupFuncs.push(
      gameEvents.on('MatchStateChanged', (event) => {
        this.onMatchStateChanged(event);
      }),
      gameEvents.on('MultiplayerPeerDisconnected', () => {
        this.onPeerDisconnected();
      }),
    );
  }

  update(delta: number): void {
    if (this.restartInS === null) {
      return;
    }
    this.restartInS -= delta;
    if (this.restartInS > 0) {
      return;
    }
    this.restartInS = null;
    log('info', 'state', 'match auto-restart', {});
    gameEvents.emit('ResetRequested', {});
  }

  private onMatchStateChanged(event: GameEvents['MatchStateChanged']): void {
    if (!matchActivity.current.active) {
      matchActivity.current.active = true;
      this.unprotectKing();
      log('info', 'state', 'match rules active', {});
    }
    const next = sinBinPlacements(event.state, {
      sinBin,
      kubbHeightM: pieces.kubb.heightM,
      farZ: activeFarBaselineZ(),
    });
    const nextIds = new Set(next.map((p) => p.kubbId));
    const appliedIds = new Set(this.applied.map((p) => p.kubbId));
    for (const placement of next) {
      if (appliedIds.has(placement.kubbId)) {
        continue;
      }
      const entity = this.kubbEntities.get(placement.kubbId);
      if (!entity) {
        continue;
      }
      this.physicsSystem.setBodyTransform(entity, {
        position: placement.position,
        quaternion: placement.quaternion,
      });
      if (!entity.hasComponent(OutOfPlay)) {
        entity.addComponent(OutOfPlay);
      }
    }
    for (const placement of this.applied) {
      if (nextIds.has(placement.kubbId)) {
        continue;
      }
      const entity = this.kubbEntities.get(placement.kubbId);
      if (entity?.hasComponent(OutOfPlay)) {
        entity.removeComponent(OutOfPlay);
      }
    }
    this.applied = next;

    if (isFinished(event.state)) {
      if (event.mySide === 'host' && this.restartInS === null) {
        this.restartInS = match.restartDelayS;
      }
    } else {
      this.restartInS = null;
    }
  }

  private onPeerDisconnected(): void {
    matchActivity.current.active = false;
    this.applied = [];
    this.restartInS = null;
    log('info', 'state', 'match rules inactive — room empty', {});
    gameEvents.emit('ResetRequested', {});
  }

  private unprotectKing(): void {
    for (const king of this.queries.king.entities) {
      if (king.hasComponent(KingProtected)) {
        king.removeComponent(KingProtected);
      }
    }
  }
}
```

- [ ] **Step 2: Register** — in `src/index.ts` add the import next to the `MultiplayerSystem` import and, after `world.registerSystem(MultiplayerSystem);`:

```ts
// MP3a: physical side of a multiplayer match (sin-bin per side, king
// unprotected, auto-restart). Event-driven only — order irrelevant.
world.registerSystem(MatchRulesSystem);
```

- [ ] **Step 3: Verify** — `npx tsc --noEmit` (only `hud.ts` may still be red), `npx eslint src/systems/matchRules.ts src/index.ts`.

- [ ] **Step 4: Commit**

```bash
git add src/systems/matchRules.ts src/index.ts
git commit -m "feat(mp3): MatchRulesSystem — sin-bin per side, king unprotected, auto-restart"
```

---

### Task 7: HUD — score, turn row, end reason

**Files:**

- Modify: `public/ui/hud.uikitml`
- Modify: `src/systems/hud.ts`
- Modify: `src/data/i18n/sv.json`, `src/data/i18n/en.json`

**Interfaces:**

- Consumes: `score`, `isFinished` from Task 1; `MatchStateChanged` payload `{ state, mySide }`.

- [ ] **Step 1: Markup** — in `hud.uikitml` replace the `match-row` block with:

```html
<div id="match-row" class="row" style="display: none">
  <span id="match-label" class="label">Match</span>
  <span id="match-value" class="value">0 – 0</span>
</div>
<div id="turn-row" class="row" style="display: none">
  <span id="turn-label" class="label">Tur</span>
  <span id="turn-value" class="value">-</span>
</div>
<div id="end-reason-row" class="row" style="display: none">
  <span id="end-reason-label" class="label"></span>
  <span id="end-reason-value" class="value">-</span>
</div>
```

- [ ] **Step 2: i18n** — add to `sv.json`: `"matchTurnLabel": "Tur"`, `"matchEndKing": "Kungen fälld"`, `"matchEndKingEarly": "Kungen fälld i förtid"`; to `en.json`: `"matchTurnLabel": "Turn"`, `"matchEndKing": "King felled"`, `"matchEndKingEarly": "King felled early"`.

- [ ] **Step 3: `hud.ts`** — import `{ isFinished, score } from '../core/match.js'`. In `refreshLabels()` add:

```ts
this.hudPanel
  .requireElementById('turn-label')
  .setProperties({ text: t('matchTurnLabel') });
```

Replace `updateMatchRow()`:

```ts
  /** Hidden until the first MatchStateChanged — i.e. never in solo
   * play, since systems/multiplayer.ts only emits it with an actual
   * opponent connected. Score reads `A – B` with Player A (host) always
   * left, matching the "Du är" row (Erik, 2026-09-05). */
  private updateMatchRow(): void {
    if (!this.lastMatchState) {
      return;
    }
    const t = i18nState.t;
    const { state, mySide } = this.lastMatchState;
    const s = score(state);
    const show = (id: string) =>
      this.hudPanel.requireElementById(id).setProperties({ display: 'flex' });

    show('role-row');
    this.hudPanel.requireElementById('role-value').setProperties({
      text: mySide === 'host' ? t('rolePlayerA') : t('rolePlayerB'),
    });
    show('match-row');
    this.hudPanel
      .requireElementById('match-value')
      .setProperties({ text: `${s.host} – ${s.guest}` });
    show('turn-row');
    const turnText = isFinished(state)
      ? state.winner === mySide
        ? t('matchWon')
        : t('matchLost')
      : state.currentTurn === 'host'
        ? t('matchPlayerATurn')
        : t('matchPlayerBTurn');
    this.hudPanel
      .requireElementById('turn-value')
      .setProperties({ text: turnText });
    if (isFinished(state)) {
      show('end-reason-row');
      this.hudPanel.requireElementById('end-reason-value').setProperties({
        text:
          state.endReason === 'allKubbsAndKing'
            ? t('matchEndKing')
            : t('matchEndKingEarly'),
      });
    } else {
      this.hudPanel
        .requireElementById('end-reason-row')
        .setProperties({ display: 'none' });
    }
  }
```

And `hidePeerRows()`:

```ts
  private hidePeerRows(): void {
    for (const id of ['role-row', 'match-row', 'turn-row', 'end-reason-row']) {
      this.hudPanel.requireElementById(id).setProperties({ display: 'none' });
    }
  }
```

- [ ] **Step 4: Verify** — `npx tsc --noEmit` clean for the first time since Task 1; `npx eslint . && npx prettier --write . && npx prettier --check . && npx vitest run` all green; `npm run build && npm run smoke` green.

- [ ] **Step 5: Commit**

```bash
git add public/ui/hud.uikitml src/systems/hud.ts src/data/i18n/sv.json src/data/i18n/en.json
git commit -m "feat(mp3): HUD score A – B, turn row, end-reason row"
```

---

### Task 8: Emulator verification, docs, issues, push

**Files:**

- Modify: `docs/DECISIONS.md`, `docs/MILESTONES.md`, `README.md` (features line if it lists match rules)

- [ ] **Step 1: Solo regression in the emulator** — `npx iwsdk dev up`, `xr_accept_session`, then via MCP: throw a stick at a kubb until `[state] kubb felled` (a horizontal sweep works best, see DECISIONS 2026-08-29); `ecs_query_entity` the felled kubb → has `OutOfPlay`, position on the near sin-bin row (x≈3.3); the king entity has `KingProtected`. Trigger a round end (or press "Ny runda") → kubb home, `OutOfPlay` gone, `KingProtected` re-derived. `browser_get_console_logs` with `count` only: zero errors.

- [ ] **Step 2: Match-path check without a peer** — the MCP surface has no JS eval and no test hook is to be added to production code, so verify by observation only: `ecs_list_systems` shows `MatchRulesSystem` registered and running; `browser_get_console_logs` with pattern `match rules` returns nothing in solo (the flag never flips without a peer); `ecs_find_entities` with `withComponents: ["KingProtected"]` returns the king (solo protection intact). Note in DECISIONS that the match path itself (sin-bin across rounds, king decision, auto-restart, guest abort) needs the 2-headset gate.

- [ ] **Step 3: Docs** — DECISIONS.md: a dated entry "MP3a implemented" listing what was built, the emulator checks, and what only the headset gate can prove. MILESTONES.md: new `## MP3a — Match rules` section with the checklist and the open GATE. README: one line under features if features are listed.

- [ ] **Step 4: File the two issues** —
      `gh issue create --title "[mp3] Host and guest can run different game modes (court lengths)" --label bug` and
      `gh issue create --title "[mp3] Relayed guest throws pollute host stats (Settled without Thrown)" --label tech-debt`, each with the spec's one-paragraph description.

- [ ] **Step 5: Push and watch CI** — `git push && gh run watch $(gh run list --limit 1 --json databaseId -q '.[0].databaseId') --exit-status`.

- [ ] **Step 6: Request code review** — `superpowers:requesting-code-review` over the range from the spec commit to HEAD.
