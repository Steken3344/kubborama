# Real kubb rules vs. KubbOrama — gap review (2026-09-06)

Erik's ask: "kolla av reglerna för kubb och se över själva game-enginen
och logiken för hur spelet fungerar på riktigt mot det vi skapat här."
Desk review, no headset needed. Reference ruleset: the Kubb World
Championship (Kubb-VM, Gotland) rules, with the US National Kubb
Championship rules noted where they differ. Where I am not certain of the
exact wording of a rule it is marked _(verify)_ — the intent is right but
the fine print should be checked against the current official PDF before
building on it.

Code reviewed: `src/core/match.ts`, `matchSinBin.ts`, `scoring.ts`,
`court-layout.ts`, `topple.ts`, `underhandClassifier.ts`,
`src/systems/matchRules.ts`, `simpleRules.ts`, `round.ts`,
`multiplayer.ts` (turn/rack handling), `src/data/pieces.json`,
`court-presets.json`, `game-modes.json`, `match.json`.

## 1. What already matches the real game

| Real rule                                                                   | KubbOrama                                                                         | Verdict                                        |
| --------------------------------------------------------------------------- | --------------------------------------------------------------------------------- | ---------------------------------------------- |
| Court 5 m × 8 m, king at centre, 5 kubbs evenly spaced on each baseline     | `tournament` preset 5 × 8; `computeCourtLayout` centres the king, 5 per baseline  | ✓                                              |
| Kubb 7 × 7 × 15 cm, baton Ø4.4 × 30 cm, king 9 × 9 × 30 cm                  | `pieces.json`: 0.07/0.15, r 0.022 × 0.30, 0.09/0.30                               | ✓                                              |
| 6 batons per turn, turns alternate                                          | `STICKS_PER_ROUND = 6`; `withTurnAdvanced` on `Reset{roundEnd}`; rack moves       | ✓                                              |
| Only the throwing team throws                                               | Sticks physically live at the thrower's rack (near/far), so only they can throw   | ✓ (by geometry, not a rule check)              |
| Felling the king before all opponent kubbs = immediate loss for the thrower | `withKingFelled`: `kingFelledEarly` → opponent wins                               | ✓                                              |
| Win = all opponent kubbs down, then the king                                | `withKingFelled` with `opponentCleared` → `allKubbsAndKing`                       | ✓                                              |
| Knocking your own baseline kubb is no penalty; it is raised again           | `withKubbFelled` ignores `kubbSide === currentTurn`; the turn-end reset stands it | ≈ (raised at turn end, not immediately — §3.6) |
| Chain reactions count (kubb felled by a falling kubb / a baton bouncing)    | ToppleSystem is cause-agnostic                                                    | ✓                                              |
| Batons thrown underhand, end over end; "helicopter" throws are illegal      | `classifyThrow` → HUD tint, informational only (PLAN §"later" item 4: opt-in)     | ✓ as designed for the POC                      |
| A kubb in the same throw as the king counts before the king decision        | `kingDecisionGraceS` 1.5 s + `applyPendingKingDecision()` before the turn flips   | ✓                                              |

Piece dimensions, court geometry and the win/loss logic are faithful. The
turn structure is faithful for the **baseline-only** phase of a game.

## 2. The big gap: no field kubbs (fältkubbar / inkast)

> **Implemented 2026-09-26 as MP4** (docs/superpowers/specs/2026-09-26-field-kubbs-design.md),
> with a house rule instead of opponent placement after two missed tosses.

In real kubb a felled baseline kubb is NOT removed from play. At the start
of the next turn the team that lost it **tosses it underhand from behind
its own baseline onto the opponent's half** (the "inkast"). The receiving
team raises it where it landed, and it becomes a **field kubb**. The
attacking team must then fell **all field kubbs on that half before any
baseline kubb**; a baseline kubb felled too early is raised again. Field
kubbs that survive the turn give the defender an **advantage line**: they
may throw their next turn from level with their standing field kubb
closest to the centre line, instead of from the baseline.

This loop — knock, toss back, raise, re-knock — is the whole strategy of
kubb (short tosses clustered near the centre line are easy targets and
push the attacker's line forward; a bad toss gives the opponent a free
placement). Without it a game is a pure accuracy contest that always
takes roughly 10 felled kubbs + king.

KubbOrama (MP3a, Erik's decision 2026-09-05, option "1 — sin-bin") parks
a felled kubb beside the court until the match ends. That was the right
call for a first 2-headset match — it made "match" and "score" exist
with a one-file reducer — and PLAN §"later" item 7 already lists a "full
rules engine (turns, field kubbs, raising, throwing line)". This section
turns that line into something buildable.

### 2.1 Rules to implement (Kubb-VM)

1. **Inkast.** At the start of turn T, the thrower first tosses every
   kubb the opponent felled in turn T-1 onto the opponent's half.
   Underhand, from behind own baseline. Legal landing: inside the
   sidelines, between the centre line and the opponent's baseline (a kubb
   touching a line is in _(verify: Kubb-VM counts "on the line" as in)_).
2. **Two attempts.** A kubb that lands outside is tossed again once. If
   the second toss also misses, the **opponent places it** anywhere on
   their half, at least one baton length (30 cm) from the king and from
   the corner stakes. (US: "one baton length from the king" only
   _(verify)_.)
3. **Raising.** The receiving team stands each field kubb up by tipping
   it onto one of its ends, choosing which end (so the footprint moves
   ≤ 15 cm along the kubb's long axis). It may not be lifted and moved.
4. **Kubbs hit during the inkast.** A tossed kubb that knocks over a
   standing field kubb: both are raised _(verify: Kubb-VM allows the
   receiver to stack them into a "tower" if they touch)_. A tossed kubb
   that knocks over the **king** = the tossing team loses immediately.
   A tossed kubb that knocks a **baseline** kubb: the baseline kubb is
   raised again, no penalty.
5. **Field kubbs first.** During the baton throws, every field kubb on
   the target half must be down before a baseline kubb counts. A baseline
   kubb felled while field kubbs still stand is **raised again** (and does
   not count).
6. **Advantage line.** If field kubbs survive the turn, the defender (now
   the thrower) may throw from an imaginary line level with their standing
   field kubb closest to the centre line. The king must still be thrown
   at from behind the baseline.
7. **Turn end.** After 6 batons, the roles swap and the loop restarts at
   step 1 with the kubbs felled this turn (field + baseline).

### 2.2 How it maps onto the current architecture

Pure core (`src/core/match.ts`), all TDD-able with no physics:

- `MatchState` gains a phase: `'inkast' | 'throwing'`, plus
  `fieldKubbs: { id, side, position: Vec3 }[]` and `inkastQueue: string[]`
  (ids to toss, with an attempt counter). `felledKubbIds` becomes "felled
  this turn" rather than "felled this match".
- `withKubbFelled(state, id)` checks: is it a field kubb on the target
  half → remove from `fieldKubbs`, add to this turn's felled list; is it a
  baseline kubb while `fieldKubbs` on that half is non-empty → return a
  `raiseAgain: id` instruction instead of counting it.
- `withInkastLanded(state, id, position, courtHalfBounds)` → legal →
  becomes a field kubb (position snapped to the raised footprint); illegal
  → attempt 2 or `opponentPlaces: id`.
- `withTurnAdvanced` → phase `'inkast'` if anything was felled, else
  straight to `'throwing'`.
- `advantageLineZ(state, side)` → the z of the standing field kubb closest
  to centre on that side, or the baseline.
- `score()` for the HUD can stay "kubbs standing" per side; a running
  A–B score stops being meaningful once kubbs come back (see §3.3).

Adapters:

- `MatchRulesSystem` already teleports kubbs by diffing state
  (`sinBinPlacements`); the same diff drives **raising** (set the kubb
  upright at `fieldKubbs[i].position`) and **raise-again** of an early
  baseline kubb. The sin-bin row becomes the **inkast queue**: the kubbs
  to toss sit in a rack at the thrower's baseline, grabbable, and a
  `Settled` on a kubb during phase `'inkast'` feeds `withInkastLanded`.
- Landing legality is a pure function of the resting position and the
  court preset — `core/court-layout.ts` already knows the half.
- **Advantage line** in VR: foot position is not tracked (QUESTIONS.md
  "baseline foul warning" has the head-minus-30-cm approximation). Same
  policy as the underhand classifier: **show, don't enforce** — draw the
  line on the ground where the thrower may stand; leave enforcement to
  the players. The stick rack can move to that line so the affordance is
  physical, exactly as it moves between baselines today.
- **Opponent places** after two failed tosses: the defender grabs the
  kubb and puts it down; legality (≥ 30 cm from king/stakes, on own half)
  is again a pure check on the settled position, with a HUD nudge if
  illegal rather than a hard block.
- Network: `matchSync` v3 with the phase and the field-kubb list; kubb
  positions are already in `pieceSync`, so raising on the guest is just
  the host's authoritative snapshot.

Solo (`SimpleRulesSystem`) keeps its sin-bin + protected king — there is
no inkast against yourself. Advanced solo stays free-throw.

Rough size: comparable to MP3a (core reducer + tests ~1 day, adapter and
rack/queue UX ~1–2 days, 2-headset gate). It is the single change that
makes KubbOrama a kubb game rather than a kubb-themed target range.

## 3. Smaller gaps and deviations

### 3.1 Who starts — "kasta om kungen"

Real: each team throws one baton at the king from its baseline; the team
whose baton lands closest **without felling it** starts. _(Kubb-VM: if a
team fells the king in the toss-up, the other team starts — verify.)_ In
a best-of series, the loser of the previous game starts the next
_(verify)_. KubbOrama: the host always starts, including every auto
restart. Cheap fix in the reducer (`initialMatchState(startingSide)`);
the toss-up itself is a small phase before `'throwing'` (both throw one
baton, distance to king from `Settled` positions — pure).

### 3.2 Opening turn with 4 batons

US National rules limit the **starting team's first turn to 4 batons**
so the opener is not a decisive advantage. Kubb-VM does not _(verify)_.
Offer as a house-rule toggle in `match.json` (`openingBatons: 6 | 4`);
`RoundSystem`'s completion check reads `STICKS_PER_ROUND` today, so it
would need a per-round stick count from match state.

### 3.3 Score display

Real kubb has no running score; a game is won or lost, and a match is
typically **best of three games** (Kubb-VM knockout; group stages vary).
KubbOrama shows a football-style `A – B` count of felled kubbs (Erik's
choice, option 3). Once field kubbs come back into play (§2) the felled
count goes up and down, so the natural display becomes **kubbs standing
per side** during a game and **games won `1 – 0`** across a best-of-3.
Suggest keeping `score()` but redefining it then, not now.

### 3.4 "Felled" definition and leaning kubbs

Real: a kubb that has been knocked from its standing position counts as
felled even if it comes to rest **leaning against a baton or another
kubb** _(Kubb-VM wording — verify; US rules agree)_. KubbOrama:
`isToppled` needs tilt > 50° (simple) / 60° (advanced) after resting.
A kubb leaning on a stick at 35° counts as standing here and as felled on
a real pitch. Practical fix: lower the threshold for a kubb whose contact
set includes a stick/kubb, or simply treat any resting kubb whose
footprint is not flat on the ground (tilt > ~15°) as felled. The 50/60°
values were tuned for the free-standing wobble case; a "leaning" branch
is a small addition to `core/topple.ts` and worth a test on the recorded
golden throws.

### 3.5 Throwing position

Real: feet behind the baseline (or advantage line), inside the sidelines;
a baton must be thrown **one at a time**. KubbOrama enforces nothing
about position (tracked in QUESTIONS.md as a future warning) and allows
holding a stick in each hand. Two-handed simultaneous throws are
physically possible here and impossible in the real game; a soft rule
("second stick waits until the first has settled") would also simplify
`RoundSystem`'s attribution edge case (multi-stick-in-flight
over-credit, documented in its class comment).

### 3.6 Own-side kubb knocked by a rebound

Real: raised again immediately, no penalty. KubbOrama: ignored by the
reducer but physically stays lying until the turn-end reset. For the
rest of the turn it is a visual "felled" kubb that can shield the ones
behind it. `MatchRulesSystem` can raise it on the spot via the same
`setBodyTransform` it uses for the sin-bin (one more diff case).

### 3.7 Tossed kubb fells the king

Only relevant after §2 exists: during the inkast a kubb that fells the
king is a loss for the tosser. `withKingFelled` today only knows "the
thrower"; in phase `'inkast'` the thrower IS the tosser, so the same
branch works once the phase exists. Worth a test.

### 3.8 Court presets

`backyard` 3 × 6 and `kids` 2 × 5 are house sizes (the official court is
5 × 8 only; Kubb-VM allows 5 × 8 exclusively). Fine as game modes; the
`tournament` preset is what a rules-complete match should default to,
and gh#15 (host/guest different presets) becomes rule-relevant then.

### 3.9 Things the real game has that a VR 1v1 does not need

Team rotation (each player must throw at least one baton), time limits,
referee calls, weather — none apply to a two-headset match.

## 4. Recommendation

1. **Field kubbs + inkast + raising (§2)** as the next milestone (MP4).
   It is the identity of the game; everything in §3 is polish next to it.
   Erik's sin-bin decision was explicitly a "first 2-headset match"
   choice, not a design end state.
2. Fold **§3.6 (raise own-side kubb)** and **§3.4 (leaning = felled)**
   into MP4's reducer/topple work — both are tiny and both change what
   "felled" means, so they belong in the same headset gate.
3. **§3.1 toss-up for the start** + loser-starts-next as a small follow-up.
4. **§3.3 best-of-3 with games-won score** once §2 is in, because the
   running felled count stops making sense at that point.
5. Leave **§3.5 position rules** and **§3.2 four-baton opener** as
   opt-in house rules — "show, don't enforce" is the POC's stance and it
   holds up.

Filed as GitHub issues (label `feature`, `[rules]` prefix); see
docs/DECISIONS.md 2026-09-06.
