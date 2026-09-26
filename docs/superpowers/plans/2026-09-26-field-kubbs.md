# MP4 Field Kubbs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Real kubb turn loop in multiplayer: physical inkast, raising, field-kubbs-first, advantage line, leaning = felled, own-side rebound raised, king felled by inkast = loss.

**Architecture:** All rules in the pure reducer (`core/match.ts` v3 + `core/inkast.ts`), which returns `{ state, effects }`. The host applies effects physically (MatchRulesSystem); the guest follows pieceSync + matchSync v3. A new InkastSystem owns grabbing, tossing and landing detection for kubbs. Spec: docs/superpowers/specs/2026-09-26-field-kubbs-design.md.

**Tech Stack:** TypeScript strict, IWSDK ECS + Havok, zod, vitest, trystero.

**Execution note (token economy, CLAUDE.md):** this plan gives exact interfaces, full core tests and the behavior of every adapter change; the implementer (this session) writes the code directly into the files, TDD for core.

## Global Constraints

- `src/core/*` has no three.js/IWSDK imports; plain data in/out.
- One event bus; new events: `InkastLanded { kubbId: string; x: number; z: number }`, `KubbTossed { kubbId: string }`, `MatchEffects { effects: MatchEffect[] }`. `KubbFelled` already carries `position`.
- Config in JSON: new `src/data/inkast.json`, exported from `src/config.ts` as `inkast`.
- Network: matchSync **v3**, throwRelay **v2** (`pieceId`), both reject the previous version with the existing version-mismatch log.
- Solo (SimpleRulesSystem, `sin-bin.json`, `core/sinBin.ts`) unchanged. Only `core/matchSinBin.ts` (+ test) is deleted.
- Probes via `gateLog` only. No per-frame allocation in `update()`.
- Verification before done: tsc, eslint, prettier --check src scripts, vitest, build, smoke, emulator solo check, two-peer headless run.

## Data: `src/data/inkast.json`

```json
{
  "rackOffsetBehindBaselineM": 0.5,
  "rackSpacingM": 0.15,
  "clampInsetM": 0.05,
  "minSeparationM": 0.12,
  "tossVelocityMultiplier": 1.0,
  "tossAngularMultiplier": 1.0,
  "maxTossFlightS": 6,
  "leaningFelledDeg": 20,
  "rearmBelowDeg": 10
}
```

---

### Task 1: `core/inkast.ts` — geometry of halves

**Interfaces (produces):**
```ts
export interface CourtHalves { halfWidthM: number; nearBaselineZ: number; centreZ: number; farBaselineZ: number }
export function courtHalves(preset: CourtPreset): CourtHalves;          // near 0, far −L, centre −L/2
export function halfBounds(h: CourtHalves, side: MatchSide): { minZ: number; maxZ: number }; // host [centre,0], guest [far,centre]
export function halfOfZ(h: CourtHalves, z: number): MatchSide;           // z ≥ centre → host
export function isLegalLanding(h: CourtHalves, side: MatchSide, x: number, z: number): boolean; // lines count as in
export function clampIntoHalf(h: CourtHalves, side: MatchSide, x: number, z: number, insetM: number): { x: number; z: number };
export function nudgeClear(p: { x: number; z: number }, others: ReadonlyArray<{ x: number; z: number }>, minSeparationM: number, h: CourtHalves): { x: number; z: number };
```
`nudgeClear`: up to 10 iterations; for the first `other` closer than `minSeparationM`, step `minSeparationM` along x away from it (`+1` when equal x); clamp x to ±halfWidth; return the result.

- [ ] Tests (`src/core/inkast.test.ts`): tournament preset (5×8) → halves; legal inside / on the line / beyond the centre line / beyond the sideline / wrong half; clamp from outside each edge lands inset; nudge moves a coincident point by ≥ minSeparation and leaves a clear point untouched; `halfOfZ(-4)` = host (centre counts as host — document it).
- [ ] Implement, add `inkast.json` + `config.ts` export, commit `feat(match): court-half geometry for the inkast`.

### Task 2: `core/match.ts` v3 reducer

**Interfaces (produces):**
```ts
export type MatchPhase = 'inkast' | 'throwing';
export type MatchEndReason = 'allKubbsAndKing' | 'kingFelledEarly' | 'kingFelledByInkast';
export type RaiseReason = 'inkast' | 'inkastClamped' | 'inkastHit' | 'earlyBaseline' | 'rebound';
export interface FieldKubb { kubbId: string; half: MatchSide; x: number; z: number }
export interface InkastItem { kubbId: string; attempt: 1 | 2 }
export interface MatchState {
  currentTurn: MatchSide; phase: MatchPhase;
  baselineKubbs: { host: string[]; guest: string[] };
  fieldKubbs: FieldKubb[]; felledThisTurn: string[]; inkastQueue: InkastItem[];
  winner: MatchSide | null; endReason: MatchEndReason | null;
}
export type MatchEffect =
  | { type: 'raise'; kubbId: string; x: number; z: number; reason: RaiseReason }
  | { type: 'restoreHome'; kubbId: string; reason: RaiseReason }
  | { type: 'returnToRack'; kubbId: string };
export interface MatchStep { state: MatchState; effects: readonly MatchEffect[] }
export interface InkastOptions { insetM: number; minSeparationM: number }

initialMatchState(kubbsPerSide?): MatchState            // phase 'throwing', guest baseline kubb-0..4, host kubb-5..9
withKubbFelled(s, kubbId, x, z): MatchStep
withInkastLanded(s, kubbId, x, z, halves, standing: ReadonlyArray<{x:number;z:number}>, opts): MatchStep
withKingFelled(s): MatchState
withTurnAdvanced(s): MatchState
advantageLineZ(s, side, halves): number | null
standingKubbs(s): { host: number; guest: number }
// kept: otherSide, turnPassedTo, kubbSide, kubbId, kubbIndexFromId, isFinished
// removed: score, felledKubbIds
```
Same-reference `state` and the shared frozen empty `effects` when nothing applies.

Behavior (spec rules → tests, `src/core/match.test.ts` rewritten):
- `withKubbFelled`, phase `throwing`:
  - target-half field kubb → removed from `fieldKubbs`, appended to `felledThisTurn`, no effect.
  - target-half baseline kubb, no field kubb on the target half → removed from `baselineKubbs[target]`, appended.
  - target-half baseline kubb while a field kubb stands there → state unchanged, effect `restoreHome` reason `earlyBaseline`.
  - own-half baseline → `restoreHome` `rebound`; own-half field kubb → its x/z updated to the rest position, effect `raise` `rebound`.
  - unknown / already felled / queued id → unchanged, no effect.
- `withKubbFelled`, phase `inkast`: baseline → `restoreHome` `inkastHit`; field → position updated, `raise` `inkastHit`; never counted.
- `withInkastLanded` (only in `inkast`, only for a queued id):
  - legal → field kubb on the target half at `nudgeClear(x,z)`, removed from queue, `raise` `inkast`.
  - illegal on attempt 1 → attempt becomes 2, effect `returnToRack`.
  - illegal on attempt 2 → `clampIntoHalf` then `nudgeClear`, field kubb, `raise` `inkastClamped`.
  - last item leaves the queue → phase `throwing`.
- `withKingFelled`: `inkast` → winner = other side, `kingFelledByInkast`; `throwing` → thrower wins iff `standingKubbs[target] === 0` (`allKubbsAndKing`) else loses (`kingFelledEarly`); finished → same ref.
- `withTurnAdvanced`: turn flips, `inkastQueue = felledThisTurn` (attempt 1), `felledThisTurn = []`, phase `inkast` iff queue non-empty; finished → same ref.
- `advantageLineZ`: z of the field kubb on `side`'s half closest to `centreZ`, else null.
- A full scripted turn sequence test: host fells 2 guest baseline kubbs → advance → guest inkast both legal onto host half → throwing → guest fells a host baseline kubb early (restoreHome) → fells both field kubbs → fells the baseline kubb → advance → host's queue has 3.

- [ ] Write the tests first (red), implement, green, commit `feat(match): v3 reducer — inkast, field kubbs, raising`.

### Task 3: wire formats

- `core/matchSync.ts` v3: zod schema mirroring `MatchState` v3 (ids bounded `.max(KUBB_COUNT * 2)`, `fieldKubbs.max(KUBB_COUNT * 2)`, finite numbers).
- `core/throwRelay.ts` v2: `stickId` → `pieceId`.
- Tests: round-trip v3; v2 match / v1 relay rejected with `peekSchemaVersion` reporting the old number; oversize lists rejected.
- Update `systems/multiplayer.ts` call sites (`pieceId`).
- Delete `core/matchSinBin.ts` + its test.
- [ ] Commit `feat(net): matchSync v3, throwRelay v2 (pieceId)`.

### Task 4: felled detection (topple)

- `core/topple.ts`: `felledAngleDeg(modeAngleDeg: number, inMatch: boolean, leaningDeg: number): number` (match → `min(modeAngle, leaningDeg)`) and `isUprightAgain(quat, rearmBelowDeg): boolean`. Tests.
- `systems/topple.ts`: use `felledAngleDeg(…, matchActivity.current.active, inkast.leaningFelledDeg)`; in `checkOne`, a piece in `felledReported` that is upright again (`isUprightAgain`) and resting is re-armed (removed from `felledReported`, rest accumulator cleared) — this is how a raised kubb can be felled again, on both clients, with no extra event.
- [ ] Commit `feat(topple): leaning counts as felled in a match; raised kubbs re-arm`.

### Task 5: host authority (MultiplayerSystem)

- `onKubbFelledForMatch(entityId, position)` → `withKubbFelled(state, pieceId, position[0], position[2])`; if state changed → set + broadcast; if effects → `gameEvents.emit('MatchEffects', { effects })`.
- Subscribe `InkastLanded` (host only, in a match) → `withInkastLanded(…, courtHalves(activePreset), standingPositions(), inkast)`; `standingPositions()` = all field kubbs + baseline kubb home positions (from state + the kubb entities' current positions). Set/broadcast/emit effects.
- King: unchanged deferral; `withKingFelled` now phase-aware.
- `advanceTurnForMatch`: after `withTurnAdvanced`, place the new thrower's sticks at its rack; if `advantageLineZ` for the new thrower is not null, place them on that line instead (same mirrored rack layout, z replaced).
- `applyThrowRelay`: a `pieceId` that is a kubb → apply velocity, emit `KubbTossed`, no `ThrowRelayed`.
- [ ] Commit `feat(match): host applies the v3 reducer and emits match effects`.

### Task 6: MatchRulesSystem v3

- Replace the sin-bin diff with:
  - **Inkast rack** (both clients, diff on `inkastQueue`): queued kubbs are placed upright in a row `rackOffsetBehindBaselineM` behind the thrower's baseline, `rackSpacingM` apart, centred on x = 0, and tagged `OutOfPlay`; leaving the queue → `OutOfPlay` removed.
  - **Effects** (host, `MatchEffects`): `raise` → upright at (x, kubbH/2, z), identity yaw; `restoreHome` → MenuSystem home pose (new public `MenuSystem.homePoseOf(entityIndex)`); `returnToRack` → back to its rack slot. Each logs `gateLog('kubb raised', { kubbId, reason })`.
- Keep: first-MatchStateChanged activation, king unprotect, restart countdown, disconnect reset.
- [ ] Commit `feat(match): inkast rack and effect-driven raising`.

### Task 7: InkastSystem + shared pose sampler

- Extract ThrowingSystem's pose ring buffer into `systems/poseSampler.ts` (`class PoseSampler { start(index); sample(index, gripSpace, timeS, windowSize); take(index): PoseSample[] }`, same no-allocation reuse). ThrowingSystem uses it (behavior identical — existing tests + golden throws must stay green).
- `systems/inkast.ts` (`InkastSystem`), queries `held: [Resettable, Grabbed]` minus sticks, `tossable: [OutOfPlay]`:
  - On `MatchStateChanged`: if phase `inkast` and `currentTurn === mySide`, add `OneHandGrabbable { rotate: true, translate: true }` to queued kubbs; otherwise remove it. Sticks: remove `OneHandGrabbable` from all sticks while any client is in `inkast`, restore after (sticks are never held at that point — they're racked).
  - Held kubb: sample poses; on release `computeThrowRelease` with the inkast multipliers → `PhysicsManipulation`; guest → `throwRelay` v2 via a new `MultiplayerSystem.relayToss(pieceId, …)`; host → emit `KubbTossed`.
  - Host: `KubbTossed` → track; each frame check rest with `core/restState.ts` (`isResting` + `accumulateHeldDuration`) or `maxTossFlightS` timeout → `InkastLanded { kubbId, x, z }`; `gateLog('inkast landed', { kubbId, legal, attempt })`.
- [ ] Emulator: with a scripted match state in `inkast` the queued kubbs become grabbable and the sticks do not. Commit `feat(match): physical inkast`.

### Task 8: menu reset, HUD, i18n

- `MenuSystem.resetAll('roundEnd')` during a match resets **only sticks** (new query `sticks: [StickState, Resettable]`); `resettableInPlay` removed.
- HUD match row: `standingKubbs` per half (host half left) in avatar colors; turn row appends `t('inkastRemaining', n)` while phase `inkast`. New i18n keys in `sv.json`/`en.json` (`"inkastRemaining": "Inkast: {n} kvar"` / `"Inkast: {n} left"`) — check the i18n helper's interpolation syntax first.
- [ ] Commit `feat(hud): standing kubbs and inkast progress`.

### Task 9: advantage line

- `systems/advantageLine.ts`: at init clone the `court-line-center` mesh into a new transform entity (hidden); on `MatchStateChanged` show it at `advantageLineZ(state, currentTurn, halves)` for the current thrower (hidden when null or no match); `gateLog('advantage line', { side, z })` on change.
- [ ] Commit `feat(match): advantage line`.

### Task 10: gate probes + report

- GateProbeSystem: `match state` adds `phase`, `fieldKubbs` count, `queue` length, standing per half; `sync snapshot` `felled` → `{ fieldKubbs, baselineKubbs, inkastQueue, phase }`; `score` → `standingKubbs`. Drop `sin-bin after round`.
- `scripts/gate/checks.mjs`: remove `mp3a-sinbin`; add `mp4-inkast-legal` (an `inkast landed` legal=true followed by `kubb raised` reason inkast), `mp4-inkast-retry` (legal=false attempt 1 → later attempt 2 line), `mp4-inkast-clamp` (`kubb raised` inkastClamped), `mp4-field-first` (`kubb raised` earlyBaseline), `mp4-rebound`, `mp4-advantage` (an `advantage line` line with non-null z), EYES `eyes-toss-feel`. Tests for each.
- [ ] Commit `feat(debug): MP4 gate probes and checks`.

### Task 11: verify + docs

- Full verification list; emulator solo (topple unchanged, no errors); two-peer headless run (match starts `throwing`, sync PASS incl. phase).
- Docs: MILESTONES (MP4 section + gate), DECISIONS (house rule, effects model, re-arm-by-upright, sticks locked during inkast), README features line, RULES_REVIEW §2 marked implemented, close gh#18 only after the headset gate (keep open, comment).
- [ ] Commit, push.
