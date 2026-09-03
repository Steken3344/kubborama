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
      tuning panel's "Style"/"Flip quality" fields). HUD badge showing
      the classified style after each throw (green for underhand, the
      correct technique) built 2026-08-29 once the HUD existed —
      see docs/DECISIONS.md
- [x] Both spin styles honest by construction: no spin
      assist/normalization anywhere in the pipeline, angular damping
      in flight is a tunable (0-100, default 25 as of Erik's first
      playtest — see below). Not yet _verified_ with real flat vs.
      backspin throws — that's exactly what the headset gate below is
      for
- [x] Golden-throw regression: the original MCP-scripted approach hit a
      real tooling limitation (documented in docs/DECISIONS.md, filed as
      [gh#2](https://github.com/Steken3344/kubborama/issues/2)) — fixed
      2026-08-28 by extracting the release computation into a pure
      `computeThrowRelease()` and testing it with a synthetic 72Hz pose
      sweep against the same physics target bands the tuning lab uses, no
      MCP/emulator involved. gh#2 closed
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
      mode live (`src/data/game-modes.json`). Court _size_ now changes
      too (fixed 2026-08-29 — `GameModeChanged` event + new
      `CourtLayoutSystem`, reusing `computeCourtLayout()`; see
      docs/DECISIONS.md): switching mode repositions king/kubbs/stakes/
      sticks and resizes/repositions the court-line meshes, live-
      verified in the emulator via direct ECS position reads
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
- [x] Dev debug panel (tweakpane reuse) for wind knobs (2026-08-30) —
      deferred here as low priority, built in M5 alongside the leaf
      wind indicator below. `WindSystem` gained a nullable force
      override (`null` = today's exact game-mode-driven behavior,
      untouched by default); the existing Tuning Lab panel gained a
      "Wind (dev override)" folder — an Auto checkbox plus a 0-3 m/s
      slider, kept deliberately out of the A/B/C throw-feel preset
      system since wind is an environmental experiment, not a feel
      parameter. Direction is not exposed — it's a fixed cross-court
      axis by design. See docs/DECISIONS.md for why the override path
      itself couldn't be directly clicked/verified (the panel is a
      desktop DOM overlay outside the WebXR canvas, no available tool
      can interact with it) though the regression side (default
      behavior unaffected) was live-confirmed.
- Review gate: fresh-eyes found one real bug (`nextVolumeStep` could
  drift a volume setting out of its valid range and silently reset
  all settings on next load) — fixed and re-verified live. Full
  writeup in docs/DECISIONS.md. Tagged `v0.5-m4` — no headset gate for
  this milestone.

## M5 — Polish & performance `status: review gate GO (2026-08-30) — awaiting Erik's headset pass to tag v0.6-m5`

- [x] Formal milestone review gate (2026-08-30): mechanical pass →
      fresh-eyes subagent review → adversarial pass, per CLAUDE.md's
      workflow, over the whole of M5 (`v0.5-m4`..HEAD, 27+ commits).
      No Critical issues either pass. Fresh-eyes found 2 real per-
      frame allocations (`StickPullSystem`, `WindIndicatorSystem`);
      the adversarial pass found a 3rd (`TriggerGrabSystem`) plus a
      real audio-entity leak vector (`OneShotAudioSystem` never
      disposing a clip that never starts playing), a partial-mutation
      risk in `CourtLayoutSystem` (a missing scene node id could throw
      mid-migration, leaving the court half old-preset/half new), and
      a documented-but-unfixed DRY violation (duplicate delta-clamp
      constant across the gh#8 patch and `core/restState.ts`). All
      fixed and live-verified same session — see docs/DECISIONS.md for
      the full writeup and go/no-go. Nothing deferred that blocks
      Erik's headset test.

- [x] gh#8 root-caused and fixed (2026-08-30): `@iwsdk/core`'s render
      loop feeds an uncapped `THREE.Clock.getDelta()` straight into
      physics with no substep protection — a large single-frame delta
      (a real multi-second main-thread/OS stall) integrates gravity
      far enough in one step to tunnel a moving body clean through a
      thin collider. Reproduced directly (not inferred): a lifted
      stick released with a synthetic 5-second step went from y=5 to
      y=-148 in one step — the exact symptom pattern gh#8 reported.
      Fixed via `patch-package` (clamps the single delta-producing
      call site to 0.1s, same technique/value as `core/restState.ts`'s
      existing precedent for the same class of problem), verified to
      reapply cleanly from a fresh install matching CI. Full writeup
      and the one thing that couldn't be directly live-verified
      (a real wall-clock stall hitting the exact patched code path,
      as opposed to the debug tool's own separate delta-injection
      path used to confirm the underlying mechanism) in
      docs/DECISIONS.md.

- [x] Simple mode's real-kubb rules (2026-08-29, Erik's request): a
      felled kubb is teleported to a sin-bin row beside the court, out
      of play, and the king is protected — literally excluded from
      `ToppleSystem`'s query via a new `KingProtected` tag — until
      every kubb is down. Advanced mode is untouched (still today's
      free-throw-any-order). Two design questions resolved with Erik
      via AskUserQuestion before writing code: king immunity (not
      "falls but doesn't count," not "instant loss") and building this
      into the existing Simple/Advanced toggle rather than a separate
      setting — see docs/DECISIONS.md for the full reasoning,
      including why a genuine new "jubel" audio asset was skipped
      (Kenney's jingle packs have no win/lose distinction in their
      filenames and this environment can't audition audio) in favor of
      a reworked `kubbFelled` haptic pattern. Erik's larger 3-mode
      (simple/normal/advance) vision is intentionally scoped down —
      Normal is deferred, not stubbed. Live-verified with a real
      physical topple (a horizontal stick sweep, not a vertical drop —
      a squat kubb resists tipping from straight overhead) through the
      full lifecycle: fell → sin-bin placement → Reset → fully
      restored, king re-protected.

- [x] Wind indicator (docs/PLAN.md §13's "cheapest possible" flourish —
      the M4 gap above, picked up as the last item on Erik's "remaining
      polish" list). 14 small procedural leaf shapes
      (`leaf.scene-asset.ts`) drift across a fixed area spanning every
      court preset, gently bobbing/tumbling always, and picking up
      real lateral drift only when `windVectorForMode()` is nonzero
      (Advanced mode) — reusing the same per-mode wind vector
      `WindSystem` applies to sticks, scaled down to a readable ambient
      pace, entirely independent of the real physics force. A leaf that
      drifts past the area edge respawns at the opposite edge with a
      new random height/z — an unbounded recycling effect, not N fixed
      particles. First color choice (green) was live-verified nearly
      invisible against the grass at normal viewing distance; switched
      to warm autumn gold, which reads clearly and also better matches
      the garden's existing autumn tree/bush dressing.

- [x] Positional audio (fixed 2026-08-29 — the "verified in source, not
      attempted" gap above was re-checked and turned out to be
      specific to `AudioUtils.createOneShot`'s bare entity, not a real
      library limitation; see docs/DECISIONS.md). Impact and
      kubb/king-felled sounds now play from the actual world position
      of the piece that made them; foley and UI clicks stay
      listener-anchored (not spatially meaningful). Also fixed a
      real, previously-unnoticed leak this uncovered: no one-shot sound
      this game has ever played (impact, felled, foley, UI-click alike)
      was disposing its entity — `AudioSystem`'s own instance pool only
      returns the Audio/PositionalAudio object to its pool on
      `onended`, never removes the entity. New `OneShotAudioSystem`
      fixes this for every one-shot category, not just the new
      positional ones.

- [x] SFX inventory (Kenney Impact Sounds + UI Audio, CC0): impact
      sounds classified by impacting entity + force (stick/king/kubb,
      3 force tiers for sticks — see docs/DECISIONS.md for why not
      pairwise), volume scaled by force; UI click on every settings
      button. **Known gaps, documented not silently dropped:** no
      pitch randomization (IWSDK's `AudioSource` has no
      pitch/playbackRate field at all — verified in source);
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
      across all 17 systems that existed at the time (2026-08-28)
      (`ImpactSystem`'s velocity-delta check ran unconditionally every
      frame for every dynamic body — the highest-impact one;
      `ThrowingSystem`'s pose-sampling ring buffer; a `WindSystem`
      options-object literal). **A point-in-time snapshot, not a
      standing guarantee**: the milestone's formal review gate
      (2026-08-30) found 2 more of the exact same bug class in systems
      added AFTER this pass ran (`StickPullSystem`'s per-frame `Set`,
      `WindIndicatorSystem`'s per-recycle `Vector3`) — both fixed, see
      docs/DECISIONS.md. Optional king-cam slow-mo not attempted (low
      priority, cut)
- [x] Fixed the grab-always-centers regression (2026-08-28): removed
      `DistanceGrabbable` from all 6 sticks — it conflicted with
      `OneHandGrabbable` over a single per-entity `Handle`, so every
      grab (even a close reach) went through its always-centering
      path. New `StickPullSystem` reimplements "pull a far stick to
      me" without a second `Handle` (aim + trigger → velocity toward
      the hand, hands off to `OneHandGrabbable` once close). Live-
      verified the offset-preserving close grab; the ray-pull itself
      is code-reviewed + mechanically verified only — needs Erik's
      headset to confirm. Full writeup in docs/DECISIONS.md
- [x] Environment pass (2026-08-28): swapped the flat garden HDRI for
      a hilltop/valley vista (Poly Haven's `autumn_hill_view`), ringed
      the playable area with cliff-edge dressing from the same Kenney
      pack (never touching the flat lane), added 6 more trees/rocks,
      and a cozy-campsite vignette (fire, tent, log/stump seating) off
      to one side — all per Erik's live feedback and choices. Needs his
      in-headset reaction; full writeup in docs/DECISIONS.md
- [x] Stick rack (2026-08-30, Erik's ergonomics feedback): replaced
      ground-scatter with a fixed 6-slot rack beside the player (right
      side, hip height) so throws no longer require bending down each
      time. Court/kubb/stake layout is now fully seed-free (the old
      `seed` param only ever fed stick scatter). Found and fixed a
      real bug during live testing — the rack's visual mesh had no
      collider, so sticks fell straight through to the ground — before
      any commit. Full writeup in docs/DECISIONS.md.
- [ ] 72 Hz verified ON QUEST 2 (chrome-devtools via adb — needs USB card)
- [ ] 72 Hz verified ON QUEST 2 (chrome-devtools via adb — needs USB card)
- **GATE (Erik, headset): perf + comfort + full experience pass** 🎧
- Review gate → tag v0.6-m5 once the rest of M5 closes out

## M6 — PWA (optional) `status: built + emulator-verified; awaiting Erik's Quest confirmation`

- [x] vite-plugin-pwa (v1.3.0, per docs/PLAN.md §12) wired into
      vite.config.ts: web manifest (name/short_name "KubbOrama",
      bilingual sv/en description — the manifest spec has no per-
      language description array, so this is one string covering both),
      `start_url`/`scope` set to `'./'` to match the project's existing
      relative-base convention (verified working under the
      `/kubborama/` GitHub Pages subpath since M0 — an absolute `'/'`
      would have broken there), `display: 'fullscreen'`,
      `background_color`/`theme_color` matching index.html's existing
      splash screen color so the OS/launcher splash and the app's own
      splash don't flash two different colors during the handoff.
      Icons reuse the existing `icon-192.png`/`icon-512.png` (kubb king + crossed sticks motif, already built for the favicon/splash in
      an earlier session — no new asset needed).
- [x] Service worker (`registerType: 'autoUpdate'`, generateSW mode):
      precaches the JS/CSS/HTML/physics-wasm app shell (workbox's
      default 2 MB per-file cap raised to 10 MB — both the Havok wasm
      and the main bundle exceed the default and are load-bearing);
      textures/audio/glTF/fonts use a `CacheFirst` runtime-caching rule
      instead of precache, since they're numerous and largely
      per-scene rather than needed before the app can render at all.
      `autoUpdate` means a deploy is picked up on next launch with no
      manual cache-bust step and no player stuck on a stale build.
- [x] Verified installable (mechanically, without a headset): a
      throwaway Playwright script against the production build
      confirmed the manifest link resolves, both icon URLs return 200,
      and `navigator.serviceWorker.getRegistration()` resolves with an
      `active` worker at the correct scope — the actual criteria a
      browser's install prompt checks. `chrome-devtools-mcp`'s
      Lighthouse PWA audit was attempted first but this machine has no
      Chrome binary installed for it (environment gap, not a project
      issue) — the manual script above covers the same ground.
- [x] Fixed a real smoke-test regression the SW introduced:
      `sw.js` registration failed against `vite preview`'s self-signed
      local HTTPS cert (Chromium validates a service worker's origin
      cert through a path that Playwright's `ignoreHTTPSErrors` context
      option doesn't cover — a known Playwright/Chromium gap, not a
      project bug; the real GitHub Pages deploy has a valid cert).
      Fixed by launching the smoke-test's browser with
      `--ignore-certificate-errors`.
- [x] README updated with "install as an app" instructions.
- [x] **GATE deprioritized by Erik, 2026-09-03**: tried opening the
      deployed URL in the Quest browser, didn't notice an install
      prompt/any visible difference, and said it's not worth chasing
      further — the game is played in-browser day to day regardless, so
      installability is a nice-to-have, not something blocking further
      work. Not investigated further (may need a specific browser-menu
      path on Quest's browser version, or the criteria may need a
      revisit) — leave as a low-priority follow-up if it ever becomes
      relevant, not a blocker.
- Review gate → tag v0.7-m6 → POC COMPLETE 🎉

## M7 — MP1 co-presence (multiplayer) `status: MP1+MP2 confirmed live end-to-end with 2 real headsets (2026-09-02); post-review hardening done`

- [x] Trystero installed (v0.25.4, default Nostr signaling strategy,
      matching docs/PLAN.md §12's pre-approved choice) — serverless
      WebRTC, no signaling server to build/host.
- [x] `core/presence.ts`: pure, zod-validated presence message (head +
      both hands, position + quaternion) — TDD, 9 tests, network
      messages treated as an untrusted boundary per CLAUDE.md
      (malformed/mismatched-version peer data is dropped, never
      trusted).
- [x] `systems/multiplayer.ts`: joins a room (`?room=` URL param,
      default `kubborama-lobby` so two headsets opening the plain
      deployed URL land together with zero setup), broadcasts local
      head/hand transforms at ~20 Hz (throttled, no per-frame
      allocation — reused pose objects mutated in place), renders
      every other peer as a placeholder avatar (`peer-avatar` scene
      asset: 3 spheres, no character art yet).
- [x] Mechanical pass green: tsc/eslint/prettier/vitest (170 tests),
      build, smoke. Single-client live-verified in the emulator (joins
      the room, sends presence every tick, zero console errors over
      several seconds) — see docs/DECISIONS.md for what could and
      couldn't be verified without a second real client.
- [x] Remote-player placement resolved (2026-09-01, Erik's decision):
      the other headset appears at the far baseline — the one you
      normally throw at — facing back toward you, not a generic
      sideways offset. `core/presence.ts`'s `mirrorPoseToFarBaseline()`
      (pure, 3 new tests) rotates the peer's whole local tracked space
      180° and translates it to the far baseline.
- [x] **GATE (Erik, 2× headset) PASSED, 2026-09-01**: opened the
      deployed URL on both Quests, confirmed each sees the other's
      head/hands moving live. Also surfaced the real MP1/MP2 boundary
      — no shared court state yet (kubbs/king/sticks aren't synced,
      by design — see docs/DECISIONS.md).
- [x] Voice chat (2026-09-01): Trystero `addStream`/`onPeerStream`,
      plain non-spatial `<audio>` per peer. Mute is mandatory per the
      plan — new `micMuted` setting (defaults muted), a
      "Mikrofon: På/Av" button in the settings tab. Live-verified in
      the emulator (mic connects, button toggles, no errors); actually
      hearing a second real peer still needs Erik's 2 headsets.
- No room/lobby UI (URL param only); no spatial/positional voice (flat
  stereo for now).
- [x] **MP2 phase 1 (2026-09-01)**: interviewed Erik on the open MP2
      design questions (AskUserQuestion) before building — he wants
      both players throwing and a real turn-based match eventually,
      with his own authority rule: "först in äger spelet" (whoever
      joins first is host for the whole session). Full scope needs 4
      separable pieces of work; built the first 2 tonight:
  - `core/multiplayerAuthority.ts`'s `isHost()` (pure, 5 tests) —
    deterministic host election from each peer's local join time.
  - `core/pieceSync.ts` (pure, zod, 7 tests) + `systems/multiplayer.ts`:
    the host broadcasts king + all 10 kubbs' transforms at ~20 Hz; the
    guest applies them via `PhysicsSystem.setBodyTransform()` (snap-
    correction, not a Kinematic-state swap — see docs/DECISIONS.md for
    why). Sticks are NOT synced yet.
  - Mechanical pass green (186 tests). Live-verified in the emulator
    (room joins, all 11 pieces resolve, king/kubbs stay in their
    normal resting state, `MultiplayerSystem` runs unpaused) — actual
    2-peer sync still needs Erik's 2 headsets.
- [x] **MP2 phase 2 (2026-09-01)**: both players' throws now affect
      the shared kubbs. `ThrowingSystem` is unchanged — this just
      subscribes to its existing `Thrown` event and, only if I'm not
      the host, relays the release (`core/throwRelay.ts`, pure/zod/6
      tests) to the host, which applies it to its own copy of that
      stick with the same `setBodyTransform` +
      one-shot-`PhysicsManipulation` pattern a local throw uses.
      Sticks joined the pieces-broadcast list (17 total now) for
      ongoing reconciliation once released; a piece the local player
      is `Grabbed`-holding is skipped during correction. Also
      extracted `core/networkSchemas.ts` (DRY — this was about to be
      the 3rd copy of the same vec3/quaternion zod schemas). Mechanical
      pass green (192 tests). Live-verified: a local throw fires the
      full pipeline correctly end to end with zero errors, and the
      guest-relay path correctly no-ops when solo (=host) — an actual
      guest's relay landing on a real host still needs Erik's 2
      headsets.
- [x] **MP2 phase 3 (2026-09-01)**: a real winner. `core/match.ts`
      (pure, 11 tests) splits the 10 kubbs by side using the EXISTING
      scene ids (kubb-0..4 far/guest, kubb-5..9 near/host — no kubb
      repositioning needed, lines up exactly with phase 1's far-
      baseline placement) and tracks per-side kubb counts + whose
      turn + winner. `core/matchSync.ts` (zod, 6 tests) is the
      event-driven wire format. Wired into `systems/multiplayer.ts` by
      subscribing to the EXISTING `KubbFelled`/`RoundEnded`/`Reset`
      events — `SimpleRulesSystem`/`RoundSystem`/`MenuSystem` are all
      unchanged. **Deliberate cut, documented in 3 places**: win
      condition is "clear the opponent's kubbs first," NOT
      king-felling — `KingProtected` is a global (not per-side) rule,
      and reworking it is separate work. Turn order is tracked/synced
      but NOT enforced (honor system — real enforcement needs the same
      risky runtime grab-component surgery flagged in phase 1).
      Mechanical pass green (209 tests).
      Live-verified with a REAL physical topple (not a synthetic
      Transform write — that got silently overwritten by Havok on the
      next physics step, confirming why): `[state] kubb felled]` fired
      for real with zero errors, a real "Ny runda" reset processed
      cleanly. **Also discovered**: a genuine unknown peer joined the
      default `kubborama-lobby` room mid-test — Trystero's Nostr
      signaling is public infrastructure and the room name is a fixed
      default; a real per-session room code is a legitimate follow-up
      (docs/DECISIONS.md).
- [ ] Known gap, not solved: two players grabbing the exact same
      physical stick at once is undefined (host's local grab wins in
      practice) — edge case, not the common path with 6 sticks to
      choose from.
- [x] **HUD turn/match indicator (2026-09-01)**: a new `match-row` on
      the existing HUD shows "Din tur"/"Motst. tur" while playing,
      "Du vann!"/"Du förlorade" once decided — hidden by default,
      shown only once `MultiplayerSystem.hasMultiplayerPeer()` is
      true, so solo play is completely unaffected (screenshot-
      verified identical to before). New `MatchStateChanged` event
      (`core/events.ts`) carries `mySide` so `HudSystem` never needs
      to ask `MultiplayerSystem` who's host — one-event-bus rule, no
      new cross-system coupling. What's unverified: the row actually
      appearing with a real second peer connected — needs Erik's 2
      headsets.
- [x] **MP2 phase 4 (2026-09-02)**: the guest's own PHYSICAL presence
      now actually moves to the far baseline (`maybeRepositionAsGuest()`
      teleports `this.player`, the XR rig itself, not just their
      avatar as seen by the host — phase 1's real gap, per Erik's own
      analysis). This made `applyPoseToPart()`'s mirroring dead code
      (removed) — both peers now send already-world-correct presence.
      A second physical rack (`stick-rack-2`/`-collider`) sits at the
      far baseline; sticks move there when it becomes the guest's
      turn (`moveSticksToFarRack()`, mirrors each stick's current
      near-rack pose — no second hardcoded layout). **Bonus**: this
      gives real turn enforcement for free — the off-turn player's
      sticks are physically at the other table, no risky grab-
      component surgery needed after all. Mechanical pass green (209
      tests — reuses `mirrorPoseToFarBaseline`, no new pure logic).
      Live-verified: solo play's headset transform stays untouched at
      default spawn, both racks resolve with zero errors, a normal
      grab→release still works. Unverified: the guest's own reposition
      and far-table stick spawn actually happening — needs Erik's 2
      headsets.
- [x] **GATE (Erik, 2× real headsets) PASSED, 2026-09-02**: "kan
      bekräfta att de fungerar bra med 2 spelare" — the entire MP1+MP2
      stack (presence, voice, shared court, throw relay, per-side match
      state, guest reposition + second rack) confirmed working
      end-to-end for the first time. Two real findings came out of the
      same session, addressed below: turn text should be absolute
      ("Spelare A/B", not "din/motståndarens tur"), and a stick that
      keeps rolling blocks the turn from ever passing.
- [x] **Independent code review + 3 Critical fixes (2026-09-02)**:
      dispatched a fresh reviewer subagent
      (`superpowers:requesting-code-review`) over the full MP1/MP2 diff
      before trusting it further. Found and fixed 3 Critical issues
      (see docs/DECISIONS.md for full detail):
  1. `RoundEnded`'s own nested `Reset` (RoundSystem's auto-continuation
     into the next round) was silently wiping `MatchState` — kubb
     counts and turn — on literally every round transition, via
     `MultiplayerSystem.onResetForMatch()`. Fixed with a `cause`
     discriminator (`'manual' | 'roundEnd'`) on the `Reset` event so
     only a genuine manual reset touches match state.
  2. The `hello` handshake (host election) had no zod validation — an
     empty/hostile payload could spoof host status. Now parsed like
     every other message type (`core/multiplayerAuthority.ts`).
  3. `pieceSync` was applied from ANY sender, not just the resolved
     host. Now gated on `resolvedHostPeerId()`.
     7 new tests (`multiplayerAuthority.test.ts`). Important/Minor
     findings (#4-9: role-resolution race, HUD not clearing on peer
     disconnect, an avatar-creation TOCTOU, an ordering-dependency test
     gap, a haptic misattribution) filed as GitHub issues, not fixed
     inline — none block a real match, per CLAUDE.md's out-of-scope
     workflow.
- [x] **Stick force-settle timeout (2026-09-02)**: a stick that never
      comes to physical rest (found live, rolling around after the last
      throw of a turn) blocked `RoundSystem.maybeEndRound()` forever —
      and in multiplayer, that's also the turn never passing. New
      `pieces.throw.maxFlightTimeS` (5s) force-settles a stick that's
      been Flying too long regardless of actual rest state, same
      pattern as `OneShotAudioSystem`'s existing lifetime fallback.
- [x] **Absolute turn labels (2026-09-02)**: HUD's match-row now shows
      "Spelare A:s tur"/"Spelare B:s tur" (host = A, guest = B) instead
      of relative "din tur"/"motståndarens tur" — Erik found the
      relative framing ambiguous standing next to a second real player.
- [x] **Initial match-state announcement + "Du är: Spelare A/B" row
      (2026-09-02)**: Erik's "ingen är Spelare A" report was NOT a role-
      election bug (the election is provably symmetric) — match state
      was never emitted/broadcast until its first mutation, so the
      match-row stayed hidden through the host's whole first turn and
      the first label anyone saw was "Spelare B:s tur." The host now
      announces initial state the moment roles resolve, and a new HUD
      row shows each player's own fixed identity. See docs/DECISIONS.md.
- [x] **Second review round + remaining deferred findings closed
      (2026-09-02/03)**: a second independent review confirmed all
      prior fixes correct by hand-tracing and found one more Critical
      (force-settle timer never stamped for a guest's relayed throw —
      fixed via a `flyingSticks` qualify/disqualify subscription
      instead of only `onRelease()`) plus authentication gaps in
      `matchSync` (same sender-check pieceSync got) and an overclaiming
      `hello`-validation comment (tightened + corrected). Then, while
      Erik was AFK, closed all six remaining deferred findings
      (gh#9-#14): relayed-throw hand attribution, a peer-avatar
      creation TOCTOU, `moveSticksToFarRack()`'s ordering dependency
      (now a captured home pose), HUD rows not clearing on peer
      disconnect (new `MultiplayerPeerDisconnected` event), and a
      guest's first-throw relay no longer silently dropped during the
      role-resolution race (buffered + retried). 218 tests green. A
      genuine unknown peer connected to the shared lobby during
      verification gave an unplanned real confirmation of the
      announce/role-row fixes. See docs/DECISIONS.md for full detail.
