# MP4 — Field kubbs (inkast, raising, field-first, advantage line) — design

Date: 2026-09-26 · gh#18 (folds in §3.4 leaning = felled, §3.6 own-side
rebound raised, §3.7 king felled by a tossed kubb) · Background:
docs/RULES_REVIEW.md §2 · Approved by Erik in chat ("ser bra ut, skriv
spec och kör").

Erik's choices (2026-09-26): the inkast is a **real physical toss**
(grab + underhand throw, like the sticks); a kubb that lands outside
twice follows a **house rule** — it is moved to the nearest point just
inside the target half and raised there (the official "opponent places
it" is not implemented).

## Rules as implemented

Court geometry (existing): near baseline z = 0 (host), far baseline
z = −L (guest), centre line z = −L/2, sidelines x = ±W/2, king at
(0, −L/2). The **host half** is z ∈ [−L/2, 0], the **guest half**
z ∈ [−L, −L/2]. A kubb belongs to the half it stands on, not to a player.

1. **Turn = inkast (if any) + 6 batons.** The thrower's *target half* is
   the opponent's half.
2. **Inkast.** At the start of a turn the thrower tosses every kubb
   felled in the previous turn (they come from the thrower's own half)
   onto the target half. **Legal**: resting centre inside the target
   half, lines included (x ∈ [−W/2, W/2], z between the centre line and
   the opponent's baseline). **Illegal** on attempt 1 → the kubb returns
   to the inkast rack for attempt 2. **Illegal on attempt 2** → house
   rule: clamped to the nearest point inside the target half, inset by
   half a kubb footprint from the lines, and raised there.
3. **Raising.** A landed kubb is stood upright where it rests (xz kept,
   yaw kept, y = kubb height / 2). If that footprint would intersect
   another standing piece (centre closer than one kubb footprint
   diagonal), it is nudged along x away from that piece until it
   doesn't. Raised kubbs are **field kubbs** of that half.
4. **Kubbs hit during the inkast** (by a tossed kubb): any field or
   baseline kubb knocked over is raised again in place; no penalty. The
   **king** knocked over by a tossed kubb → the **tosser loses**
   (endReason `kingFelledByInkast`).
5. **Field kubbs first.** During the batons, a field kubb felled on the
   target half counts. A **baseline** kubb felled on the target half
   while any field kubb still stands there is **raised again** and does
   not count.
6. **Own-side rebound** (§3.6): any kubb on the thrower's OWN half
   felled during the thrower's turn is raised again immediately.
7. **Leaning = felled** (§3.4, match only): a kubb at rest counts as
   felled once its tilt exceeds `leaningFelledDeg` (default 20°) —
   physically a kubb can only rest that tilted by leaning on something.
   Solo keeps the per-mode 50°/60° topple angle.
8. **Advantage line.** If field kubbs stand on a side's own half when
   that side's turn starts, a line is drawn across the court at the z of
   the one closest to the centre line and that side's stick rack moves
   onto it. Shown, not enforced (same policy as the baseline today). The
   king must still be thrown at from the baseline — also not enforced.
9. **Win / loss.** King felled during the batons: the thrower wins if
   the target half has no standing kubbs (baseline or field), otherwise
   loses (`kingFelledEarly`) — as today. §4's inkast case above.
10. **Turn end.** After the 6th stick settles and the court is quiet
    (existing RoundSystem), the kubbs felled this turn become the next
    thrower's inkast queue; turn flips; phase = `inkast` if the queue is
    non-empty, else `throwing`.

Solo (`SimpleRulesSystem`) and Advanced solo are unchanged.

## Pure core — `src/core/match.ts` (MatchState v3)

```ts
type MatchPhase = 'inkast' | 'throwing';
interface FieldKubb { kubbId: string; half: MatchSide; x: number; z: number }
interface InkastItem { kubbId: string; attempt: 1 | 2 }
interface MatchState {
  currentTurn: MatchSide;
  phase: MatchPhase;
  baselineKubbs: { host: string[]; guest: string[] }; // standing, by half
  fieldKubbs: FieldKubb[];                           // standing
  felledThisTurn: string[];                          // counted fells, target half
  inkastQueue: InkastItem[];                         // to toss this turn
  winner: MatchSide | null;
  endReason: 'allKubbsAndKing' | 'kingFelledEarly' | 'kingFelledByInkast' | null;
}
```

Transitions return `{ state, effects }` where `effects` is a list of
`{ type: 'raise'; kubbId; x; z }` / `{ type: 'returnToRack'; kubbId }`
instructions for the adapter (same-reference `state` when nothing
applies, as today). Geometry comes in as a plain
`CourtHalves` value built from the preset (`courtHalves(preset)` in
`core/court-layout.ts`).

- `initialMatchState()` — baseline lists from `kubbSide()`.
- `withKubbFelled(state, kubbId, restXZ)` — phase-aware: rules 4–6.
- `withInkastLanded(state, kubbId, restXZ, halves, standing)` — rules
  2–3 (legality, attempt 2, clamp, nudge); switches to `throwing` when
  the queue empties.
- `withKingFelled(state)` — rules 4 and 9.
- `withTurnAdvanced(state)` — rule 10.
- `advantageLineZ(state, side, halves)` → z or null (rule 8).
- `standingKubbs(state)` → `{ host, guest }` counts for the HUD (replaces
  the A–B felled score).
- Pure helpers in `core/inkast.ts`: `isLegalLanding`, `clampIntoHalf`,
  `nudgeClear`.

`core/matchSync.ts` → schema **v3** (v2 rejected with the existing
version-mismatch log). `core/matchSinBin.ts` is removed (the sin-bin row
is replaced by the inkast rack) along with `data/sin-bin.json`.

## Adapters

- **InkastSystem** (new, `systems/inkast.ts`): in phase `inkast` on the
  thrower's client, places the queued kubbs upright on a rack row behind
  the thrower's baseline (`data/inkast.json`: row offset, spacing) and
  adds `OneHandGrabbable` to them; removes it when tossed. On release it
  computes the velocity with `core/throwRelease.ts`
  (`computeThrowRelease`, gains `tossVelocityMultiplier` /
  `tossAngularMultiplier` in `data/inkast.json`, calibrated on headset)
  and applies it like ThrowingSystem does. Rest detection with
  `core/restState.ts`; the **host** feeds the resting position to
  `withInkastLanded`. A guest's toss is relayed to the host with
  `throwRelay` **v2** (`stickId` → `pieceId`, schema bump) and applied to
  the host's copy.
- **Sticks are not grabbable during `inkast`** (the rack is emptied of
  its grab component until the phase is `throwing`), so RoundSystem's
  6-stick accounting is untouched. The HUD shows "Inkast: N kvar".
- **MatchRulesSystem**: drives kubbs from `effects` (raise / return to
  rack) and from state diffs on both clients (the host's pieceSync keeps
  positions authoritative); emits a new `PieceRaised { entityId }`
  event. **ToppleSystem** subscribes and re-arms that piece so it can be
  felled again (today it only re-arms on Reset), and uses
  `leaningFelledDeg` for kubbs while `matchActivity` is on.
- **MenuSystem**: a round-end reset during a match moves **only sticks**
  (kubbs stay where they are — they are field kubbs, inkast items or
  lying felled kubbs).
- **MultiplayerSystem**: `onKubbFelledForMatch` passes the kubb's resting
  xz and applies effects; the king decision uses the phase.
- **Advantage line**: a ground line entity (same material/approach as
  the existing court lines) shown at `advantageLineZ` for the current
  thrower; the thrower's stick rack is moved onto it (MultiplayerSystem
  already moves sticks between racks).
- **HUD**: `standingKubbs` per half in each player's avatar color;
  phase row.
- **Gate probes** (`gateLog`): `inkast landed {kubbId, legal, attempt,
  clamped}`, `kubb raised {kubbId, reason: inkast|inkastHit|earlyBaseline|
  rebound}`, `advantage line {side, z}`, plus `phase` in `match state` and
  the sync snapshot. New gate-report items: `mp4-inkast-legal`,
  `mp4-inkast-retry`, `mp4-inkast-clamp`, `mp4-field-first`,
  `mp4-rebound`, `mp4-advantage`, `mp4-sync-phase` (host/guest agree on
  phase and field kubbs); EYES: "the kubb toss feels right".

## Out of scope

Opponent-placement after two misses (house rule instead), kubb towers,
best-of-3 (gh#21), toss-up for the start (gh#20), enforcement of any
throwing position, solo inkast.

## Testing

- TDD for everything in `core/match.ts` and `core/inkast.ts`: one test
  per numbered rule above, plus v3 matchSync / v2 throwRelay parsing
  (including rejection of v2 / v1).
- Existing MP3a reducer tests are rewritten against v3 (the sin-bin
  assertions go away with the sin-bin).
- Emulator: solo unchanged (a real topple still behaves as before, zero
  errors); two headless Playwright peers: match starts in `throwing`,
  phases and field kubbs agree in the sync check.
- Human gate (Erik, 2 headsets, not self-approvable): the kubb toss
  feel (calibrate the two toss multipliers), a full match with field
  kubbs, via `gate:report`.
