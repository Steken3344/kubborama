# KubbOrama — Milestones & status

Update the checkboxes and status lines as work progresses. A milestone is
DONE only after its review gate (see CLAUDE.md) and, where marked, Erik's
headset gate. Tag on completion: v0.1-m0 ... v0.7-m6.

## M0 — Setup `status: in progress — pending headset gate`

- [x] Preflight pass/fail table reported (Node 22, git, gh; adb/blender/
      godot optional)
- [x] Scaffold run in place at repo root (exact command in
      docs/DECISIONS.md)
- [x] iwsdk.config.json: `physics: true` (CRITICAL — default is false!),
      locomotion off (set directly via CLI flags, verified in the file)
- [x] Emulator scene runs; verified via CLI (screenshot + simulated
      `xr enter`/`xr status`) — see docs/DECISIONS.md. IWSDK MCP servers
      themselves still need Erik to restart Claude Code in this
      directory before they're callable as tools in-session.
- [x] TS strict + eslint + prettier + vitest wired; CI: typecheck+lint+
      test+build on push (`.github/workflows/ci.yml`)
- [x] GitHub Pages deploy via Actions (base './' — verify after first
      deploy) — `.github/workflows/deploy.yml`, Pages source set to
      "workflow" via `gh api`
- [ ] Deployed URL verified on desktop AND Quest browser (pending first
      push + Actions run)
- [x] GitHub labels created (bug/feature/tech-debt/follow-up)
- [x] Secret scanning + push protection enabled on the repo (public!);
      .gitignore covers .env and assets/raw/
- [x] Docs decomposed: CLAUDE.md merged (from SESSION_KIT/
      CLAUDE_MD_ADDITIONS.md), docs/PLAN.md, docs/MILESTONES.md (this
      file), docs/DECISIONS.md (seeded from DERISK_FINDINGS), docs/
      QUESTIONS.md, docs/SESSION_LOG.md, docs/sessions/ (from SESSION_KIT)
- [x] README with headset testing steps (dynamic port via dev status)
- **GATE (Erik, headset): open deployed URL in Quest browser, enter VR** 🎧
  — pending: needs the first push + a completed Pages deploy

## M1 — Scene `status: not started`

- [ ] config.ts loads JSON: court presets (orientation: baselines =
      SHORT sides!), piece dims/masses, camera poses, 0-100 mappings
- [ ] Garden: grass ground (Grass004 tiled), HDRI sky+IBL (autumn_park),
      1 directional light, hemisphere tint; fence + 3-5 Kenney trees
- [ ] Court: 4 corner stakes (no lines by default); king center; 5 kubbs
      along far short baseline; 6 sticks lying scattered by player
      baseline; pieces sunk 2-3 mm into grass; blob shadows
- [ ] All pieces physics bodies (Jolt-portable dims); eye height 1.6 m
- [ ] fetch-assets.sh run; ASSETS.md license log started
- [ ] Emulator verification via MCP (screenshot review of layout/scale)
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
