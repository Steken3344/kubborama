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
tests now, up from 109 — /build/smoke).

**Handover.** M4 is genuinely in progress, not done — no tag yet.
Next session (or later tonight, if the instruction to keep going is
still meant to hold): either finish M4's settings panel, or treat this
as a natural stopping point and let Erik weigh in on the panel's
design first. Everything built so far is committed, tested, and
documented either way.
