# KubbOrama — Milestones & status

Update the checkboxes and status lines as work progresses. A milestone is
DONE only after its review gate (see CLAUDE.md) and, where marked, Erik's
headset gate. Tag on completion: v0.1-m0 ... v0.7-m6.

## M0 — Setup `status: DONE`

- [x] Preflight pass/fail table reported (Node 22, git, gh; adb/blender/
      godot optional)
- [x] Scaffold run in place at repo root (exact command in
      docs/DECISIONS.md)
- [x] iwsdk.config.json: `physics: true` (CRITICAL — default is false!),
      locomotion off (set directly via CLI flags, verified in the file)
- [x] Emulator scene runs; verified via CLI (screenshot + simulated
      `xr enter`/`xr status`) — see docs/DECISIONS.md. IWSDK MCP servers
      confirmed connected after Erik's Claude Code restart
      (`iwsdk-runtime`, `iwsdk-reference`; `metavr` cannot connect on
      Linux — see docs/DECISIONS.md).
- [x] TS strict + eslint + prettier + vitest wired; CI: typecheck+lint+
      test+build on push (`.github/workflows/ci.yml`)
- [x] GitHub Pages deploy via Actions (base './' — verify after first
      deploy) — `.github/workflows/deploy.yml`, Pages source set to
      "workflow" via `gh api`
- [x] Deployed URL verified on desktop (`HTTP 200`, assets load via the
      `base: './'` relative path unchanged) AND Quest browser (Erik
      confirmed "Enter XR" works on the Quest 2 — renders the default
      IWSDK demo room, expected since M1 hasn't built the garden yet)
- [x] GitHub labels created (bug/feature/tech-debt/follow-up)
- [x] Secret scanning + push protection enabled on the repo (public!);
      .gitignore covers .env and assets/raw/
- [x] Docs decomposed: CLAUDE.md merged (from SESSION_KIT/
      CLAUDE_MD_ADDITIONS.md), docs/PLAN.md, docs/MILESTONES.md (this
      file), docs/DECISIONS.md (seeded from DERISK_FINDINGS), docs/
      QUESTIONS.md, docs/SESSION_LOG.md, docs/sessions/ (from SESSION_KIT)
- [x] README with headset testing steps (dynamic port via dev status)
- **GATE (Erik, headset): open deployed URL in Quest browser, enter VR** 🎧
  — ✅ PASSED 2026-08-27: "Enter XR" worked, entered the default IWSDK
  demo room.

## M1 — Scene `status: DONE`

- [x] config.ts loads JSON: court presets (orientation: baselines =
      SHORT sides!), piece dims/masses, camera poses. 0-100 tuning
      mappings deferred to M2 (no consumer — the tuning lab — exists
      yet; adding them now would be a premature abstraction)
- [x] Garden: grass ground (Grass004 tiled 15x15), HDRI sky+IBL
      (autumn_park), 1 directional light (shadow-casting), hemisphere
      tint; fence (Kenney, linear pattern) + 5 Kenney trees
- [x] Court: 4 corner stakes (no lines, red-tipped); king at court
      center; 5 kubbs evenly spaced along the far short baseline
      (**superseded in M2 by Erik's feedback — both baselines now
      populated, 10 kubbs total, see M2 below**); 6 sticks lying
      scattered near the player baseline (seeded RNG, not Math.random);
      kubb/king sunk 2-3mm into grass visually (collider unchanged).
      Real dynamic shadows used instead of blob-shadow decals — strictly
      better grounding, same visual goal.
- [x] All pieces are physics bodies (PhysicsShape/PhysicsBody, real
      birch density/friction/restitution); eye height 1.6 m (default
      IWSDK player origin, unmodified)
- [x] fetch-assets.sh run; ASSETS.md license log started (11 runtime
      files logged: 4 wood/grass texture pairs, 1 HDRI, 5 Kenney glTFs)
- [x] Emulator verification via MCP: layout confirmed from playerSpawn,
      grandstandSide and a top-down diagnostic view; physics settling
      verified with ecs_pause/ecs_step (all 17 dynamic/static bodies
      rest correctly, zero velocity, no falling through the floor).
      Found and fixed two real bugs this way — see docs/DECISIONS.md.
- Review gate → tag v0.2-m1

## M2 — Throwing (THE milestone) `status: in progress — pending Erik's headset calibration gate`

- [x] core/throwRelease.ts (TDD): ring buffer, frame-averaged release,
      lever-arm v_com = v_hand + ω×r — heavily unit-tested (8 tests,
      incl. an explicit "classic VR throwing bug" regression test)
- [x] End grip: emerges from the actual grab point (lever arm computed
      live from current CoM/hand positions), not a hardcoded offset —
      see docs/DECISIONS.md for why. DistanceGrabbable
      (`returnToOrigin: false`); direct grab by bending down (both via
      OneHandGrabbable/DistanceGrabbable + RayInteractable on sticks)
- [x] Stick state machine Racked→Held→Flying→Settled
- [x] Impact detector (|Δv| heuristic, pure core — applied to every
      dynamic body; M3 will reuse its Impact events)
- [x] Haptics library (grabTick, releaseClick, impactRumble(f),
      kubbFelled/kingFelled/roundCleared/uiTick data ready for M3/M4)
- [x] Throw telemetry logged per throw (speed, spin, flight, landing,
      preset) — versioned zod schema, persisted to localStorage,
      exportable as JSON from the tuning panel
- [x] Tuning lab: 8 params as 0-100 + live meters with ballistic
      target bands (backyard-preset row: ~7 m/s @ 6m, spin 3-13 rad/s) + presets A/B/C + JSON export/import — desktop tweakpane panel.
      VR spatial panel NOT built (deferred — docs/PLAN.md §9d2 names
      tweakpane as the primary tuning surface during development; the
      in-headset panel is a fast-follow, not required for this gate)
- [x] Underhand classifier + flip-quality meter (readable in the
      tuning panel's "Style"/"Flip quality" fields). HUD badge
      ("Underhand ✓" shown to the player mid-game) NOT built — that's
      player-facing UI, out of scope until the HUD exists (M3+)
- [x] Both spin styles honest by construction: no spin
      assist/normalization anywhere in the pipeline, angular damping
      in flight is a tunable (0-100, default 25 as of Erik's first
      playtest — see below). Not yet _verified_ with real flat vs.
      backspin throws — that's exactly what the headset gate below is
      for
- [~] Golden-throw regression scripted via MCP: attempted, hit a real
  MCP-tooling limitation (documented in detail in
  docs/DECISIONS.md, filed as
  [gh#2](https://github.com/Steken3344/kubborama/issues/2)).
  Pipeline correctness verified a different way instead: rigorous
  unit tests on the math, live confirmation of the full grab→
  release→settle state machine and event flow
- [x] Erik's first playtest feedback (2026-08-27, full writeup in
      docs/DECISIONS.md): kubbs on both baselines (10 total, mirroring
      docs/PLAN.md's always-deferred full set); gravity -10%; B-button
      reset menu (`MenuSystem` + `reset-menu.uikitml`); ground
      angular-damping default fixed (was silently zeroed by the tuning
      system every load) + a touch more ground restitution so sticks
      settle instead of rolling forever; grab-range highlight
      (`GrabHighlightSystem`, `RayInteractable`+`Hovered`); a handful of
      Kenney rocks around the garden. Also found and fixed a real
      regression while verifying the kubb change: a too-thin ground
      collider let scattered sticks tunnel through the floor on load.
      Left-hand-grab report investigated, not reproduced in the
      emulator — logged in docs/QUESTIONS.md
- **GATE (Erik, headset): feel calibration — 10-15 flat + 10-15 backspin
  throws recorded to JSON; structured feedback (words + numbers)** 🎧
  — not yet done, blocks tagging v0.3-m2
- Review gate → tag v0.3-m2

## M3 — Toppling, rounds & stats `status: DONE`

- [x] core/topple.ts: tilt >threshold (60°, config.ts) + at-rest (reused
      core/restState.ts, extracted from ThrowingSystem's inline check —
      DRY); king separate event via a new `KingPiece` tag component
      (`ToppleSystem` queries Resettable minus StickState — kubbs+king,
      not sticks — and branches on `hasComponent(KingPiece)`)
- [x] Round loop: 6 sticks, auto-reset (through the exact same path as
      the manual reset-menu button — both trigger off events on the one
      project-wide bus); core/scoring.ts reducer (TDD with event
      sequences, per docs/sessions/M3.md). No separate "result screen" —
      the always-visible HUD (below) serves that role instead of a
      blocking modal, since the round auto-resets immediately
- [x] core/stats.ts: PBs (fewest sticks to fell the king, most felled in
      a round, longest king-fell streak, longest throw, longest felling
      throw), lifetime totals (rounds/sticks/kubbs/kings/play time),
      accuracy as a derived helper (not stored, avoids drift); versioned
      zod schema with reserved userId/matches fields, persisted to
      localStorage (same never-throws-on-corrupt-data pattern as M2's
      telemetry/tuning-preset stores)
- [x] HUD (`public/ui/hud.uikitml` + `HudSystem`): always-visible small
      panel — round number, last round's felled count, personal-best
      most-felled. Purely event-driven (updates only on RoundEnded, no
      per-frame polling)
- Review gate: fresh-eyes found one blocker (manual reset mid-round
  didn't clear `RoundSystem`'s round-scoped state — fixed as
  "abandon and retry the same round number," verified live) plus two
  worth-fixing items (a per-frame allocation and a duplicated
  velocity-read block, both fixed). Full writeup in docs/DECISIONS.md.
  Tagged `v0.4-m3` — no headset gate for this milestone.

## M4 — Wind, tunables & settings `status: DONE`

- [x] core/wind.ts (TDD): F = windVector × dragFactor; `WindSystem`
      re-adds `PhysicsManipulation({force})` every tick to Flying
      sticks only (dragFactor in `pieces.json`'s new `wind` section).
      Verified live in Advanced mode with no errors through a full
      flight
- [x] core/i18n.ts (TDD): typed `t(key)` over sv/en dictionaries,
      never throws on a missing key. core/settings.ts (TDD): zod
      schema, versioned, persisted to localStorage — same pattern as
      M2/M3's telemetry/stats stores. `SettingsSystem` owns
      loading/persisting into a shared `settingsState` singleton
      (mirrors `tuningState.ts`)
- [x] Game mode Simple (backyard, wind 0, topple 50°) / Advanced
      (tournament, wind 1.5 m/s lateral, topple 60°) — `ToppleSystem`'s
      topple angle and `WindSystem`'s wind vector both read the active
      mode live (`src/data/game-modes.json`). **Known gap:** court
      _size_ doesn't change yet — switching mode changes topple/wind
      immediately but kubbs/king/stakes stay at whatever layout was
      baked into the scene at load (a real re-layout system, reusing
      `computeCourtLayout()`, is a fast-follow, not attempted this
      session)
- [x] Language (sv/en) toggle and game mode toggle wired into the
      existing "Ny runda" menu, verified live (screenshots: both
      toggles flip labels across both the menu and the HUD correctly).
      Haptics enabled/intensity setting wired into every existing pulse
      call site (`core/haptics.ts`'s new `scaleHapticPulse`)
- [x] i18n retrofit of all existing UIKitML text (reset-menu, HUD) —
      zero hardcoded strings in those two panels. **Root cause found
      and documented** for why å/ä/ö can't render in UIKitML text at
      all right now (confirmed in library source, not guessed — see
      docs/DECISIONS.md, filed as
      [gh#5](https://github.com/Steken3344/kubborama/issues/5)): the
      sv/en dictionaries deliberately avoid those glyphs, and a test
      (`src/i18nState.test.ts`) guards against regressing that
- [x] Settings panel UI: new "Statistik" tab (read-only personal
      bests) alongside the existing menu, plus a settings tab with
      music/SFX volume, haptics on/off + intensity, profile name
      (cycled placeholder, not free text entry), and court-lines
      toggle+rendering (4 new `CourtLine`-tagged scene nodes, toggled
      by a new `CourtLinesSystem`). Every control is a Button that
      cycles/toggles its value on click (same convention as the
      existing language/game-mode buttons), not a native
      Toggle/Slider/Input — see docs/DECISIONS.md for why. Panels
      moved further from the player per Erik's feedback
      (`hud-panel`, `reset-menu-panel`). Verified live in the
      emulator (tab switching, every settings button, court-lines
      rendering); the "Planlinjer" and "Statistik" buttons'
      click-handlers specifically were verified by code-pattern
      analogy and (for court-lines) a direct ECS render check rather
      than a live click — both sit at panel edges where ray-aiming
      repeatedly missed. Full writeup, including a fresh-eyes review
      that caught a real volume-cycling bug (fixed before tagging),
      in docs/DECISIONS.md
- [ ] Dev debug panel (tweakpane reuse) for wind knobs; optional leaf
      wind indicator — not built, low priority, deferred past this
      milestone (not part of Erik's approved M4 scope)
- Review gate: fresh-eyes found one real bug (`nextVolumeStep` could
  drift a volume setting out of its valid range and silently reset
  all settings on next load) — fixed and re-verified live. Full
  writeup in docs/DECISIONS.md. Tagged `v0.5-m4` — no headset gate for
  this milestone.

## M5 — Polish & performance `status: in progress — audio slice done`

- [x] SFX inventory (Kenney Impact Sounds + UI Audio, CC0): impact
      sounds classified by impacting entity + force (stick/king/kubb,
      3 force tiers for sticks — see docs/DECISIONS.md for why not
      pairwise), volume scaled by force; UI click on every settings
      button. **Known gaps, documented not silently dropped:** no
      pitch randomization (IWSDK's `AudioSource` has no
      pitch/playbackRate field at all — verified in source); no
      positional audio (one-shot entities have no `Object3D` to anchor
      `PositionalAudio` to — verified in source, not attempted);
      ambience is "Forest Ambience" (birds not specifically confirmed
      by ear — can't audition audio in this environment) rather than a
      dedicated garden/birds track
- [x] Cozy music loop — OpenGameArt.org "Gone Fishin'" (banjo/bluegrass,
      CC0), not Pixabay as PLAN.md named (Pixabay's download sits
      behind a Cloudflare bot challenge, not scriptable — see
      docs/DECISIONS.md). Two independent volume channels
      (`musicVolumePercent`/`sfxVolumePercent`, M4) live-applied;
      ambience follows the SFX channel at a reduced base gain
      (`audio.volume.ambienceBaseGain`) since it has no slider of its
      own
- [x] Closed a dormant gap from M3/M4: `kubbFelled`/`kingFelled`/
      `roundCleared` haptic sequences were defined but never fired —
      wired to their events now
- [x] **Found and fixed a real pre-existing bug, not part of the audio
      task but discovered while building it**: every fresh load could
      falsely "fell" the king and all 10 kubbs within a few seconds,
      before the player could interact — silently corrupting round 1's
      scoring until the player's first real throw. Root cause and fix
      (rest-duration accumulation + a startup grace window) in
      docs/DECISIONS.md
- [x] Erik's second feedback round (2026-08-28): version indicator in
      the settings menu (`git describe` baked in at build time); a
      cross-hand stick handoff (`HandoffSystem`) — real fix, but two
      presses not one seamless motion (framework constraint, see
      docs/DECISIONS.md); settings panel scaled down 1.15→0.85. The
      ground-rolling fix from this round (a blanket angular-damping
      bump) turned out to hurt throw feel and was superseded — see the
      next entry
- [x] Erik's first real-headset test of M5 (2026-08-28): fixed a
      genuine, previously-hidden bug where the ground's visual surface
      and its physics collider disagreed by 0.49m (felt like floating
      — full root cause in docs/DECISIONS.md); reverted the angular-
      damping regression from the previous bullet and replaced it with
      a phase-aware fix (`StickGroundDampingSystem`) that only damps a
      stick once it's actually landed, restoring the M1/M2 throw feel
      Erik confirmed was right; added the court's center line (marks
      the king's row); added static collision to all 5 trees and 8
      rocks (previously pure decoration, nothing rolling stopped for
      them)
- [x] GC/pooling pass: found and fixed 3 real per-frame allocations
      across all 17 systems (`ImpactSystem`'s velocity-delta check ran
      unconditionally every frame for every dynamic body — the highest-
      impact one; `ThrowingSystem`'s pose-sampling ring buffer; a
      `WindSystem` options-object literal). Full detail and the
      remaining 14 systems confirmed clean in docs/DECISIONS.md.
      Optional king-cam slow-mo not attempted (low priority, cut)
- [ ] 72 Hz verified ON QUEST 2 (chrome-devtools via adb — needs USB card)
- [ ] 72 Hz verified ON QUEST 2 (chrome-devtools via adb — needs USB card)
- **GATE (Erik, headset): perf + comfort + full experience pass** 🎧
- Review gate → tag v0.6-m5 once the rest of M5 closes out

## M6 — PWA (optional) `status: not started`

- [ ] vite-plugin-pwa: manifest, icons, service worker; installable from
      deployed URL; launches fullscreen from Quest app library
- Review gate → tag v0.7-m6 → POC COMPLETE 🎉
