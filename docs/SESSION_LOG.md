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

Remaining before the M0 headset gate: commit + push, confirm the
GitHub Actions CI and Pages-deploy runs go green, then hand off to Erik
to open the deployed URL on the Quest 2 and restart Claude Code here so
the IWSDK MCP servers load for future sessions.
