# KubbOrama — session log

Timestamped, append-only. Read top-to-bottom (oldest first) to catch up
cold.

## 2026-08-27 — Session 1 (M0 setup)

- Preflight check run: node v22.23.2, npm 10.9.8, git 2.43.0, adb
  1.0.41, gh 2.96.0 (authed as Steken3344) all present and in range;
  blender/godot not installed (optional, warn-only). context7 and
  chrome-devtools MCP already connected; IWSDK MCP servers not yet
  present (expected pre-scaffold). Full table in docs/DECISIONS.md.
- Checkpoint commit of the pre-authored planning docs (CLAUDE.md
  placeholder, start prompt, DERISK findings, plan, rules reference,
  Godot plan, SESSION_KIT) before scaffolding, so the scaffold's
  `--force` overwrite step had a clean diff to fall back to.
- Scaffolded IWSDK **in place** at the repo root (not a nested
  `kubborama/` folder — the repo root already _is_ the target repo; see
  docs/DECISIONS.md): `npm create @iwsdk@latest . -- --yes --target vr
--language ts --physics --no-locomotion --install --no-git --force`.
  Verified `iwsdk.config.json` has `physics: true`, `locomotion: false`
  directly from the flags — no manual post-scaffold JSON edit needed
  (an improvement on the DERISK-documented workaround, CLI v0.5.3 now
  exposes the flags directly).
- Merged KubbOrama project rules (from the pre-authored
  CLAUDE_MD_ADDITIONS.md) into the scaffold-generated CLAUDE.md, rather
  than overwriting it — kept the IWSDK-specific guidance intact.
- Document decomposition: `docs/PLAN.md` (from
  IMPLEMENTATION_AND_ASSETS.txt), `docs/MILESTONES.md` (from
  SESSION_KIT), `docs/RULES_REFERENCE.md` (from KUBB_RULES_REFERENCE.md),
  `docs/GODOT_PLAN_B.txt`, `docs/sessions/M1.md`-`M6.md` (from
  SESSION_KIT) all moved into place; `docs/DECISIONS.md` seeded from
  DERISK_FINDINGS.txt plus this session's autonomous decisions and
  preflight results; `docs/QUESTIONS.md` and this file created new. Root
  copies removed once represented in `docs/` (DERISK_FINDINGS.txt,
  CLAUDE_CODE_START_PROMPT.txt, GODOT_PLAN_B.txt, KUBB_RULES_REFERENCE.md,
  IMPLEMENTATION_AND_ASSETS.txt, SESSION_KIT/) — never keeping two
  copies of the same knowledge.
- Added `assets/raw/` to `.gitignore` ahead of M1's fetch-assets.sh.
- Wired dev tooling: `tsconfig.json` gained `noUncheckedIndexedAccess`
  - `exactOptionalPropertyTypes`; installed eslint 10 + typescript-eslint
    8 (flat config, `no-explicit-any: error`) + prettier 3 + vitest 4;
    added `lint`/`format`/`format:check`/`test` npm scripts. `npm test`
    passes with `--passWithNoTests` (no pure-core code exists yet — that
    starts in M1).
- Verified `npx iwsdk dev status` serves HTTPS out of the box (no
  `@vitejs/plugin-basic-ssl` needed); used the IWSDK CLI directly
  (`browser screenshot`, `xr enter`/`status`/`exit`) to confirm the
  emulator scene renders and a simulated XR session works, without
  waiting for a Claude Code restart — see docs/DECISIONS.md.
- Added `.github/workflows/ci.yml` (typecheck+lint+format+test+build on
  every push/PR) and `.github/workflows/deploy.yml` (GitHub Pages via
  Actions); enabled Pages with `build_type=workflow` via `gh api`; set
  repo description/topics/homepage; created the four issue labels
  (bug/feature/tech-debt/follow-up).
- Rewrote README.md (scaffold had overwritten it): play URL, dev
  commands, the three Quest 2 testing methods with the verified HTTPS
  finding folded in.
- Updated docs/MILESTONES.md M0 checkboxes for everything above.

Committed (67dc9cb, be16e25, 1a57a44, 37ec12d) and pushed. Both
GitHub Actions workflows (CI, Pages deploy) went green on every push;
https://steken3344.github.io/kubborama/ verified live (HTTP 200,
assets load).

Milestone review gate run in full: mechanical pass green, fresh-eyes
subagent review (GO, two low-severity findings — one fixed
immediately, one filed as
[gh#1](https://github.com/Steken3344/kubborama/issues/1)), adversarial
pass on the CI gates themselves (confirmed lint/format/typecheck/test
all genuinely fail on a violation, not no-ops). Full writeup in
docs/DECISIONS.md.

**M0 headset gate: PASSED.** Erik opened the deployed URL on the Quest
2, "Enter XR" worked, landed in the default IWSDK demo room (expected
pre-M1). Restarted Claude Code in this directory afterward —
`iwsdk-runtime`/`iwsdk-reference` connected; `metavr` cannot connect on
Linux (no linux-x64 binary shipped — permanent, documented in
docs/DECISIONS.md, not expected to block anything). Tagged `v0.1-m0`.

## 2026-08-27 — M1 (Scene), same session, continued per Erik's request

Erik asked to continue straight into M1 rather than start a fresh
session — CLAUDE.md's "one milestone per session" is a memory-hygiene
guideline, not a hard rule, and the full M0 context was already loaded,
so this was the more efficient path here.

Read `docs/sessions/M1.md`, `docs/PLAN.md` §§1-4, and the M1 checklist,
then built M1 per plan:

- `src/core/rng.ts` + `src/core/court-layout.ts` (TDD, tests first) —
  pure court-geometry math: king at court center, 5 kubbs evenly spaced
  along the far (short) baseline, 4 corner stakes, 6 sticks scattered
  near the player baseline via a seeded RNG. The very first version of
  this code had a real bug (king placed at the far baseline instead of
  court center) that the tests caught before it ever reached a scene.
- `src/config.ts` + `src/data/{court-presets,pieces,camera-poses}.json`
  — court presets (backyard/tournament/kids), material-density-derived
  piece masses (verified against the documented ~0.29/0.47/1.45 kg
  figures), named camera poses.
- Downloaded M1's CC0 assets via `fetch-assets.sh` plus a direct-URL
  fetch for Kenney Nature Kit (found the real download link by reading
  the kenney.nl page, verified with a HEAD request before trusting it);
  logged everything in `ASSETS.md`.
- `src/scene-assets/*.ts` — procedural ground/kubb/king/stick/stake
  geometry sharing material instances, registered in `src/assets.ts`
  alongside 5 Kenney tree glTFs and a fence section; stripped the
  scaffold's robot/panel demo content entirely.
- `public/scenes/main.iwsdk.scene.json` — the full garden composition,
  authored per the `iwsdk-scene-composer` and `iwsdk-physics` skills
  (both invoked per CLAUDE.md's routing rule before hand-authoring).
- Found and fixed two real bugs via runtime verification (not just the
  editor preview, which doesn't run `PhysicsSystem`) — full detail in
  docs/DECISIONS.md: (1) `DomeTexture`/`IBLTexture` `src` needed the
  full `textures/` relative path, not a bare filename; (2) the stick
  asset's "lying flat" rotation was baked into its geometry, which
  desynced the visual mesh from its physics collider (collider stood
  upright while the mesh lay flat) — fixed by moving the full
  orientation to the scene node's transform instead.
- Milestone review gate run in full (mechanical, fresh-eyes subagent,
  adversarial — long-run physics stability + a 600-combination layout
  stress test across all 3 court presets). One fresh-eyes finding
  (scene JSON has no automated guard against drifting from
  `config.ts`) fixed immediately with `src/scene-sync.test.ts`. GO, no
  blockers. Full writeup in docs/DECISIONS.md.

**Handover.** M1 is code-complete, self-verified in the emulator via
MCP (screenshots + `ecs_pause`/`ecs_step`/`ecs_query_entity` physics
inspection), and CI is green. No headset gate required for M1 (that's
M0/M2/M5 only). Tag `v0.2-m1` and start M2 (throwing — the big one)
fresh per docs/sessions/M2.md.

## 2026-08-27 — M2 (Throwing), same session, continued per Erik's request

Built per docs/sessions/M2.md: `core/throwRelease.ts` (frame-averaged
recency-weighted hand velocity + lever-arm v_com = v_hand + ω×r, TDD
with an explicit "classic VR throwing bug" regression test),
`core/quat.ts` (angular velocity between two orientations, incl. the
double-cover sign flip), the event bus (`core/events.ts`), impact
detection (`core/impactDetector.ts`), a haptics library
(`core/haptics.ts`), an underhand/flip-quality classifier
(`core/underhandClassifier.ts`), the stick state machine
(`StickState`: Racked→Held→Flying→Settled), `ThrowingSystem` (the
adapter wiring all of the above to `PhysicsManipulation` on release,
with the end grip emerging from the live grab point rather than a
hardcoded offset), `ImpactSystem`, and a full desktop tweakpane tuning
lab (8 params as 0-100 sliders, ballistic target bands, presets A/B/C,
JSON export/import, zod-versioned telemetry persisted to
localStorage). 77 tests across 15 files by the end of the build.

Mid-build, two urgent interruptions were handled inline: pushing
everything so Erik could test on GitHub, then a critical **blank
production site** report (both desktop and Quest). Root-caused via git
worktree bisection (not guesswork) to a top-level `await
World.create(...)` in `src/index.ts` breaking Vite/Rollup's production
bundling (silent hang, dev mode tolerated it fine) — full writeup in
docs/DECISIONS.md. Fixed, and permanently guarded with a new
`scripts/smoke-test.mjs` CI step (serves the real production build in
headless Chromium, checks for a non-empty scene) — verified to
actually catch this regression class by re-introducing the bug and
confirming the smoke test fails.

Milestone review gate: mechanical pass green, fresh-eyes subagent
review (no blockers, two nitpicks fixed immediately — a dead config
value and an un-pooled per-frame allocation in `ImpactSystem`), my own
adversarial pass (simultaneous two-hand grab/release with zero pose
samples — clean).

**Erik then played the build and sent structured feedback**, addressed
in the same session (all reversible, all within M2's own scope) rather
than filed for later — full technical writeup in docs/DECISIONS.md:

- Kubbs on both baselines (10 total — docs/PLAN.md's always-deferred
  full set, not new scope).
- Gravity -10% (a data-only tuning-default change).
- New B-button reset menu (`MenuSystem` + `reset-menu.uikitml`,
  Horizon-kit panel) — verified live end-to-end (teleported a stick
  away, clicked Reset via emulated ray+select, confirmed it returned
  to its spawn pose).
- Ground/stick settling fixed at the root cause: the tuning system was
  silently zeroing a sane baked-in angular-damping value every load;
  fixed the actual default instead of papering over the symptom.
- Grab-range highlight (`GrabHighlightSystem`, using
  `@iwsdk/core`'s own documented `RayInteractable`+`Hovered` pattern).
- A handful of Kenney rocks around the garden (metavr doesn't run on
  this Linux box; reused the Nature Kit archive already on disk from
  M1's manual download instead).

**Found and fixed a real regression while verifying the kubb change:**
the first near-baseline kubb placement sat inside the stick-scatter
zone; with the fixed seed, a scattered stick spawned overlapping a kubb
and Havok's overlap-resolution impulse launched it clean through the
(too-thin, 0.02 m) ground — reproduced on a fully clean server restart,
so a real bug, not a testing artifact. Fixed both the immediate trigger
(moved the kubb row) and the underlying fragility (thickened the ground
collider to 1 m) — verified stable across five clean reloads.

Left-hand grab (Erik: only right hand seems to work) investigated but
not reproduced in the emulator — logged in docs/QUESTIONS.md rather
than guess-fixed. A "klonk" sound on stick-vs-stick contact
([gh#4](https://github.com/Steken3344/kubborama/issues/4)) and a
pre-existing cyan-tinted autumn-tree texture bug noticed while adding
rocks
([gh#3](https://github.com/Steken3344/kubborama/issues/3)) were filed
rather than built/fixed now — no audio system exists yet (M5 scope),
and the texture bug predates this session entirely.

**Handover.** M2 is code-complete including a full round of live
feedback, mechanical checks all green (tsc/eslint/prettier/vitest/
build/smoke), and pushed. **Still blocks tagging `v0.3-m2`:** Erik's
real headset calibration gate (10-15 flat + 10-15 backspin throws,
recorded feedback) — a human gate, never self-approved even
autonomously. Next: continue straight into M3 (toppling, rounds &
stats) per Erik's explicit instruction, without waiting for that gate.

## 2026-08-27 — M3 (Toppling, rounds & stats), same session, continued per Erik's instruction

Erik sent one more round of feedback (both-hands grab, a stick-clash
"klonk" request, and wanting a livelier garden) then said to keep going
through the milestones without checking in further, and went to bed.
Handled that feedback first (folded into the M2 writeup above and
docs/QUESTIONS.md/gh#3/gh#4), then started M3 per docs/sessions/M3.md.

Built per plan, TDD throughout: `core/topple.ts` (tilt angle from a
quaternion, yaw-independent by construction), `core/restState.ts`
(extracted the rest-detection predicate that was inline in
`ThrowingSystem` — needed a second time, so DRY says share it, and
`ThrowingSystem` was refactored to match), `core/scoring.ts` (a 6-stick
round reducer driven by synthetic event sequences, exactly as
docs/sessions/M3.md asked), `core/stats.ts` (personal bests + lifetime
totals, versioned zod schema persisted to localStorage — same pattern
as M2's telemetry store). Adapters: `ToppleSystem` (kubbs+king only,
emits `KubbFelled`/`KingFelled` once each via a new `KingPiece` tag
component), `RoundSystem` (drives the reducer from events the throw
pipeline already emits, emits `RoundEnded`), `StatsSystem` (records
it), `HudSystem` (an always-visible scoreboard panel — round number,
last round's felled count, personal best — updated purely by events,
no polling). The menu's manual reset button and the round-end
auto-reset now share one implementation, triggered two ways through
the event bus.

Verified live in the emulator, not just unit tests: a single real
stick swing (built via chained `xr_animate_to` calls, not a "release"
throw) knocked over 3 kubbs — `ToppleSystem` correctly fired
`KubbFelled` for each with zero false positives. Finishing that round
produced a correct `RoundEnded`, recorded stats, and an auto-reset, all
visible on the HUD. A second, more aggressive swing reached across the
whole court and felled all 10 kubbs _and_ the king in one motion — the
maximum-possible round (11/11) — which the reducer, stats, and HUD all
handled correctly (`Rekord: 11/11` rendered live). Found one honest,
non-bug edge case along the way: pieces can be knocked over by a stick
that's still _held_ (mid-swing, before its `Thrown` event fires), which
the reducer faithfully records as "felled in zero thrown sticks" — not
a bug, just something worth knowing about if a later milestone adds
stricter rules. Full detail in docs/DECISIONS.md.

Mechanical pass green (tsc/eslint/prettier — 109 tests now, up from
77 — /build/smoke). Fresh-eyes review found one real blocker: a manual
reset mid-round (the pre-existing menu button) never cleared
`RoundSystem`'s round-scoped state, so a kubb felled before that
reset could be silently swallowed by the reducer's own double-count
guard when felled again, and stale data could leak into the next
`RoundEnded`. Fixed now, per CLAUDE.md's "foundation-breaking findings
are fixed NOW, never filed" — a manual reset abandons the in-progress
round and restarts at the same round number (decided autonomously,
logged in docs/DECISIONS.md, since Erik was asleep). Re-verified live:
felled 9 kubbs, reset mid-round, confirmed they stood back up and
could be re-felled without being dropped, then completed that round
for real and got a clean, uncorrupted result. Two smaller worth-fixing
items (a per-frame allocation, a duplicated velocity-read block) fixed
alongside it. Full writeup in docs/DECISIONS.md.

**Handover.** M3 is DONE — tagged `v0.4-m3` (no headset gate for this
milestone). Both M2 (`v0.3-m2`, still pending Erik's headset
calibration) and M3 are now complete-or-gated as far as this session
can take them. Next: M4 (wind, tunables & settings) per
docs/sessions/M4.md, or pause here — Erik is asleep and gave a broad
"keep going" instruction with no explicit ceiling, so the call on how
much further to push in one unattended stretch is judgment, not a rule
already settled.

## 2026-08-27 — M4 (Wind, tunables & settings), partial — same session

Continued straight into M4. Built, TDD'd, and verified live: wind
(`core/wind.ts` + `WindSystem`, force on Flying sticks only — checked
the official Buoyancy-pattern reference doc first to confirm
`PhysicsManipulation` with only `force` set never touches the stick's
real velocity, which very nearly went in wrong); i18n (`core/i18n.ts`,
a typed translator over sv/en dictionaries) and settings
(`core/settings.ts`, versioned zod schema, localStorage-persisted,
same pattern as M2/M3's stores) with `SettingsSystem` owning both;
game mode (Simple/Advanced) now drives topple angle and wind live,
the same way M2's tuning lab drives gravity; language and game-mode
toggle buttons added to the existing menu, with every existing
UIKitML string (menu, HUD) retrofitted through the translator.

**Chased the åäö font bug to its actual root cause this time** (M2 and
M3's entries above document two earlier attempts and a workaround) —
`@pmndrs/uikit`'s TTF-to-MSDF loader hardcodes an ASCII-only bake
charset with no way for UIKitML to override it. Confirmed by reading
the library source end to end, not guessed. Filed as
[gh#5](https://github.com/Steken3344/kubborama/issues/5) with the two
real fix paths for whoever picks it up; the sv/en dictionaries just
avoid those glyphs, now guarded by a regression test.

Verified live: language toggle flips every label on both panels
(screenshots); game-mode toggle flips correctly too (took a few
attempts to physically aim the emulated ray — the panel got taller
once a third button was added, so earlier sessions' y-coordinates
stopped landing on the same buttons; a CLI aiming issue, not a code
one); wind runs error-free through a full flight in Advanced mode.

**Stopped deliberately before the full milestone.** The settings
_model_ now supports everything M4 asks for (volumes, haptics
intensity, profile name, court lines), but the actual settings-panel
UI (sliders, stats tab, profile-name prompt, court-lines rendering),
the dev debug panel's wind knobs, and re-laying-out the court when
game mode changes are not built. After two complete milestones in one
unattended session, a player-facing settings panel felt like exactly
the kind of design-facing work worth Erik's eyes before going further,
rather than guessing at layout/wording alone at 1am. Full detail and
the full cut list in docs/DECISIONS.md and docs/MILESTONES.md.

Mechanical pass green throughout (tsc/eslint/prettier/vitest — 125
tests now, up from 109 — /build/smoke). Fresh-eyes review of this
slice found no blockers — independently re-confirmed the one thing
this session was most worried about (WindSystem never touches a
flying stick's real velocity) and the settings/i18n singleton
init-ordering. Two worth-fixing items (a per-frame allocation in
WindSystem, missing test coverage for two config.ts getters) fixed
immediately; full writeup in docs/DECISIONS.md.

**Handover.** M4 is genuinely in progress, not done — no tag yet, and
this is a deliberate stopping point for this session. Next: either
finish M4's settings panel (music/SFX sliders, haptics toggle control,
profile-name prompt, stats tab, court-lines toggle+rendering), or
address gh#5 (the åäö font-atlas root cause) properly, or move to a
fresh milestone — whichever Erik prioritizes. Everything built so far
(M2's feedback pass, M3 in full, M4's core slice) is committed,
tested, reviewed, and documented; nothing is left half-applied.

## 2026-08-28 — M4 (Settings panel), same session, continued autonomously

Erik answered the batched questions from the previous entry via
`AskUserQuestion`: build everything (haptics control, stats tab,
profile name, music/SFX volume, court-lines toggle+rendering now), as
a new tab in the existing B-menu (his recommendation), and move both
the reset-menu panel and the HUD further from the player — his own
words, they sat "väldigt nära". He then handed off mid-session ("nu
drar jag till jobbet men kör på så långt du kan") — explicit
permission to keep building solo.

Built the full approved scope: `reset-menu.uikitml` rewritten to
three tabs (Meny/Alternativ/Statistik); every new control follows the
existing "Button that cycles/toggles on click" convention, not a
native Toggle/Slider/Input (unverified event-wiring risk, not worth
repeating this session's earlier font rabbit hole over); court lines
as a new tag component + system, purely visual; both panels moved and
scaled up per Erik's feedback; `StatsSystem` moved earlier in the
registration order so the new Statistik tab can read it synchronously.

Verified live in the emulator via a position-matched ray-aiming
technique (controller position = headset position, calibrate the
look-at target from headset screenshots, reuse it for the controller)
— confirmed tab switching, every settings button, and (via a direct
`ecs_set_component` write rather than a live click) court-lines
rendering. Two controls — "Planlinjer" and "Statistik", both at panel
edges — never landed via ray-aiming despite many attempts; accepted as
a documented gap, verified instead by code-pattern identity with
sibling controls that were click-tested. Also recorded a testing
lesson: "Planlinjer" briefly looked entirely missing from the
rendered panel — it wasn't; the screenshot just wasn't framed far
enough down to show the true last row. Full detail in
docs/DECISIONS.md.

Dispatched a fresh-eyes review (`iwsdk-project-code-reviewer`
subagent) before tagging. It found one real, confirmed bug:
`nextVolumeStep`'s modulo arithmetic assumed the current value was
already grid-aligned, but the real default is 70% — the old sequence
could reach 120%, outside the settings schema's valid range, which
would have silently reset every setting (not just the one field) on
next load via `decodeSettings()`'s whole-object `safeParse` fallback.
Fixed with a "smallest grid step greater than current" scan and
re-verified live through a full cycle (70→75→100→0). Two smaller
suggestions from the same review (a duplicated `/11` piece-count
literal in the stats i18n string, and two event unsubscribes that
should live in `this.cleanupFuncs` rather than a hand-rolled
`destroy()`) were folded in too.

Mechanical pass green throughout (tsc/eslint/prettier/vitest — 127
tests, up from 125 — /build/smoke).

**Handover.** M4 is DONE and tagged `v0.5-m4` — no headset gate for
this milestone. Everything from this session (M2's feedback pass, M3,
and all of M4) is committed, tested, reviewed, and documented. Next:
either M5 (polish & performance, has a headset gate) or gh#5 (the
åäö font-atlas root cause) — whichever Erik prioritizes when he's
back. Known open items carried forward: game-mode switching still
doesn't re-lay-out the court to the new preset's dimensions (noted in
docs/MILESTONES.md); the dev debug panel's wind knobs were never
built (low priority); the M2 headset feel-calibration gate is still
outstanding and blocks tagging `v0.3-m2` retroactively (M2's code has
shipped inside every subsequent tag, but the tag itself waits on
Erik's real-headset throws, per docs/MILESTONES.md).

## 2026-08-28 — M5 slice 1 (Audio), same session, continued autonomously

Erik: "kör vidare så långt du nu kan" — continued past M4 straight
into M5's Audio section.

Sourced CC0 SFX/music without a headless browser available (no Chrome
binary in this environment, so `chrome-devtools` MCP couldn't help):
Kenney Impact Sounds + UI Audio via their real (if hash-bearing)
direct download URLs, verified with `curl -I` before trusting them;
OpenGameArt.org for ambience and music after Pixabay (PLAN.md's
original pick) turned out to sit behind a Cloudflare bot challenge
that blocked even a plain `curl`. Built `ImpactSystem` classification
by impacting-entity-type + force tier (no pairwise contact info
exists — same root cause as M2's "no collision API" finding),
`SfxSystem` for felled/ambience/music, and closed a real gap:
`kubbFelled`/`kingFelled`/`roundCleared` haptics were defined back in
M3/M4 but never fired anywhere.

**Found a real, pre-existing bug while building this**: reading
console logs closely on a genuine hard reload (rather than reusing an
already-running session, which is how prior milestones tested)
surfaced every kubb and the king "felling" within a few seconds of
every fresh load, before the player could possibly interact — silently
corrupting round 1's scoring state until the player's first real
throw. Root-caused via `ecs_pause`/`ecs_step` frame-stepping as a
physics-warm-up timing issue (Havok's WASM stabilizing over several
real frames, not just one glitchy sample) compounded by a
wall-clock-comparison bug in the rest-duration check. Fixed both:
`accumulateHeldDuration` (per-frame-capped delta accumulation,
core/restState.ts) plus a startup grace window
(`core/startupGrace.ts`) before either `ToppleSystem` or `ImpactSystem`
reacts to anything. Verified live via repeated reloads (6/6 clean with
both fixes in place) and via controlled frame-stepping that legitimate
topple detection still fires correctly. Full investigation, including
the honestly-stated residual uncertainty about Havok's exact internal
behavior, in docs/DECISIONS.md.

Mechanical pass green throughout (tsc/eslint/prettier/vitest — 148
tests, up from 140 — /build/smoke). Also noted and worked around a
dev-server quirk: the scene editor silently re-serializes
`main.iwsdk.scene.json` (no content change, just reformatting) just
from being open during a session — caught twice via `git diff --stat`
and reverted both times.

**Handover.** M5 is genuinely in progress: audio + the topple-bug fix
are done, but GC/pooling and the Quest 2 72Hz check (needs a real
headset + adb) are not. Also mid-session, Erik sent fresh feedback from
his own testing (in Swedish): a version number visible in the settings
menu; the ability to hand a held stick from one hand to the other
(currently the second hand can't "take over" a held stick); sticks
still roll a short distance on grass after landing (wants this
reduced/eliminated); the settings panel is a bit too large. Not yet
addressed — next up.

## 2026-08-28 — Fresh-eyes fixes + Erik's second feedback round, same session

Fresh-eyes review of the audio slice caught one real config bug before
it shipped: the `stickSoft` SFX tier was mathematically unreachable
(the impact-detection floor and the tier threshold were the same
number). Fixed, plus added a regression test that checks the two JSON
files stay consistent with each other — the kind of cross-file
assumption a unit test on the pure function alone can't catch.

Then addressed Erik's second feedback round in full:

- **Version indicator**: `git describe` baked into the build, shown in
  the settings menu.
- **Cross-hand handoff**: built `HandoffSystem`, and in the process
  learned something real about the framework — physical-squeeze grab
  capture happens outside the ECS system-update loop entirely, so no
  system priority trick makes a single squeeze both release the old
  hand and grab with the new one. Shipped the honest version: squeeze
  once to release, squeeze again to grab. A real improvement over
  "impossible" but not literally seamless — documented plainly rather
  than oversold, including the deeper fix (hooking `@pmndrs/handle`'s
  internals directly) that wasn't attempted.
- **Stick rolling**: traced to a single tuning value
  (`angularDampingInFlight`) that — despite its name — governs a
  stick's rotation throughout its whole lifecycle, not just flight,
  because nothing marks it "landed" separately from "at rest."
  Raised the default from 25% to 45%. This is a felt-physics change
  neither the emulator nor I can fully judge — flagged for Erik to
  confirm on the headset, and noted that the same slider is already
  live-adjustable in the desktop tuning panel if 45% isn't right.
- **Settings panel size**: scaled down 1.15→0.85, confirmed visually
  in the emulator.

Mechanical pass green throughout (149 tests, up from 148 —
tsc/eslint/prettier/vitest/build/smoke). Scene-editor auto-resave
quirk (noted last entry) checked for again before staging — clean this
time, just the one intended `scale` line.

**Handover.** M5's audio slice plus this feedback round are both done
and reviewed. Still open in M5: the GC/pooling pass and the Quest 2
72Hz check (needs Erik's headset + adb). The stick-rolling fix and the
two-press handoff both want Erik's real-headset judgment before being
called fully settled — flagged, not silently assumed correct.

## 2026-08-28 — Erik edits the scene himself, then real-headset feedback

Started the dev server with `--open` so Erik could use the managed
scene editor directly. He repositioned the fence/HUD/menu panel,
adjusted the sun, and added two rocks — then asked me to test his
save and push it. Diffing an editor-saved scene file against git
requires normalizing both sides first (`jq -S`) since the editor
reformats the whole ~1600-line file on every save; the real diff
underneath was small. Found and reverted two accidental changes
before pushing: the ground had jumped up 0.49m (visibly a floating
platform, and it buried every kubb — confirmed accidental since only
`ground` and one single kubb had moved, not all ten), and the sun's
color/intensity had reset to generic defaults while its position
moved for real. Kept everything else, including a call I made without
asking: restoring the sun's tuned color while keeping the new
position, on the read that a flat grey light isn't a plausible
deliberate choice.

Then Erik tested the deployed build on his actual Quest 2 — the first
real-headset session since M2 — and sent five pieces of feedback.
Addressed four of them (the fifth, "ljudet är bra", needed no action):

- Throw feel had regressed to "sluggish" since M1/M2. This was my own
  fault from earlier this session — I'd raised angular damping to fix
  ground-rolling, not realizing that value governs a stick's rotation
  for its ENTIRE lifetime, in flight and on the ground alike, with no
  existing way to tell those two apart. Reverted the regression and
  rebuilt the rolling fix properly: a new system now checks each
  stick's height and vertical speed every frame and only boosts
  damping once it reads as actually landed.
- Court lines: added the missing center line (the king's row), which
  needed zero new code since the existing toggle system already
  queries generically by tag.
- Trees and rocks had no collision at all — added static colliders to
  all 13 of them.
- The big one: Erik reported that the ground _feeling_ right (setting
  its height to 0) made every kubb fall over at boot, and correctly
  guessed these were connected. They were: the ground's visual plane
  and its physics collider had disagreed by 0.49m since an M2 fix that
  only checked the physics side. Split them into two nodes — one
  purely visual, one purely physical — so both can be correct at the
  same time. This is exactly the kind of bug an embodied headset view
  reveals immediately and a flat screenshot review never would have
  caught; logged plainly as something this project's mostly-emulator
  verification loop structurally can't substitute for.

Mechanical pass green throughout (149 tests — tsc/eslint/prettier/
vitest/build/smoke). Live-verified in the emulator: clean boot across
several reloads, the ground/kubb resting alignment, the grounded-
damping branch reading back correctly, and the new center line's
placement via a forced-visible screenshot.

**Handover.** All five of Erik's feedback items from this real-headset
session are addressed (four fixed, one — audio — already good). The
ground/visual-physics split in particular was a genuine, previously-
invisible bug that's now fixed at the root rather than papered over.
Remaining in M5: GC/pooling pass, the Quest 2 72Hz check. Next real
step is Erik re-testing all of this on the headset — throw feel,
rolling, the new collisions, and the floating fix — since none of it
can be fully confirmed from this side.

## 2026-08-28 — Erik reports one more issue, then the M5 GC/pooling pass

Erik's headset re-test: much better overall, but picking up a stick
now always grabs it dead-center, where before he could choose the
grip point. Dug into the actual `@pmndrs/handle` grab-capture source
rather than guessing — the real mechanism does preserve the actual
grab point, and the stick's grab config hasn't changed in git history,
so this isn't an obvious regression in either. Found a strong
candidate instead: sticks have both a close-range squeeze grab
(offset-preserving) and a ray-based "grab from a distance" trigger
grab, and the ray grab's snap-target defaults to a fixed zero offset
by design — always centers, on purpose, for that specific interaction.
Couldn't confirm live (the emulator's synthetic controller positioning
stopped registering off-center grabs during testing, for reasons that
look like a testing-methodology limit rather than a real finding), so
asked Erik whether it happens on a close physical reach too, or only
when grabbing from further away — rather than guess-fix something I
couldn't reproduce.

Erik said to move on to the next milestone piece; did the GC/pooling
pass from M5's checklist next (dispatched a fresh-eyes review across
all 17 systems files). Found and fixed 3 real per-frame allocations —
the worst one was `ImpactSystem` allocating a fresh array every frame
for every dynamic body in the scene, unconditionally, the entire
session (not gated to actual impacts) — plus confirmed the other 14
systems already follow the project's own scratch-field convention
correctly. Mechanical pass green (151 tests, up from 149).

**Handover.** M5's checklist is now down to one item: the Quest 2 72Hz
verification, which needs Erik's headset connected via adb and can't
be done from here. Also still open: his grab-point report (waiting on
his answer to narrow down close-grab vs. ray-grab) and the usual
feel-confirmation asks (throw, rolling) from the previous entry.

## 2026-08-28 — Grab-point fix: DistanceGrabbable removed, custom pull system

Erik answered the grab-point question: happens both ways (picking up
off the ground or pulling via pointing), and confirmed the pull is a
visible flight to the hand, not an instant snap — both nailed down the
`DistanceGrabbable`-conflict hypothesis from the previous entry.
Offered three options; he picked "do something smart" — keep the
pull-to-me convenience without the centering bug — and asked me to
watch a video of the in-game behavior first. Couldn't: `WebFetch`
returned no actual video content for the link, just an empty
placeholder. Proceeded on his text description plus the code analysis
instead, and I'm flagging that gap here rather than glossing over it.

Removed `DistanceGrabbable` from all 6 sticks and wrote a new
`StickPullSystem`: point at a hovered stick and hold the trigger to
fly it toward that hand's grip via a direct velocity set, handing off
to the existing `OneHandGrabbable` once close — no second `Handle`
involved, so the offset-preserving close grab is never in conflict
with anything again. A fresh-eyes review of the first draft caught two
real bugs before it shipped: hand attribution used raw grip distance
rather than checking which hand was actually aiming (would misattribute
a pull to the wrong hand if the other hand's trigger happened to be
down for something unrelated, e.g. a UI click), and released/stopped
pulls never zeroed the object's velocity, so a stick let go mid-pull
would have coasted at 2.5 m/s indefinitely. Both fixed; full detail in
docs/DECISIONS.md.

Live-verified the core regression fix twice (before and after the
review rewrite): grabbing a stick off-center now preserves the exact
grab offset as the hand moves, where before every grab snapped to
center. Could not live-verify the ray-pull itself — pointing a
synthetic controller at a stick from beyond point-blank range never
registered as `Hovered` in the emulator, regardless of aim precision,
matching the same CLI/testing-methodology limitation flagged earlier
this session for grab-offset reproduction. Mechanical pass green
throughout (151 tests, tsc/eslint/prettier/build/smoke).

**Handover.** This fix needs Erik's real-headset confirmation on two
counts: does the close grab now correctly preserve offset, and does
pointing-and-pulling a far stick still feel good (aim cone, pull
speed, the handoff to a normal grab at 10cm). Still open from before:
the Quest 2 72Hz check (M5's last item, needs adb + headset).

## 2026-08-28 — Environment feedback: hilltop sky, cliffs, campsite

Erik asked for three things in one message: more trees/rocks from the
same asset library in a more open layout, a hilltop feeling instead of
the garden backdrop, and some fun/exciting dressing around the court.
Asked him to pick between three concrete options for the first two
(sky+cliff-dressing vs. real terrain vs. sky-only; fantasy vs.
campsite vs. mixed theme) since both materially change the build and
redoing either would waste real work — he picked sky+cliffs (lane
stays flat) and cozy campsite.

Found the existing tree/rock GLBs are Kenney's Nature Kit with the
full 330-model pack already sitting locally, unused beyond the 11
models picked in M1/M2 — picked 17 more straight from that same
archive (6 cliff-edge modules, 3 more trees, 3 more rocks, 5 campsite
props), all CC0, no new licensing question. Queried Poly Haven's API
for a hilltop/valley HDRI matching the existing autumn palette and
landed on `autumn_hill_view` — downloaded it, swapped it in for the
old flat garden panorama, and deleted the now-unused original from
`public/`. Built an 11-piece broken cliff ring at 6.5-9.7m radius
(never touching the flat playable lane) and a five-prop campsite
vignette off to one side, all with the same static-collider treatment
the trees/rocks already got.

No fresh-eyes review dispatched this time — this is placement/asset
wiring, not logic, so checked directly instead: a pairwise-distance
script for accidental overlaps, four rendered camera angles (orbit,
top, the authored player-spawn view, and the side diagnostic view),
and a live reload of the running app to confirm no new console errors.
Mechanical pass green throughout (151 tests, tsc/eslint/prettier/
build/smoke).

**Handover.** This is a content/vibe pass, not a mechanic — the real
test is Erik's own reaction on the headset. Open questions worth his
opinion: does the cliff ring read as "hilltop" from inside VR at full
scale (renders look right, but VR depth perception differs from a flat
screenshot), and does the campsite placement feel natural to glance at
mid-game rather than in the way. Still open from before: the Quest 2
72Hz check.

A post-hoc review of that environment commit (Erik ran
`/superpowers:requesting-code-review`) found the new decorative
colliders' hand-estimated dimensions don't match their actual glTF
footprints in several cases — worst one 6× oversized. Filed as gh#7
rather than fixed immediately, since the player never walks
(`locomotion: false`) and can't reach any of them.

## 2026-08-28 — Two open issues closed: CI/deploy dedup, held-stick klonk haptics

Erik picked gh#1 and gh#4 off the open-issues list to knock out.
Merged the CI and Pages-deploy workflows into one file so the project
only builds once per push instead of twice, with deploy now properly
gated on the build/test job succeeding (gh#1). For gh#4 (klonk when
two held sticks are struck together), the audio side turned out to
already work with zero changes needed — the existing impact heuristic
runs on any dynamic body regardless of held/flying phase, exactly as
the issue's own write-up predicted. The real gap was haptics: the
holding hand(s) never felt a pulse for anything but a mid-flight
stick. Fixed by extending the haptic hand-lookup to use
`GrabSystem.getHolderHand()` for a held (not flying) stick — the same
public API `HandoffSystem` already uses. Verified live: grabbed a
stick in each hand, swung them together, saw three separate impact
events fire across both entities with real force numbers, no console
errors. Mechanical pass green (151 tests, tsc/eslint/prettier/build/
smoke). Both issues closed.

**Handover.** Remaining open issues: gh#2 (golden-throw test harness),
gh#3 (cyan autumn foliage, cosmetic), gh#5 (å/ä/ö font glyphs), gh#7
(new decorative colliders, filed this session). None urgent. Still
open from before: the Quest 2 72Hz check, and Erik's in-headset
reaction to the M5 grab fix + environment pass.

## 2026-08-28 — Environment scale fix, then working the issue backlog solo

Erik: the new trees/tent/campfire looked toy-sized next to a kubb and
his own height. Measured the actual glTF heights instead of guessing
again (same technique the fbc9c77 review used) — every tree was really
only 1.1-1.7m tall, shorter than Erik. Scaled each tree 3.4-5.6x (final
heights ~3.8-8.6m, keeping "small" trees smaller than "tall"/oak/pine
ones) and the tent/campfire 2.5x/1.8x via `transform.scale`, and scaled
their colliders by the same factor since `PhysicsShape.dimensions`
isn't auto-scaled by the engine — confirmed by reading the physics
source, not assumed. That collider fix also incidentally closes 2 of
gh#7's ~8 flagged mismatches (tent, campfire) as a side effect.
Verified via rendered views (trees now tower over the court as
intended) and a live reload (no new console errors). Mechanical pass
green throughout.

Erik then asked me to work through the rest of the open-issue backlog
one at a time, in whatever order, and went AFK. Continuing
autonomously per this project's own rule for unattended work: keep
making the calls, log decisions here and in docs/DECISIONS.md, batch
anything genuinely open for him in docs/QUESTIONS.md rather than
blocking.

**gh#3 (cyan autumn foliage) — root-caused and fixed.** Not a texture
problem as originally guessed: every Kenney Nature Kit glTF in this
project has `metallicFactor: 1`, which under this scene's HDRI makes
surfaces reflect the (mostly blue) sky instead of showing their real
color. Patched all 28 committed GLBs' materials to `metallicFactor: 0`
by rewriting each GLB's JSON chunk directly. Hit a genuinely confusing
debugging detour proving the fix: the composer preview looked stuck on
a stale render (turned out to need a full dev-server restart, not just
a page reload), and then the live runtime still showed cyan trees —
which turned out to be two _different_, never-reported tree variants
(`tree_thin_dark`, the pine) that are intentionally teal in Kenney's
own data, not a bug, just visually overlapping the actually-fixed tree
in frame after this session's earlier scale-up made every canopy huge.
Isolating entities with a `Visibility` toggle settled it. All three
originally-reported trees confirmed fixed by aiming the headset
directly at each one. Mechanical pass green. gh#3 closed.

Erik also asked, separately: why does this project use low-poly
assets instead of more realistic ones? Answered directly (Quest 2
performance budget, free CC0 licensing, one consistent art style) —
not something to act on without a real ask.

**gh#7 closed.** Remeasured every remaining flagged collider (11
cliffs, 3 campsite props, 3 rocks) against its real glTF bounding box
and swapped the dimensions in directly — same read-the-accessor-min/
max technique as gh#3. Also fixed `rock-7`, which was equally wrong
but not in the review's original spot-check sample. Mechanical pass
green; pure collider-dimension changes, nothing visual to screenshot.

Erik separately asked whether there's a more interesting/detailed
asset pack we could swap in — pointed him at Quaternius (free CC0,
more textured/varied than Kenney) as the best fit, offered to make it
the next thing after the issue backlog since it's a bigger, separate
task from a one-line bug fix.

**gh#5 fixed.** The root cause was already correctly diagnosed back in
M4 (`@drawcall/uikitml`'s font loader never forwards a `charset`
option to the underlying `TTFLoader`, so the MSDF bake always used its
hardcoded ASCII-only default) — just never fixed. Patched the loader
via `patch-package` (added as a new devDependency, with a `postinstall`
hook so the patch survives a fresh `npm ci`) to pass an extended
charset including å/ä/ö/Å/Ä/Ö. Verified the patch reapplies correctly
from a clean reinstall. Updated the three sv.json strings that had
been spelling around the bug, and removed the now-backwards regression
test that asserted those letters could never appear.

Could not get a live screenshot of the fixed text actually rendering —
the settings/stats tabs where it lives are the same panel edge buttons
M4 already documented as unreliable to ray-click in this emulator.
Disclosed rather than hidden; confidence comes from reading the
library source directly, not from a screenshot. Asked Erik to eyeball
"Bästa fallkast" next time he's on headset. Mechanical pass green (150
tests). gh#5 closed — only gh#2 (golden-throw test harness) remains
open.

**gh#2 closed — the last issue in the backlog.** The abandoned
MCP-scripted approach was never fixable from this side (it needed a
synthetic fixed clock inside the MCP tooling itself), so went with
gh#2's own alternative suggestion instead: extracted `ThrowingSystem
.onRelease`'s release-velocity computation into a new pure function
(`computeThrowRelease`) and wrote a real golden-throw regression test
against it — a synthetic 72Hz pose sweep, no MCP/emulator involved at
all, asserting release speed and spin land inside the same physics
target bands the tuning lab already uses. Refactored `onRelease` to
call the new function instead of duplicating the logic, then live-
confirmed in the emulator that a real throw still fires cleanly
end-to-end. Mechanical pass green (154 tests, up from 150).

**Handover.** The open-issue backlog Erik asked me to work through
while AFK is now fully empty (gh#1, #3, #4, #5, #6, #7, #2 all
closed this session; a new gh#7 was filed and closed in the same
session). Still open from before, unrelated to the backlog: the
Quest 2 72Hz check, and Erik's in-headset reaction to everything
built today (M5 grab fix, environment pass + rescale, and now the
font/haptics/collider/test fixes). Also floated but not started:
swapping in a more detailed/varied asset pack (Quaternius suggested)
per Erik's separate request — he'll say if/when to start that.

## 2026-08-28 — 3x more trees, first bushes, and a multiplayer design sketch

Erik asked for roughly 3x more trees plus bushes with a lot of
variation. Picked 8 more tree variants and all 6 of the pack's bush
models from the same already-local Kenney archive. This time applied
today's own two lessons proactively instead of re-discovering them:
patched the metallic-reflection defect (gh#3) on every new file right
after copying it, and measured real bounding boxes for the colliders
(gh#7) instead of guessing. Scattered 34 new nodes (16 trees, 18
bushes) via a seeded random placement script, keeping the same lane
clearance and spacing rules as every prior environment pass. Verified
via rendered views (good variety, no clipping) and a live reload (no
new console errors). Mechanical pass green.

Mid-task, Erik also asked how a multiplayer mode could work (opponent
on the other baseline, voice, waving, 3 selectable avatars). Answered
with a concrete but unimplemented sketch: WebRTC peer-to-peer
(no server to host), host-authoritative physics, spawn at the
existing opposite-baseline court data, a simple synced head+hands
avatar rig (waving is then "free"), voice riding the same WebRTC
connection. Offered to write it up as a real milestone plan
next — he hasn't said which way yet.

Erik ran `/code-review` on the tree/bush commit and it earned its
keep: found 8 real overlapping-collider pairs the rendered screenshots
hadn't revealed, all traced to one root cause — the placement script's
spacing check used a flat distance constant per category instead of
each object's actual footprint size, so the newer, larger bush models
still collided with neighbors placed just past the (too-small)
threshold. Rewrote the spacing check to derive real circumscribed-
circle radii from each node's own `PhysicsShape` and regenerated all
34 nodes from scratch. Verified this time with an actual pairwise
overlap check, not just a screenshot — zero overlaps involving any new
node. Full writeup in docs/DECISIONS.md.

## 2026-08-29 — Trigger also grabs sticks; logo/icon + remaining polish items next

Erik asked for three things: a simple app icon/logo (king piece +
throwing sticks), trigger as an additional way to grab a stick (not
just the current button), and to work through the "remaining polish"
list from the previous plan review (court size not changing with game
mode, the Underhand HUD badge, positional audio, a wind indicator).

Shipped the trigger-grab request first. `OneHandGrabbable` has no
button-remap option and the grab pointer is hardwired to squeeze
inside `@iwsdk/core` — but `GrabSystem`'s own `useHandPinchForGrab`
option already forwards hand-pinch gestures to grab via a real public
method, `multiPointers[hand].routeDown('squeeze', 'grab', ...)`.
Reused that exact same call for the controller trigger's press/release
edge in a new `TriggerGrabSystem`. Goes through the real `Grabbed`/
`Handle` pipeline, so nothing else needed to change — offset
preservation, throw release, haptics all just work. Live-verified:
trigger-only grab, offset preserved, clean release, squeeze still
works unaffected. Mechanical pass green.

Built the icon next: a small dedicated scene (`public/scenes/icon
.iwsdk.scene.json`) composing the game's own existing king + crossed
sticks against a flat forest-green backdrop, rendered at 1024px and
resized with `sharp` into real favicon/PWA-icon files — no new
external asset, reused the game's own procedural geometry. `index.
html` had zero branding before this (a literal empty-placeholder
favicon, lowercase title) — added the icons plus a real loading splash
(the icon + "KubbOrama" wordmark) baked directly into the static HTML
so it paints before any JS runs, removed once `World.create()`'s full
system-registration completes. Confirmed the production build
correctly rewrites all the new asset paths for the GitHub Pages
`base: './'` setup. Mechanical pass green.

The court-size/game-mode gap, the Underhand HUD badge, positional
audio, and the wind indicator — the rest of Erik's "remaining polish"
list — are still queued next.

**Underhand HUD badge shipped.** The classifier already produced a
real style on every throw since M2; the HUD just never showed it.
Added a fourth HUD row, wired to the existing `Thrown` event, green
for the one correct kubb technique. First attempt used "Underhand ✓"
and hit the exact same missing-glyph bug gh#5 just fixed for Swedish
letters — caught live (a tofu-box glyph, not blank), extended the
patch's charset, then just dropped the symbol anyway since the color
alone already carries the signal.

Also hit, once, an unrelated and unconfirmed physics oddity while
testing (a stick free-falling through the floor right after a reload
that coincided with the dev machine clearly under load — slow build,
audio timeouts). Couldn't reproduce on a clean reload immediately
after; filed as gh#8 rather than chased, since this session's changes
don't touch physics at all.

**Court size now changes with game mode — M4's last known gap,
closed.** Added a `GameModeChanged` event (mirroring `LanguageChanged`)
and a new `CourtLayoutSystem` that recomputes the layout with the
already-tested `computeCourtLayout()` and repositions king/kubbs/
sticks by folding into `MenuSystem`'s existing reset pipeline (new
`applyCourtLayout()` method — switching mode mid-round IS a reset,
just onto a different layout) plus resizing the 5 court-line meshes
directly. Caught a real bug live before shipping: corner stakes have
no `Resettable` tag (they're never reset mid-round in real play), so
the reset-pipeline approach silently skipped them — fixed by having
`CourtLayoutSystem` move stakes directly via `PhysicsSystem`. Fully
live-verified in the emulator: entered XR, clicked the actual menu
button, read back ECS positions before/after for king/kubb/stake/
stick/court-line, all matching `computeCourtLayout`'s math exactly for
both Simple and Advanced.

Also found (and fixed, process-only) 24+ orphaned `vite` dev-server
processes left running since 2026-08-27 — a strong candidate root
cause for gh#8's "resource contention" theory. Killed them, dev server
connected cleanly on the next `iwsdk dev up`.

**Positional audio shipped — closes another documented M5 gap.**
Re-checked the earlier "verified in source, not attempted" claim and
found it was specific to `AudioUtils.createOneShot`'s bare entity, not
a real AudioSystem limitation — `AudioSource`'s own doc comment says
positional audio just needs an entity with a valid `Object3D`.
`playSfxVariant` now optionally takes a world position; impact and
kubb/king-felled sounds use it, foley/UI-clicks stay non-positional.
Along the way found and fixed a real, previously-unnoticed bug: no
one-shot sound entity (of ANY kind, since M5) was ever being disposed
— `AudioSystem` only returns the audio object to its pool on `onended`
but never removes the entity. New `OneShotAudioSystem` fixes the leak
for every one-shot category at once.

Live-verified via repeated real impacts in the emulator (correct
deltaVMps logs, zero errors, zero leaked entities afterward). Trying
to catch a one-shot entity mid-playback via `ecs_pause`/`ecs_step`
surfaced a second, independent lead on gh#8's physics anomaly (spurious
~140 m/s deltaV readings under heavy frame-stepping) — noted in
docs/DECISIONS.md for whoever picks that up, not chased now.

**Wind indicator shipped — closes Erik's "remaining polish" list.**
docs/PLAN.md always specced this (M4 deferred it as optional): a
handful of drifting leaves that pick up real lateral drift only when
wind is active, reusing `WindSystem`'s own per-mode wind vector scaled
down for a readable ambient pace. First attempt used green leaves,
confirmed via screenshot to be nearly invisible against the grass at
normal viewing distance — switched to warm autumn gold (matches the
garden's existing autumn dressing) and a slightly larger size, which
reads clearly. Verified the wind-reactivity itself via direct ECS
position reads: zero drift in Simple mode, consistent positive drift
(with correct wrap-around respawns) in Advanced, back to zero after
switching back.

That closes every item on Erik's "remaining polish" list from this
session: court size + game mode, positional audio (plus a real
one-shot-entity leak fix found along the way), and the wind indicator.
