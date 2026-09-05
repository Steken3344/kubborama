# Match rules (MP3a) — design

Date: 2026-09-05. Status: approved by Erik in brainstorming (sections 1-2
explicitly; 3-5 written from the same decisions), pending spec review.

## Why

Erik's post-test feedback (2026-09-05, two real Quest 2 headsets):

1. A match needs a real concept separate from a round: felled kubbs stay out
   of play until the match is over; a round is just "who is throwing".
2. Score = how many of the opponent's kubbs are felled.
3. Felling the king before all opponent kubbs are down loses the match.
4. (Separate spec, MP3b) better avatars than head + two spheres.

Today (MP2 phase 3): win = clear the opponent's 5 kubbs; the king is
irrelevant in multiplayer; every round end teleports ALL pieces home, so
felled kubbs stand back up after 6 sticks. Simple mode already has sin-bin +
`OutOfPlay` + `KingProtected`, but both reset every round and the king rule
is global, not per side.

## Decisions (Erik, brainstorming 2026-09-05)

| Question                  | Decision                                                                                |
| ------------------------- | --------------------------------------------------------------------------------------- |
| Win condition             | Real kubb: all 5 opponent kubbs down AND THEN the king. King early = loss.              |
| Felled kubb, physically   | Moved to a sin-bin row on the side that owned it; stays there the whole match.          |
| Match end                 | Result shown in HUD, new match auto-starts after 10 s. Host (Player A) always starts.   |
| "Ny runda" during a match | Aborts the match (full reset, new match).                                               |
| Score display             | Football style `2 – 3`, Player A always left (matches the "Du är" row).                 |
| Solo rows during a match  | Keep showing Rekord/Stil — hide nothing.                                                |
| When rules apply          | Whenever a peer is connected, regardless of Simple/Advanced. Solo play is unchanged.    |
| Architecture              | New `MatchRulesSystem` + extended pure `core/match.ts`; `MultiplayerSystem` slims down. |

Locked assumptions: no field kubbs (a felled kubb goes straight to the sin-bin,
it is never thrown back into play); no advantage line; the `KingProtected`
mechanic is NOT used in a match — the king may fall, the reducer decides.

## 1. Pure core — `src/core/match.ts` (TDD)

```ts
type MatchSide = 'host' | 'guest';
type MatchPhase = 'playing' | 'finished';
type MatchEndReason = 'allKubbsAndKing' | 'kingFelledEarly';

interface MatchState {
  phase: MatchPhase;
  currentTurn: MatchSide;
  /** Kubb ids (scene ids, `kubb-N`) that are down, keyed by the SIDE that
   * owns/defends them. kubb-0..4 = guest side, kubb-5..9 = host side
   * (existing kubbSide()). */
  felledKubbIds: { host: string[]; guest: string[] };
  winner: MatchSide | null;
  endReason: MatchEndReason | null;
}
```

Transitions — all return the input unchanged when `phase === 'finished'`:

- `initialMatchState()` → `playing`, `currentTurn: 'host'`, empty lists, no
  winner. Host always starts (decision above).
- `withKubbFelled(state, kubbId)` → `kubbSide(kubbIndex)` picks the list;
  duplicate ids are ignored; unknown ids (not `kubb-N`) return state unchanged.
  Never sets a winner — kubbs alone no longer decide the match.
- `withKingFelled(state)` → the thrower is `state.currentTurn`. If every kubb
  on the OPPONENT's side is in the felled list (`length === kubbsPerSide`):
  `winner = currentTurn`, `endReason = 'allKubbsAndKing'`. Otherwise
  `winner = otherSide(currentTurn)`, `endReason = 'kingFelledEarly'`. Either
  way `phase = 'finished'`.
- `withTurnAdvanced(state)` → flips `currentTurn` (as today).
- `score(state)` → `{ host: state.felledKubbIds.guest.length, guest: state.felledKubbIds.host.length }`
  — host's score is how many GUEST-side kubbs are down.
- `hostKubbsRemaining`/`guestKubbsRemaining` (current fields) are removed;
  derive from the lists.

The existing `kubbSide()` and `otherSide()` stay. Only the HOST calls the
transitions (unchanged principle); the guest receives whole states.

## 2. Physical adapter — `src/systems/matchRules.ts` (new)

Event-driven only; never touches the network. Subscribes to:

- `MatchStateChanged` → `matchActivity.current.active = true`; diff the new
  `felledKubbIds` against the previous state it saw:
  - ids ADDED → teleport that kubb (`PhysicsSystem.setBodyTransform`) to the
    next sin-bin slot on its side and add `OutOfPlay`. Guest-side row =
    today's sin-bin row mirrored with `mirrorPoseToFarBaseline(pose, FAR_Z)`
    (same function as the player teleport and the second stick rack — no
    third hardcoded layout). Slot index is per side, in list order, so both
    clients compute identical slots from identical state.
  - ids REMOVED (new match / abort) → remove `OutOfPlay`. Positions come from
    MenuSystem's teleport on the host and from `pieceSync` on the guest.
  - `phase` becomes `finished` and `mySide === 'host'` → start the 10 s
    restart timer.
  - Runs on BOTH clients from the same state; the host's `pieceSync` then
    confirms the same positions on the guest. `OutOfPlay` on the guest is
    what keeps the guest's local `ToppleSystem`/`SimpleRulesSystem` from
    acting on a kubb that is already down.
- `MultiplayerPeerDisconnected` → `active = false`, clear every `OutOfPlay`,
  reset slot indices, cancel the timer. (MenuSystem's next reset restores
  positions; MultiplayerSystem already resets match state here.)
- `update(delta)`: only the restart countdown — no allocation. On expiry:
  `menuSystem.resetAll('manual')` (made public; today private) → Reset →
  `MultiplayerSystem.onResetForMatch('manual')` sets `initialMatchState()`
  and broadcasts → the diff above clears `OutOfPlay` on both clients.

Shared activity flag — `src/matchActivityState.ts`: `{ current: { active: boolean } }`,
written by `MatchRulesSystem` only, read by `MenuSystem` and
`SimpleRulesSystem`. Same module-state pattern as `settingsState`/`i18nState`.

Changes to existing systems (each one line-ish, gated on the flag):

- `MenuSystem.resetAll()`: when `matchActivity.current.active`, iterate a
  second query `resettableInPlay` (`excluded: [OutOfPlay]`) instead of
  `resettable`, so felled kubbs stay in the sin-bin across a `'roundEnd'`
  reset. A `'manual'` reset (abort / auto-restart) still uses the full query.
  `resetAll` becomes public for the restart timer.
- `SimpleRulesSystem`: `onKubbFelled`, `onReset` and the king-protection
  refresh all early-return while `active` — solo Simple behaviour is
  otherwise untouched.
- `MultiplayerSystem`: keeps roles, sync, `Reset{roundEnd}` → turn advance +
  far-rack sticks, `KubbFelled` → `withKubbFelled`, and gains `KingFelled` →
  `withKingFelled`; both followed by `setMatchState` + broadcast as today.
  Its `onKubbFelledForMatch` no longer logs "match won".

## 3. HUD — `src/systems/hud.ts`, `public/ui/hud.uikitml`

- `match-row` value: while `playing`, the score as `A – B` using
  `score(state)` (`host – guest`, host always left, en dash). The existing
  turn text moves to its own row (`turn-row`: "Spelare A:s tur").
- When `finished`: turn row shows `matchWon`/`matchLost` (relative, as today)
  and the score row keeps the final score; a new `matchEndReason` line
  ("kungen fälld" / "kungen fälld i förtid", sv+en) under it. Rows hide on
  `MultiplayerPeerDisconnected` as today.
- New i18n keys: `matchTurnLabel`, `matchEndKing`, `matchEndKingEarly`. No
  solo row is hidden.

## 4. Wire format — `src/core/matchSync.ts`

`MATCH_SYNC_SCHEMA_VERSION` 1 → 2 with the new `MatchState` shape (zod:
`felledKubbIds` as two arrays of strings, `phase`/`endReason` enums). A v1
message is rejected by the existing `safeParse` boundary — acceptable, both
headsets always run the same deploy.

## 5. Testing

- Core (vitest, red-green): every transition above, including king early vs
  king after all kubbs, duplicate/unknown kubb ids, all no-ops after
  `finished`, `score()`, `initialMatchState()`; matchSync v2 round trip and
  v1 rejection; guest-side sin-bin slot = mirror of host-side slot (pure,
  using `sinBinSlotPosition` + `mirrorPoseToFarBaseline`).
- Adapters (emulator MCP): solo Simple mode unchanged (felled kubb → sin-bin,
  king protected, both reset at round end); solo Advanced unchanged; with the
  flag forced active, a `'roundEnd'` reset leaves an `OutOfPlay` kubb where it
  is; `tsc/eslint/prettier/vitest/build/smoke` green.
- Headset gate (Erik, 2 Quests): felled kubbs stay in the sin-bin across
  rounds, score reads `A – B`, king early = loss shown on both headsets, king
  after all kubbs = win, 10 s later a fresh match with A starting, "Ny runda"
  aborts. Not self-approvable.

## Out of scope (MP3b and later)

Avatars (separate spec). Field kubbs / advantage line. Per-side king
protection. Match history in stats. Spectator score display.
