# Match rules (MP3a) — design

Date: 2026-09-05. Status: approved by Erik in brainstorming (sections 1-2
explicitly; 3-5 written from the same decisions); revised after an
independent spec review the same day (2 Critical + 8 Important findings, all
resolved below — items marked _(autonomous)_ were decided while Erik was AFK
and are reversible; see docs/DECISIONS.md 2026-09-05).

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

## Decisions

| Question                        | Decision                                                                                                           |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Win condition                   | Real kubb: all 5 opponent kubbs down AND THEN the king. King early = loss. (Erik)                                  |
| Felled kubb, physically         | Moved to a sin-bin row on the side that owned it; stays there the whole match. (Erik)                              |
| Match end                       | Result in HUD, new match auto-starts after 10 s. Host (Player A) always starts. (Erik)                             |
| "Ny runda" during a match       | Aborts the match on EITHER headset — the guest's press is relayed to the host. (Erik + _autonomous_ for the relay) |
| Game-mode button during a match | Disabled on both headsets while a match is active — a relayout mid-match is undefined. _(autonomous)_              |
| Score display                   | Football style `2 – 3`, Player A always left (matches the "Du är" row). (Erik)                                     |
| Solo rows during a match        | Keep showing Rekord/Stil — hide nothing. (Erik)                                                                    |
| When rules apply                | Whenever a peer is connected, regardless of Simple/Advanced. Solo play is unchanged. (Erik)                        |
| Architecture                    | New `MatchRulesSystem` + extended pure `core/match.ts`; `MultiplayerSystem` slims down. (Erik)                     |
| Own-side kubb felled (ricochet) | Ignored by the reducer: no score, not sin-binned; the round-end reset stands it back up. _(autonomous)_            |
| King + kubb in the same throw   | King decision deferred by a short grace so the kubb counts first (see §1). _(autonomous)_                          |

Locked assumptions: no field kubbs (a felled kubb goes straight to the sin-bin,
it is never thrown back into play); no advantage line; `KingProtected` is NOT
used in a match — the king may fall, the reducer decides. The "thrower is
`currentTurn`" assumption rests on two facts a future feature must not break:
`locomotion: false` in `iwsdk.config.json`, and sticks physically at exactly
one rack per turn (MP2 phase 4).

## 1. Pure core — `src/core/match.ts` (TDD)

```ts
type MatchSide = 'host' | 'guest';
type MatchEndReason = 'allKubbsAndKing' | 'kingFelledEarly';

interface MatchState {
  currentTurn: MatchSide;
  /** Kubb ids (scene ids, `kubb-N`) that are down, keyed by the SIDE that
   * owns/defends them, in felling order. kubb-0..4 = guest side,
   * kubb-5..9 = host side (existing kubbSide()). */
  felledKubbIds: { host: string[]; guest: string[] };
  winner: MatchSide | null;
  endReason: MatchEndReason | null;
}
```

No separate `phase` — `isFinished(state) = state.winner !== null` (review:
two representations of one fact). Transitions return the input unchanged when
finished:

- `initialMatchState()` → host on turn, empty lists, no winner.
- `withKubbFelled(state, kubbId)` → `kubbSide(index)` picks the list. Ignored
  (state unchanged) when: id is not `kubb-N`; already in the list; **or the
  kubb is on the thrower's own side** (`kubbSide === currentTurn`, a
  ricochet — real kubb stands it back up, and the round-end reset does that
  here). Never sets a winner.
- `withKingFelled(state, kubbsPerSide = KUBB_COUNT)` → thrower is
  `currentTurn`. Opponent list full → `winner = currentTurn`,
  `endReason = 'allKubbsAndKing'`; otherwise `winner = otherSide(currentTurn)`,
  `endReason = 'kingFelledEarly'`.
- `withTurnAdvanced(state)` → flips `currentTurn`.
- `score(state)` → `{ host: felledKubbIds.guest.length, guest: felledKubbIds.host.length }`.
- `isFinished(state)`.

**Same-throw ordering (review I1)**: `ToppleSystem` emits `KubbFelled` and
`KingFelled` per piece when THAT piece rests, in no guaranteed order. The host
therefore does not call `withKingFelled` on `KingFelled` directly: it records
`kingFelledAtS` and applies the transition in `update()` once
`match.kingDecisionGraceS` (new `src/data/match.json`, 1.5 s ≈ 3× the
`restDurationS` a kubb needs to be declared felled) has elapsed, so a kubb
toppled by the same stick is counted first. Deterministic for a given match
because only the host decides; the grace is the documented rule.

**`src/core/matchSinBin.ts` (new, pure)**: `sinBinPlacements(state, cfg)` →
for each felled id, `{ kubbId, position, quaternion }` where slot =
`felledKubbIds[side].indexOf(kubbId)` (derived, never counted — review I7:
a late-joining guest's first snapshot may carry three ids at once), position =
`sinBinSlotPosition(slot, kubbHeightM, sinBin)` for the host side and its
`mirrorPoseToFarBaseline(…, farZ)` for the guest side.

**`farBaselineZ(preset)`** moves into `core/court-layout.ts` (review I5:
`FAR_Z` in `multiplayer.ts` is hardcoded to the default preset; Advanced uses
the 8 m tournament court and the mirrored row would land inside it). Both
systems compute it from the ACTIVE preset. Host/guest running different modes
is out of scope — filed as an issue.

Only the HOST calls transitions; the guest receives whole states.

## 2. Physical adapter — `src/systems/matchRules.ts` (new)

Event-driven; never touches the network. Registration order is irrelevant —
it talks to `MenuSystem` only via the `ResetRequested` event and is the sole
writer of the shared flag (implementation registers it last for readability).

- `MatchStateChanged` → if `active` was false: set `active = true`, and
  **remove `KingProtected` from the `KingPiece` entity** (review C1: in the
  default Simple mode the tag is already present from solo play and nothing
  else would ever remove it — the king could never fall, the match could
  never be won). Then diff `sinBinPlacements(new)` against the previous
  placements it applied: added → `setBodyTransform` + add `OutOfPlay`;
  removed → remove `OutOfPlay` (positions come from MenuSystem's teleport on
  the host, `pieceSync` on the guest). Runs identically on both clients from
  the same state. If `isFinished` and `mySide === 'host'` → start the 10 s
  restart timer **if not already running** (the reducer re-emits the same
  finished state on every round end).
- `MultiplayerPeerDisconnected` → `active = false`, clear the previous
  placements snapshot, cancel the timer, then emit `ResetRequested` (review
  I3: without a reset the ex-player is left with kubbs in the sin-bin,
  `ToppleSystem`'s `felledReported` still set and a stale king tag).
- `update(delta)`: restart countdown only, no allocation; on expiry clear the
  timer first, then emit `ResetRequested`.

**New event `ResetRequested: Record<string, never>`** (review I6): handled by
`MenuSystem` → `resetAll('manual')`. Keeps the reset trigger on the bus
instead of making `resetAll` public and calling it from two systems. Emitted
by `MatchRulesSystem` (timer, disconnect) and by `MultiplayerSystem` when a
guest's reset relay arrives (below).

Why `OutOfPlay` on the guest (review I4, corrected rationale): the guest's
own `RoundSystem` ends rounds after its six throws and its `MenuSystem` runs
`resetAll('roundEnd')` locally — without the tag every guest round-end would
visibly yank the sin-bin kubbs home until the next `pieceSync`. The tag is
what the `resettableInPlay` exclusion keys on.

Shared activity flag — `src/matchActivityState.ts`: `{ current: { active } }`,
written by `MatchRulesSystem` only, read by `MenuSystem` and
`SimpleRulesSystem` (same module-state pattern as `settingsState`). Stable
through the round-end cascade: it only flips at connect/disconnect.

Changes to existing systems:

- `MenuSystem`: second query `resettableInPlay` (`excluded: [OutOfPlay]`);
  `resetAll('roundEnd')` uses it while `active`, `'manual'` always uses the
  full query. Subscribes to `ResetRequested`. `game-mode-button` disabled
  (visually and functionally) while `active`. `reset-button` is unchanged on
  both headsets — it keeps calling `resetAll('manual')`; the resulting
  `Reset{manual}` is what `MultiplayerSystem` relays to the host when this
  client is the guest (below).
- `SimpleRulesSystem`: `onKubbFelled`, `onReset` and `applyKingProtection`
  early-return while `active`. Re-derivation after a match happens because
  the disconnect path emits `ResetRequested` → `Reset{manual}` with the flag
  already false.
- `ToppleSystem`: add `OutOfPlay` to the query's `excluded` list (review I4:
  after any `Reset` its `felledReported` is cleared, so a sin-binned kubb hit
  by a stray stick would re-fire `KubbFelled`; the reducer's dedup is the
  second guard, the exclusion is the first).
- `MultiplayerSystem`: keeps roles/sync/`Reset{roundEnd}` → turn advance +
  far-rack sticks; `KubbFelled` → `withKubbFelled(pieceId)`; `KingFelled` →
  record `kingFelledAtS`, apply in `update()` after the grace (host only);
  drops the "match won" log. **Guest reset relay (review C2)**: on
  `Reset{manual}` when NOT host → send a new zod-guarded `resetRequest`
  action (`core/resetRelay.ts`: `{ version }` only); the host's handler
  verifies the sender is a connected peer and emits `ResetRequested`. The
  guest's local teleport is then corrected by the host's next `pieceSync`
  and the fresh match state. Also: when `parseMatchSyncMessage` fails but the
  payload carries a numeric `version` ≠ ours, log a distinct
  `match-sync schema version mismatch` warn (review I8: with the PWA's
  `autoUpdate`, one headset can run v2 while the other still runs v1 until
  it reloads).

Pre-announce window: a kubb felled after the peer connects but before
`hello` resolves goes through `SimpleRulesSystem`'s solo path (slot 0) and
is re-placed by `MatchRulesSystem` on the first `MatchStateChanged` — same
slot, harmless; noted so nobody "fixes" it.

## 3. HUD — `src/systems/hud.ts`, `public/ui/hud.uikitml`

- `match-row`: the score `A - B` (`score(state)`, host left). Plain hyphen,
  not an en dash — the UIKit MSDF font has no glyph for `–` (found in the
  emulator during implementation: "Missing glyph info for character").
- New `turn-row`: the existing turn text ("Spelare A:s tur"); when finished,
  `matchWon`/`matchLost` (relative, as today).
- New `end-reason-row`, shown only when finished: `matchEndKing` ("kungen
  fälld") / `matchEndKingEarly` ("kungen fälld i förtid"), sv + en.
- `hidePeerRows()` hides all four peer rows (role, match, turn, end-reason).
- `round-number` keeps counting `RoundEnded`s — in a match it is a turn
  counter; intended.
- No solo row is hidden. New i18n keys: `matchTurnLabel`, `matchEndKing`,
  `matchEndKingEarly`.

## 4. Wire format

- `core/matchSync.ts`: `MATCH_SYNC_SCHEMA_VERSION` 1 → 2 with the new shape
  (`felledKubbIds` two string arrays, `endReason` enum nullable). v1 is
  rejected by `safeParse`; the mismatch is logged distinctly (above).
- `core/resetRelay.ts` (new): `{ version: 1 }`; `buildResetRequest()`,
  `parseResetRequest()` — same never-throws pattern as every other message.

## 5. Testing

- Core (vitest, red-green): every §1 transition incl. king early vs after all
  kubbs, own-side kubb ignored, duplicate/unknown ids, no-ops when finished,
  `score()`, `isFinished()`, `kubbsPerSide` parameter; `sinBinPlacements`
  (slot = list index; guest side = mirror of host side; a 3-id first snapshot
  yields slots 0,1,2); `farBaselineZ` for all three presets; matchSync v2
  round trip + v1 rejection; resetRelay round trip + garbage rejection.
- Adapters (emulator MCP, solo): Simple mode unchanged (felled kubb → sin-bin,
  king protected, both restored at round end); Advanced unchanged; with the
  flag forced active: `KingProtected` absent, a `roundEnd` reset leaves an
  `OutOfPlay` kubb in place, `ResetRequested` restores everything; game-mode
  button disabled while active. `tsc/eslint/prettier/vitest/build/smoke`.
- Headset gate (Erik, 2 Quests, not self-approvable): felled kubbs stay in the
  sin-bin across rounds; score `A – B` on both; king early = loss on both;
  king after all kubbs = win; 10 s later a fresh match with A starting;
  "Ny runda" from EITHER headset aborts; game-mode button greyed out.

## Filed, not fixed here

- Host and guest in different game modes (different court lengths) —
  pre-existing, now more visible.
- Stats pollution: a relayed guest throw produces `Settled` but no `Thrown`
  on the host, so `RoundSystem`/`StatsSystem` fold the opponent's turn into
  the host's personal bests — pre-existing.

## Out of scope (MP3b and later)

Avatars (separate spec). Field kubbs / advantage line. Per-side king
protection. Match history in stats. Spectator score display.
