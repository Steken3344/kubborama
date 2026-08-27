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
      center; 5 kubbs evenly spaced along the far short baseline; 6
      sticks lying scattered near the player baseline (seeded RNG, not
      Math.random); kubb/king sunk 2-3mm into grass visually (collider
      unchanged). Real dynamic shadows used instead of blob-shadow
      decals — strictly better grounding, same visual goal.
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

## M2 — Throwing (THE milestone) `status: not started`

- [ ] core/throwRelease.ts (TDD): ring buffer, frame-averaged release,
      lever-arm v_com = v_hand + ω×r — heavily unit-tested
- [ ] End grip (handle offset, last ~8 cm); DistanceGrabbable pull
      (returnToOrigin OFF!); direct grab by bending down
- [ ] Stick state machine Racked→Held→Flying→Settled
- [ ] Impact detector (|Δv| heuristic, pure core — no collision API
      exists; M3 reuses its events)
- [ ] Haptics library (grabTick, releaseClick, impactRumble(f), ...)
- [ ] Throw telemetry logged per throw (speed, spin, flight, landing,
      preset) — JSON, engine-neutral
- [ ] Tuning lab: 0-100 params + live meters + ballistic target bands
      (8 m ≈ 8.5 m/s, spin 3-13 rad/s) + presets A/B/C + JSON export/import
- [ ] Underhand classifier + flip-quality meter + HUD badge
- [ ] Both spin styles honest (flat AND backspin); angular damping tunable
- [ ] Golden-throw regression scripted via MCP (xr_animate_to arc)
- **GATE (Erik, headset): feel calibration — 10-15 flat + 10-15 backspin
  throws recorded to JSON; structured feedback (words + numbers)** 🎧
- Review gate → tag v0.3-m2

## M3 — Toppling, rounds & stats `status: not started`

- [ ] core/topple.ts: tilt >threshold + at-rest; king separate event
      (consumes the M2 impact detector's events)
- [ ] Round loop: 6 sticks, result screen, auto-reset; core/scoring.ts
      reducer (TDD with event sequences)
- [ ] core/stats.ts: PBs (fewest sticks, most felled, streak, longest
      throw, longest felling throw), lifetime totals (incl. play time,
      accuracy), versioned zod schema (+ reserved userId/matches)
- [ ] HUD: round counts + relevant PB
- Review gate → tag v0.4-m3

## M4 — Wind, tunables & settings `status: not started`

- [ ] wind.ts: force on Flying sticks only; dragFactor in config
- [ ] Settings panel: music/SFX volume, haptics toggle+intensity,
      language (sv/en), mode Simple(6x3, wind 0, topple 50°)/Advanced
      (8x5, wind 1.5 m/s, topple 60°), local profile name (non-blocking
      first-run), stats tab, court-lines toggle
- [ ] i18n complete — zero hardcoded strings; åäö verified in font atlas
- [ ] Dev debug panel (tweakpane reuse); optional leaf wind indicator
- Review gate → tag v0.5-m4

## M5 — Polish & performance `status: not started`

- [ ] SFX inventory (Kenney Impact Sounds): klonk variants, pitch random,
      volume by force; ambience birds (2-3 positional in trees)
- [ ] Cozy music loop (Pixabay; ASSETS.md log; music/SFX channels)
- [ ] GC/pooling pass (no per-frame allocations); optional king-cam slow-mo
- [ ] 72 Hz verified ON QUEST 2 (chrome-devtools via adb — needs USB card)
- **GATE (Erik, headset): perf + comfort + full experience pass** 🎧
- Review gate → tag v0.6-m5

## M6 — PWA (optional) `status: not started`

- [ ] vite-plugin-pwa: manifest, icons, service worker; installable from
      deployed URL; launches fullscreen from Quest app library
- Review gate → tag v0.7-m6 → POC COMPLETE 🎉
