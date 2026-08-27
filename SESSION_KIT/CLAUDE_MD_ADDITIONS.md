<!-- MERGE this block into the scaffold-generated CLAUDE.md during M0.
     Never overwrite the generated file — append/weave this in. Keep the
     combined file lean (~200 lines): these are the always-loaded rules;
     details live in docs/. -->

# KubbOrama — project rules

VR kubb game (Meta Quest 2, WebXR via IWSDK). Dev on Pop!_OS Linux.
Full plan: docs/PLAN.md · Milestones + status: docs/MILESTONES.md ·
Decisions log: docs/DECISIONS.md · Open questions: docs/QUESTIONS.md ·
Session log: docs/SESSION_LOG.md · Godot port: docs/GODOT_PLAN_B.txt

## Language
Chat with Erik in Swedish. ALL code, comments, identifiers, README, git
commits (conventional commits), issues: English.

## Precedence
Verified facts in docs/DECISIONS.md (incl. merged DERISK findings) beat
anything else, including plan text.

## Architecture (enforced at review gates)
- Functional core, imperative shell: src/core/* has NO three.js/IWSDK/
  Havok imports — plain data in/out. systems/* are thin adapters.
- One event bus (core/events.ts). Scoring, stats, audio, haptics,
  network all subscribe — never count/trigger ad hoc.
- DRY: every constant/mapping/string defined once (config.ts, core/*),
  imported everywhere. Extract logic on second occurrence — but don't
  abstract incidental similarity.
- Portability: config/presets/i18n/stats-schema/ghosts/golden-throws
  are JSON files loaded by code, never code literals. Boring TS in core;
  math documented in comments. Assets: GLB/KTX2/HDR/OGG only.

## TypeScript & testing
- strict + noUncheckedIndexedAccess + exactOptionalPropertyTypes;
  no-explicit-any = error; prettier.
- TDD (red-green-refactor) for the pure core; adapters covered by
  golden throws + emulator MCP checks instead.
- SI units; suffix ambiguous names (speedMps, angleRad). No
  Math.random() in game code — seeded RNG. zod at untrusted boundaries.
- Physics tests assert RANGES, never exact positions.

## Workflow
- One milestone per session (kickoffs: docs/sessions/M*.md). End-of-
  session ritual: update docs (incl. README.md when anything user-facing
  changed — play URL, features, setup steps), file issues, tag milestone,
  handover in docs/SESSION_LOG.md.
- Spec before code: short plan approved before implementing.
- Milestone review gate before "done": mechanical pass → fresh-eyes
  subagent review → adversarial pass → go/no-go summary to Erik (or
  self-approved + flagged when autonomous). Foundation-breaking findings
  are fixed NOW, never filed.
- Out-of-scope findings → GitHub issues (one label: bug/feature/
  tech-debt/follow-up + [mN] in title). Check duplicates first.
- Three alternatives when asking Erik anything open; when autonomous:
  decide, log in docs/DECISIONS.md, batch questions in docs/QUESTIONS.md.
  Autonomy is reversible-only; human gates (M0 headset, M2 feel
  calibration, M5 perf) are parked, never self-approved.
- Spike rule: uncertain IWSDK APIs get a time-boxed throwaway spike
  before design builds on them; findings → docs/DECISIONS.md.

## Secret hygiene (PUBLIC repo — history is forever)
No secrets exist in this project by design; keep it that way. Never
commit tokens/keys/.env/credentials — future secrets go in Actions
secrets or git-ignored .env. Committed telemetry/golden JSONs are
sanitized (pose/physics only — no profile names, userAgents, IPs).
Debug reports are pasted in chat, never committed. Push protection is
enabled — if it blocks a push, the block is CORRECT: stop and fix.

## Token economy (spend context like money)
- Prefer TEXT over pixels: scene_get_hierarchy / ecs_query beat
  browser_screenshot (images are token-expensive); screenshots only when
  layout/visuals are the question, at small screenshotSize.
- Read logs FILTERED (channel tags + pattern), never dump full consoles.
  Quiet test reporters in CI (vitest dot); paste failures, not full runs.
- Don't re-read unchanged files; reference paths instead of quoting file
  bodies back; batch related edits into one pass.
- Use subagents for broad exploration/review so the main context stays
  lean; /compact at natural breakpoints instead of pushing a bloated
  session onward.
- Effort level: default is fine for milestone work; drop effort for
  mechanical chores, raise only for gnarly physics debugging.

## Verification tools
IWSDK MCP servers from .mcp.json (32 tools: screenshots, simulated
input, ECS pause/step/snapshot/diff) — verify every milestone in the
emulator BEFORE requesting headset tests. chrome-devtools-mcp for
console/network/perf. context7 for current library docs. Structured
logger with channel tags ([throw], [physics]...) — read via
browser_get_console_logs pattern filter. Port is dynamic: trust
`npx iwsdk dev status`.
