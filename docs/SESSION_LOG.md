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
