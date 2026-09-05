# KubbOrama — decision log

Append-only. Newest entries at the bottom. Verified facts here beat
anything in docs/PLAN.md or session prompts when they conflict.

## 2026-08-26 — Pre-M0 de-risk spike (scaffold verified in cloud sandbox)

The IWSDK project was scaffolded, typechecked and built successfully
ahead of session 1. These are verified facts, not assumptions.

**Scaffold command (verified working):**

```
npm create @iwsdk@latest kubborama -- --yes --target vr --language ts --install --git
```

Node engines requirement (from generated package.json):
`>=20.19 <21 || >=22.12 <23 || >=24` (nvm install 22 is safe).

**Physics is OFF by default with `--yes`.** The physics prompt defaults
to No; verified in the generated `iwsdk.config.json`:
`world.features: { grabbing: true, physics: false, locomotion: {...},
sceneUnderstanding: false, spatialUI: {kit:"horizon"} }`. Must be
flipped to `true` (see M0 log entry below — resolved by using the
`--physics`/`--no-locomotion` CLI flags directly).

**Asset & project conventions** (from the official setup guide):

- `public/gltf/<model-name>/` — each 3D model in its own subfolder with
  its textures (Kenney props go here, one folder per merged GLB).
- `public/textures/` — standalone textures (wood, grass).
- `public/audio/` — sound files (klonk, birds, music).
- `public/scenes/main.iwsdk.scene.json` — declarative scene file (level
  composition); `src/assets.ts` + `src/components.ts` are referenced by
  `iwsdk.config.json` as asset/component modules.
- `ui/*.uikitml` — spatial UI markup, compiled to `public/ui/`.
- Dev server: Vite may pick a port dynamically — always trust
  `npx iwsdk dev status` for the real URL rather than assuming 8081.

**Claude Code integration is wired automatically.** The scaffold
generates `.mcp.json` with three MCP servers preconfigured (absolute
local paths): `iwsdk-runtime`, `iwsdk-reference`, `metavr`; plus
CLAUDE.md (IWSDK-specific guidance), AGENTS.md, `.claude/` (skills),
`.cursor/`, `.codex/`, `.github/`. No manual MCP wiring needed — restart
Claude Code in the project directory to pick up `.mcp.json`.

**Dev server facts:** `npm run dev` runs `iwsdk dev up --open
--foreground` (not plain vite). Port 8081 by default but may vary —
always confirm via `npx iwsdk dev status`; host `0.0.0.0` (LAN access
already enabled). `npm run dev:status` / `dev:down` manage the dev
daemon.

**Dependency facts (do not "fix" these):**

- `three` is Meta's fork: `"three": "npm:super-three@0.181.0"` —
  required by IWSDK. Never replace with vanilla three or add a second
  three copy.
- `vite.config.ts` already sets `base: './'` (relative) — likely works
  on GitHub Pages subpaths as-is; verify on first deploy before
  touching it.
- `@babylonjs/havok` is excluded from `optimizeDeps` (WASM) — leave it.
- Starter includes demo content to strip in M1: `src/robot.ts`,
  `src/robot-component.ts`, `src/panel.ts` (keep as reference for
  System/Component patterns until replaced).

**Verified API names** (read from installed `.d.ts` — use these
exactly):

Physics (`@iwsdk/core`): `PhysicsBody` (state: `PhysicsState.Static|
Dynamic|Kinematic`, `linearDamping`, `angularDamping`, `gravityFactor`
per body), `PhysicsShape` (`PhysicsShapeType`), `PhysicsManipulation`
(`{ force, linearVelocity, angularVelocity }` — **one-shot**, applied
once then auto-removed from the entity), `PhysicsSystem` (global config
incl. `gravity: Vec3`).

Grab (`@iwsdk/core`): `OneHandGrabbable`, `TwoHandsGrabbable`,
`DistanceGrabbable`, `Grabbed` (state component), `GrabSystem`,
`MovementMode`.

Audio (`@iwsdk/core`): `AudioSource`, `AudioSystem`, `AudioUtils`,
`AudioInstance`, `AudioPool`, `PlaybackMode`, `DistanceModel` (spatial
audio built in).

**Design knots resolved:**

1. Throwing: on release, add `PhysicsManipulation` with the
   frame-averaged `{ linearVelocity, angularVelocity }`. One-shot
   semantics fit a throw perfectly.
2. Wind: `PhysicsManipulation` is one-shot, so wind = re-add the
   component with the wind force **every tick** to sticks in `Flying`
   state (supported pattern), not a persistent force field.
3. Variable gravity: two levers — `PhysicsSystem` global gravity (Vec3)
   for the world setting, and per-body `gravityFactor` for special
   effects.
4. Kubb pieces at rest: tune `linearDamping`/`angularDamping` on
   `PhysicsBody` to stop endless micro-wobble.

**Knots that remained open (watch during M0):**

- `npx iwsdk reference warmup` fetches reference assets from unpkg.com;
  failed with HTTP 403 in the sandbox (network restrictions). Should
  work on a normal home connection — retry if it fails; project still
  builds/runs without it.
- Build warns about >500 kB chunks — fine for the POC; revisit with
  `manualChunks` if initial load feels slow on Quest (file an issue,
  don't fix in M0).

**Final API audit — 4 findings:**

1. **No public collision-event API.** Physics typings expose no
   `onCollision`/contact callbacks. Impact detection = a pure-core
   velocity-delta heuristic: track each piece's velocity per tick;
   `|Δv|` above a threshold = impact, magnitude scales sound/haptics.
   Fully unit-testable, no engine coupling. (Topple detection never
   needed collision events.)
2. **Grab system does not transfer velocity on release** — confirmed by
   the typings ("interactions should track grab/release events
   themselves"). The M2 throw-release design (frame-averaged hand
   velocity + lever-arm term + `PhysicsManipulation`) is required, not
   optional.
3. **End grip is supported**: grab Handles take `targetPosOffset` /
   `targetQuatOffset` (+ `detachOnGrab`, `moveSpeedFactor`) — spike the
   exact option surface in M2. Gotcha: `DistanceGrabbable` has
   `returnToOrigin` which snaps objects back on release — must be OFF on
   sticks.
4. `AudioUtils` ships `play(entity, fadeIn)`/`stop` plus one-shot audio
   entities that auto-remove after playing.

**IWSDK MCP tools** (32 tools, 9 categories — from Meta's docs):
Session (`xr_get_session_status`, `xr_accept_session`, `xr_end_session`),
Transforms (`xr_get_transform`, `xr_set_transform`, `xr_look_at`,
`xr_animate_to`), Input (`xr_set_input_mode`, `xr_set_select_value`,
`xr_select`, `xr_get_gamepad_state`/`xr_set_gamepad_state`), Browser
(`browser_screenshot`, `browser_get_console_logs`,
`browser_reload_page`), Scene (`scene_get_hierarchy`,
`scene_get_object_transform`), and an 11-tool ECS debugging suite
(`ecs_pause`, `ecs_resume`, `ecs_step`, `ecs_query_entity`,
`ecs_find_entities`, `ecs_list_systems`, `ecs_list_components`,
`ecs_toggle_system`, `ecs_set_component`, `ecs_snapshot` (keeps 2),
`ecs_diff`). Consequences: (1) full scripted throw simulation is
possible in the emulator (place hand → grip → sweep via `xr_animate_to`
→ release → assert landing/topple) making M2 golden-throw regression
scriptable without a human for the mechanical part; (2) `ecs_pause` +
`ecs_step` (fixed timestep) + `ecs_snapshot`/`ecs_diff` gives
frame-by-frame physics debugging. Gotchas: `ecs_step` requires
`ecs_pause` first; gamepad tools don't work in hand-tracking mode;
console logs exclude debug level by default; Y = 1.6 m is standing eye
height.

**The garden feeling is built in** (verified by reading installed
`@iwsdk/core` typings) — don't hand-build:

- `DomeTexture` (equirectangular sky from one HDR/EXR/png/jpg/KTX2 file)
  - `IBLTexture` (image-based lighting, PMREM → `scene.environment`,
    same file) = sky + natural sun lighting in two components.
    `DomeGradient`/`IBLGradient`/`GradientEnvironment` for a procedural
    sky alternative (dusk/dawn later).
- Declarative lights: `DirectionalLightComponent` (sun),
  `AmbientLightComponent`, `HemisphereLightComponent` (nice over grass),
  plus Point/Spot/RectArea, with `LightShadowSpec`/`LightShadowMapSize`.
- `AudioSource` (`loop`, `autoplay`, `positional`, `refDistance`,
  `rolloffFactor`, `maxDistance`, `distanceModel`, `volume`) — 2-3
  positional bird loops in the trees + one non-positional music source.
- `LevelSystem`/`LevelRoot` + SceneJSON import for level composition;
  `AssetManager` with manifest/caching for GLTF loads (use instead of
  raw `GLTFLoader`).

Consequence: `environment.ts` in M1 is small — one `DomeTexture` + one
`IBLTexture` (same HDR), one `DirectionalLightComponent`, one
`HemisphereLight` for grass tint, ground plane + court, Kenney props via
`AssetManager`; M5 adds 2-3 positional bird `AudioSource`s + one
non-positional music source.

**Troubleshooting quick-reference:**

- "Enter XR" button missing → almost always not served over HTTPS (or
  sessionMode/browser mismatch) — first thing to check.
- Hand tracking not working → must be enabled in `World.create()`/config
  XR features (ours already is).
- Generated assets missing → GLXF output belongs in `/public/glxf`;
  compiled UIKitML JSON belongs in `/public/ui`. If files "don't exist",
  the generation step didn't run.
- Asset optimization: the IWSDK Vite plugin has its own dependency-aware
  optimization pipeline. Use its dependency blocking rather than adding
  a second manual optimization pass; in M1, inspect what the plugin
  already does to `public/gltf`/`public/textures` before reaching for
  manual gltf-transform/KTX2.

**Timing note:** the USB-C card is not a blocker — M0-M4 need no USB at
all (desktop emulator + Wi-Fi/Pages URL for headset checks). Only M5
on-headset DevTools profiling and adb conveniences wait for the card.

## 2026-08-27 — M0: decided autonomously

Per the autonomous-operation rules (three alternatives considered, one
picked, recorded here for audit):

**Where to scaffold.** Options: (a) `npm create @iwsdk@latest
kubborama` into a fresh nested folder as the original start-prompt
literally said, (b) scaffold into a separate sibling directory and
manually merge files up, (c) scaffold **in place** at the repo root
using `create-iwsdk`'s `.` target with `--force`. **Chose (c)**: this
directory is already the git repo with `origin` set to
`Steken3344/kubborama` and one commit pushed — nesting a `kubborama/`
folder inside it would create a confusing double-nested layout the
start-prompt author didn't anticipate (it was written before the repo
folder existed). The CLI's own `--force` flag ("overwrite conflicting
generated files in a non-empty target directory; unrelated files
preserved") is designed for exactly this. A safety-checkpoint commit of
all pre-existing untracked docs was made immediately before scaffolding
so any unwanted overwrite would show as a clean diff.

**How to fix the physics-off default.** DERISK's workaround was a
manual post-scaffold edit of `iwsdk.config.json`. Re-checked
`create-iwsdk --help` at scaffold time and found the CLI (v0.5.3) now
exposes `--physics`/`--no-physics` and `--locomotion`/`--no-locomotion`
flags directly. **Chose to pass `--physics --no-locomotion` at scaffold
time** instead of editing generated JSON afterward — same result, one
fewer manual step, verified in the resulting `iwsdk.config.json`
(`physics: true`, `locomotion: false`).

**Git flag at scaffold time.** Options: `--git` (re-init), `--no-git`
(leave existing repo alone), or delete `.git` first. **Chose
`--no-git`**: git was already initialized with history, remote, and gh
auth configured before this session — re-initializing would risk
clobbering that state for no benefit.

**What to delete after decomposition.** The plan explicitly says
`IMPLEMENTATION_AND_ASSETS.txt`'s root copy is deleted once it becomes
`docs/PLAN.md` ("never keep two copies"), and the same logic was applied
to `DERISK_FINDINGS.txt` (merged into this file), `GODOT_PLAN_B.txt`,
`KUBB_RULES_REFERENCE.md`, and `SESSION_KIT/` (all moved/merged into
`docs/`). `CLAUDE_CODE_START_PROMPT.txt` itself is not named in the
decomposition-target list, but its stated purpose — "a one-time
bootstrap; future sessions must never need to re-read it" — and its
size (51 KB) argue for removing it from the working tree once every
substantive instruction in it is represented in CLAUDE.md + docs/. Kept
in git history (this commit and the checkpoint commit before it) for
anyone who wants the original wording. `SESSION_KIT/
DAGENS_PREP_CHECKLISTA.txt` (Erik's personal pre-session checklist, in
Swedish) was already fully executed before this session started
(node/gh/adb already installed and configured, GitHub secret scanning
already on) — removed for the same reason.

## 2026-08-27 — M0: preflight results

node v22.23.2 (project `.nvmrc` pins `22.12.0`; both satisfy the
`>=20.19 <21 || >=22.12 <23 || >=24` engines range) · npm 10.9.8 · git
2.43.0 · adb 1.0.41 (udev rules already present, `adb` resolves without
sudo) · gh 2.96.0, already authenticated as `Steken3344` with `repo`
scope · blender and godot not installed — both optional/warn-only per
the start prompt (godot is only needed at Godot-port time). MCP:
`context7` and `chrome-devtools` were already connected before this
session; `iwsdk-runtime`/`iwsdk-reference`/`metavr` only exist after
scaffolding (`.mcp.json` is generated by the CLI, gitignored by the
scaffold's own template since it embeds this machine's absolute paths)
and still need a Claude Code restart in this directory to be picked up
as tools in _this_ session — see the entry below for how M0's emulator
verification was still completed without that restart.

## 2026-08-27 — M0: dev server already serves HTTPS; emulator verified via CLI

`npx iwsdk dev status` after `npm run dev` reports `localUrl:
"https://localhost:8081/"` and HTTPS `networkUrls` for the LAN
interfaces too — the dev server serves HTTPS **out of the box**, no
`@vitejs/plugin-basic-ssl` needed. This resolves the start prompt's
open question for headset testing method (b) (same-Wi-Fi against the
live dev server): just open `https://<LAN-IP>:<port from dev status>`
in the Quest browser and accept the self-signed certificate warning.

Also verified: the IWSDK CLI (`npx iwsdk browser screenshot`, `npx
iwsdk xr enter/exit/status`) drives the exact same managed-browser
command bridge as the MCP tools ("MCP and CLI are one surface" per the
generated CLAUDE.md) — so the M0 "emulator runs, MCP verified
(screenshot + simulated input)" checklist item could be completed
**before** a Claude Code restart, entirely from this session's Bash
tool: `npx iwsdk dev up --open` (backgrounded) → poll `npx iwsdk dev
status` until `browserCommandReady: true` → `npx iwsdk browser
screenshot` (confirmed: default IWSDK "Hello, Immersive Web!" demo
scene renders — desk + robot + WebXR panel, no console errors) → `npx
iwsdk xr enter` → `npx iwsdk xr status` (confirmed: `sessionActive:
true`, `sessionMode: "immersive-vr"`, hand-tracking enabled) → second
screenshot (confirmed: first-person view with both controllers
visible, "Remote Control Active" indicator) → `npx iwsdk xr exit` →
`npx iwsdk dev down`. The three IWSDK MCP servers themselves
(`iwsdk-runtime`, `iwsdk-reference`, `metavr`) still need Erik to
restart Claude Code in this directory before they appear as callable
tools in a session — that part of the M0 checklist is still pending.

## 2026-08-27 — M0: milestone review gate

Mechanical pass: CI green on first push (typecheck, lint, format:check,
test, build all pass; Pages deploy green, `https://steken3344.github.io/kubborama/`
returns 200 with assets loading via the unchanged `base: './'` path).

Fresh-eyes review: a separate subagent with no implementation context
reviewed the M0 diff cold (secret hygiene, clean-clone-and-build
reproducibility, CLAUDE.md merge coherence, docs decomposition
integrity, CI/deploy workflow correctness, config sanity, README
accuracy). Verdict: **GO**, no blockers. Two low-severity findings: (1)
`docs/PLAN.md` had a stale header referencing the deleted
`CLAUDE_CODE_START_PROMPT.txt` and a "put this file in the repo root"
instruction that no longer applied — fixed immediately (trivial,
foundation-adjacent enough to fix now rather than file); (2) `ci.yml`
and `deploy.yml` both rebuild the project on every push to main
(redundant, not incorrect) — filed as
[#1](https://github.com/Steken3344/kubborama/issues/1) (tech-debt),
not urgent enough to fix now.

Adversarial pass: M0 has no interactive game logic yet to attack in
the usual sense (grab-two-sticks, throw-straight-down etc. start at
M2), so the adversarial check here was aimed at the milestone's actual
deliverable — the CI gates themselves. Verified each gate genuinely
fails on a violation rather than being a no-op: a temporary `any`-typed
file failed `eslint` (`no-explicit-any`); a temporary
badly-formatted file failed `prettier --check`; a temporary type
mismatch failed `tsc --noEmit`; a temporary deliberately-failing test
failed `vitest run` (exit 1). All four scratch files were deleted
after the check, never committed.

Go/no-go: **GO**, presented to Erik. The one remaining item is the
human headset gate (open the deployed URL on the Quest 2, confirm
"Enter XR" works) — parked, cannot be self-approved.

## 2026-08-27 — M0: headset gate passed; `metavr` MCP server cannot run on Linux

Erik opened https://steken3344.github.io/kubborama/ on the Quest 2 and
confirmed "Enter XR" works, landing in the default IWSDK demo room
(expected — the actual garden/court doesn't exist until M1). **M0
headset gate: PASSED.**

After restarting Claude Code in this directory, `iwsdk-runtime` and
`iwsdk-reference` connected successfully, but `metavr` failed with
`CONNECTION_CLOSED`. Root cause found by running its binary directly:

```
Error: metavr could not locate its platform binary.
metavr: unsupported platform "linux-x64" (supported: darwin-arm64, darwin-x64, win32-x64)
```

`@meta-quest/metavr` ships prebuilt native binaries for macOS and
Windows only — there is no Linux build. This is a permanent limitation
on this dev machine (Pop!_OS), not a misconfiguration; do not spend
time retrying or reinstalling it in future sessions. Everything M0-M6
need from Meta-specific tooling is covered by `iwsdk-runtime` (browser/
scene/ECS/XR simulation) and `iwsdk-reference` (docs), plus `adb` for
the real headset — `metavr`'s absence is not expected to block any
milestone. If a future milestone turns out to need it specifically,
that's a reason to revisit, not before.

## 2026-08-27 — M1: `DomeTexture`/`IBLTexture` `src` needs the full `textures/` path

Despite the component schema saying `subfolder: 'textures'`
(`packages/core/src/environment/dome-texture.ts`), that metadata is
**not** auto-prepended at runtime. Setting `src: "autumn-park-1k.hdr"`
resolved to a literal `autumn-park-1k.hdr` request (404 → the HDR
loader choked on the resulting HTML error page: "Bad File Format: bad
initial token"). Fix: `src: "textures/autumn-park-1k.hdr"` — same
convention as glTF asset URLs. Verified by console log diffing a
before/after `scene_render_file` call. `subfolder` is editor-only
metadata (asset-picker organization), not a resolution rule — treat it
as such for any future `Types.FilePath` component field.

## 2026-08-27 — M1: baked-in mesh rotation desyncs the physics collider

The stick asset originally baked its "lying flat" 90° tilt into the
`CylinderGeometry` itself (`geometry.rotateZ(...)`), keeping the scene
node's `rotationDeg` as pure yaw. This looked correct in every
`scene_render_file` screenshot (the **editor** doesn't run
`PhysicsSystem`) but was wrong: `PhysicsShapeType.Cylinder` always
assumes height-along-local-Y, using the node's transform — it knows
nothing about vertices baked into the geometry. Verified with
`ecs_pause` + `ecs_step` + `ecs_query_entity` on the **runtime**: sticks
settled at `y≈0.16` (half of the 0.3 m height — an upright collider)
while the visual mesh clearly lay flat on the ground, a ~14cm
invisible mismatch between what you see and what you can throw at.

Fix: never bake a "how it's oriented on the ground" rotation into an
asset's geometry when that asset also has a physics shape — geometry
stays canonical (cylinder height along Y), and the _node_ transform
carries the full orientation (`rotationDeg: [0, yawDeg, 90]`) so the
mesh and the collider rotate together. Lesson for M2+: any procedural
asset that will get a `PhysicsShape` must keep its geometry in the
shape's canonical local axes; all placement/orientation belongs in the
scene node, not the asset module. Caught only because the runtime was
checked with `ecs_step`, not just the editor screenshot — this is
exactly the "editor doesn't run application systems" trap CLAUDE.md
warns about, now with a concrete example.

**Same-session near-miss, avoided:** the fence line's first placement
(`rotationDeg: [0, 180, 0]` on a `pattern` node with `step: [1,0,0]`)
put all 5 sections roughly 4-8m in the wrong direction, because a
180° yaw flips which way positive local X points before the pattern's
`step` is applied — not obvious without rendering it. Fixed by
dropping the rotation entirely and placing the pattern's own position
where the first section should start (`[-2, 0, 2.2]`, no rotation,
`step: [1,0,0]`) — simpler and easier to reason about than rotating a
repeated linear distribution. General rule adopted: prefer un-rotated
pattern nodes and encode direction via `step`'s sign/axis instead.

## 2026-08-27 — M1: milestone review gate

Mechanical pass: green (typecheck, lint, format:check, 19 tests across
4 files, build; CI green on push).

Fresh-eyes review (separate subagent, no implementation context):
independently verified the functional-core boundary (no three.js/
IWSDK/Havok imports in `src/core/*`), TDD evidence in the `rng`/
`court-layout` commit, DRY sourcing of dimensions/masses/poses, SI
naming, the seeded-RNG-not-Math.random rule, and — critically —
independently re-verified both bug fixes from the entries above by
running the runtime itself (queried `stick-0`'s settled Y after
`ecs_pause`, confirmed ~0.032 m not the old buggy ~0.16 m). One
worth-fixing finding: scene JSON positions are undocumented/unguarded
literal copies of `courtLayout()`'s output (inherent to the scene
format — it can't call functions — but nothing would catch drift if
`src/data/*.json` changed). Fixed immediately: added
`src/scene-sync.test.ts`, a vitest that reads the scene file and
asserts every king/kubb/stake/stick position matches `courtLayout()`.
Flagged for M4 planning, not an M1 blocker: the baked-JSON position
approach will need to become dynamic once Simple/Advanced game modes
(different court presets) exist.

Adversarial pass: (1) long-run physics stability — stepped ~800+ fixed
frames (~11s simulated) past initial settling and re-queried king/
kubb-4/stick-5: all still at zero velocity, no drift, no explosion;
(2) stress-tested `computeCourtLayout()` across all 3 court presets
(backyard/tournament/kids) × 200 seeds each (600 combinations):
verified every kubb/stick stays within the court width, every stick
stays between the two baselines, no duplicate stick positions, king
always sits strictly between baselines, and no kubb lands within 8cm
of a corner stake's x-position. Zero failures.

Go/no-go: **GO**, presented to Erik. Tagging v0.2-m1.

## 2026-08-27 — M2: end grip emerges from the actual grab point, not a configured offset

DERISK's note "End grip is supported: grab Handles take
`targetPosOffset`/`targetQuatOffset`" turned out to describe
`DistanceGrabbable`'s `MoveTowardsTarget` mode only (positioning where
a distance-pulled object snaps to relative to the pointer) —
`OneHandGrabbable` has no offset field at all (verified by reading its
full field list: `rotate`, `rotateMax/Min`, `translate`,
`translateMax/Min`, nothing else). For a direct/proximity grab,
`@pmndrs/handle`'s `HandleStore` preserves whatever relative transform
existed between hand and object at grab time — there's no "anchor
point" to configure.

**Decision: don't fight this, use it.** `systems/throwing.ts` computes
the lever arm (`p_com - p_hand`) fresh at release time from the
entity's actual current world position and the last sampled hand pose
— wherever the player actually grabbed the stick. This is more
physically correct than a hardcoded end-grip offset would have been:
a real player grabbing near the middle vs. near the end produces a
correspondingly different (correct) lever-arm term, exactly matching
reality. `DistanceGrabbable`'s `targetPositionOffset` is left at
default (identity) for now — distance-grabbed sticks currently snap
center-to-hand rather than end-to-hand, a visual-only gap (the release
physics is unaffected) noted as a follow-up, not fixed now since it
doesn't touch correctness.

## 2026-08-27 — M2: MCP-scripted throw magnitude is unreliable; verified logic correctness a different way

Tried to build the "golden-throw" harness DERISK anticipated (grip →
`xr_animate_to` sweep → release → assert outcome) and hit a real
tooling limitation, not an app bug:

- `xr_animate_to` **blocks until the animation fully completes**, so
  by the time a _separate_ release command executes, the controller
  has already been stationary for the real time the tool round-trip
  took. The 5-frame pose ring buffer correctly reflects "hand not
  moving" — `releaseSpeedMps: 0` in that setup is the _correct_ output
  for the _actual_ (bad) input, not a bug.
- Switching to `ecs_pause` + `ecs_step(1)` per swing waypoint
  (`xr_set_transform`, not `xr_animate_to`) fixed that: `samplePose`
  ran exactly once per step, confirmed via a temporary diagnostic dump
  of the full pose buffer. But the `time` value passed to
  `system.update()` under `ecs_step` turned out to be **real elapsed
  wall-clock time** (Three.js `Clock.elapsedTime`, which keeps
  advancing during "pause" — only system _updates_ are skipped, not
  rendering/the clock), not a synthetic fixed `1/72s` per step as the
  tool's own description implies for physics substeps. Real MCP
  round-trip latency between calls (1-3+ seconds) became the `dt` in
  the velocity math, deflating the result by ~2 orders of magnitude
  while preserving the _correct sign and direction_ (verified by hand:
  the computed velocity's `+x/+y/-z` signs matched the swing's actual
  `+x/+y/-z` displacement exactly).
- A follow-up `ecs_query_entity` read-back of `PhysicsBody
_linearVelocity` after resuming produced the same numeric value
  (`[7.195, 7.863, -7.195]`) across two independently-scripted runs
  with different logged release speeds — almost certainly the
  managed window's editor/runtime tab split (`Runtime`/`Editor` toggle
  visible in every screenshot) being queried inconsistently rather
  than a real reading; not chased further given the cost already
  sunk.

**What's actually verified, and how:**

- Pure math (`computeHandVelocity`, `computeReleaseVelocity`,
  `angularVelocityBetween`): rigorous, deterministic unit tests
  (`src/core/*.test.ts`) — this is the part correctness actually
  depends on.
- Live wiring: grab → `StickState` `HELD`, release → `FLYING` →
  (after rest) `SETTLED`, `[grab]`/`[throw]`/`[state]` logs firing
  with plausible content, `PhysicsManipulation` being added (confirmed
  by the phase transition itself — `PhysicsSystem` wouldn't move a
  static-until-then body without it) — all confirmed live in the
  runtime across multiple grab/release cycles.
- **Not** verified by this session: real-world throw _magnitude_ and
  _feel_. That was never this session's job — it's explicitly reserved
  for Erik's real headset throws at the M2 calibration gate, which is
  why the milestone doc says not to tag M2 before that happens.

Follow-up filed as tech-debt: a frame-accurate scripted golden-throw
harness (for M2's CI regression goal) needs either a way to inject a
synthetic fixed clock during `ecs_step`, or a different technique
entirely (e.g. driving pose samples directly through a test-only
seam in `ThrowingSystem` rather than through real XR device
simulation). Out of scope to solve in this session.

## 2026-08-27 — CRITICAL: top-level `await World.create(...)` breaks the production build

Erik reported the deployed site was completely blank (both desktop
browser and Quest VR). `npm run dev` and every emulator/MCP check this
session had shown a working scene — because **the dev server was never
the same code path as the production build**, and nobody had actually
loaded the built (`vite build` + serve) output in a real browser since
M0.

Bisected with git worktrees (`v0.1-m0`, `v0.2-m1`) built and served
headlessly via `playwright-core` (Chromium already cached locally at
`~/.cache/ms-playwright`), watching `pageerror`/network/worker events:

- `v0.1-m0`'s production build rendered fine (canvas present, 3 workers
  spun up, WebGL activity).
- `v0.2-m1`'s production build was blank — **even with the scene
  emptied to `nodes: []` and the asset manifest emptied to `{}`**,
  ruling out the court/pieces/Kenney assets/HDRI entirely. No console
  error, no failed request, no page error — a silent hang, not a
  crash.
- Diffing `src/index.ts` between the two tags found the actual change:
  M0's scaffold used `World.create(...).then((world) => {...})`; M1
  rewrote it to top-level `await World.create(...)`. Reverting to
  `.then()` in the M1 worktree fixed the production build completely
  (HDRI, scene.json, all 6 GLBs, Havok WASM, canvas — everything
  loaded). Applied the same fix to the real `src/index.ts`, rebuilt,
  and reconfirmed with the same headless harness: `canvasCount: 1`.

**Root cause, best understanding:** Vite/Rollup's production bundling
of a top-level `await` in the entry module behaves differently from
native browser ESM (which is what `npm run dev` actually ships
unbundled) — something about how the entry chunk gets wrapped causes
the awaited promise to never settle in the built output, while dev
mode's native per-module ESM execution tolerates it fine. Did not dig
further into _why_ Rollup's output breaks this — the fix (avoid
top-level await on `World.create()`, use `.then()`) is what matters
and matches the scaffold's own original pattern, which apparently
existed for exactly this reason and was undone by rewriting `index.ts`
in M1 without realizing the constraint.

**Process lesson, now fixed:** the M0/M1 review gates never included
"run `npm run build`, serve `dist/` for real, load it in a real
browser." `npm run build` succeeding (compiles) and the deployed HTML
returning 200 (server config right) are necessary but not sufficient —
neither proves the app actually _runs_. Every milestone from here on
must include a real production-build smoke test (`npm run build && npm
run preview`, loaded in a real or headless browser, checking for a
non-empty `#scene-container`) as part of the mechanical pass, not just
`npm run dev` / the IWSDK emulator (which uses dev-mode, unbundled
code) or a bare HTTP status check on the deployed URL.

## 2026-08-27 — M2 review gate: fresh-eyes findings, then Erik's first playtest feedback

**Fresh-eyes review** (full diff from `v0.2-m1` through the M2 core
mechanic) found no blockers. Two worth-fixing nitpicks, both fixed
immediately: a dead `pieces.throw.poseWindowSize` value in
`pieces.json` (the live window size actually comes from the tuning
preset), and a per-frame `Vec3` allocation in `ImpactSystem.update()`
(now one persisted array per entity, mutated in place, matching
`ThrowingSystem`'s `tmp*` convention). My own adversarial pass
(simultaneous two-hand grab/release with zero pose samples) found no
issues either.

Erik then played the build and sent structured feedback, addressed in
the same session rather than filed for later, since all of it was
reversible and within M2's own throw-feel/court scope:

**1. Kubbs on both baselines.** docs/PLAN.md always named the full set
as "10 kubbs, 5 per baseline — POC uses one side, full set deferred";
Erik's ask is exactly that deferred scope, not a new design. Extended
`computeCourtLayout()` (TDD: tests updated first) to mirror the far row
onto the near baseline. The near row can't sit exactly on the z=0
corner-stake line, though — the player spawns at world origin (0,0,0)
with no authored `player.transform`, so a kubb centered at x=0 there
would land exactly on the player's own spawn point. Less obviously: it
also can't sit inside the stick-scatter zone (z ∈ [-0.9, -0.15]) — see
the tunneling bug below, found because the first attempt (setback
0.3 m) put it right there. Settled on a 0.05 m setback: far enough off
the exact origin, comfortably outside the scatter zone.

**2. Throw feels good but needs less effort.** Asked for 10% less
gravity specifically. `tuning-params.json`'s `gravityMps2` default
percent 50→40 (9.81 → 8.829 m/s², exactly -10% off the 0-100 scale's
midpoint mapping) — a data-only change, the live tuning system already
applies it every frame via `TuningLabSystem.applyTuningToPhysics()`.

**3. B-menu with Reset.** New `MenuSystem` + `public/ui/reset-menu.uikitml`
(Horizon-kit `Panel`/`Button`, authored per the `iwsdk-ui` skill).
Right controller's B button (`InputComponent.B_Button`, re-exported
from `@iwsdk/xr-input` via `@iwsdk/core`) toggles the panel. Reset
replays each piece's pose exactly as it was when `MenuSystem.init()`
ran (captured once, before physics has moved anything) via
`PhysicsSystem.setBodyTransform()` — deliberately not re-derived from
`computeCourtLayout()` a second time, since that would also require
reconstructing the stick mesh's baked tip-rotation quaternion for no
benefit. A new `Resettable` tag component marks every kubb/king/stick.
Verified live: teleported a stick away via `ecs_set_component`, clicked
Reset via a ray+select on the emulated right controller, confirmed the
stick returned to its captured pose and `StickState` reset to `RACKED`.

Font note: the button label avoids å/ä/ö ("Ny runda" instead of
"Återställ") on purpose. The starter template's hotlinked DM Sans
`.ttf` doesn't render those glyphs (troika-three-text logs "Missing
glyph info") — confirmed live via `browser_screenshot`, not just the
(separately broken, see below) isolated preview. Tried self-hosting a
Google-subset font built from a `text=` request that should have
included exactly those glyphs; still missing, and "Meny" (all-ASCII)
rendered in what looked like a generic fallback rather than DM Sans —
so the custom `@font-face` may not even be taking effect at all, not a
glyph-coverage problem. Not chased further: docs/PLAN.md already scopes
"åäö verified in font atlas" to M4, and this is now a concrete,
investigated data point for that milestone rather than a guess.

**4. Ground feels hard, not grass — should have a little bounce, then
settle.** Root cause found by reading the code, not by guessing: the
scene JSON already baked a reasonable per-stick `angularDamping: 0.05`,
but `TuningLabSystem.applyTuningToPhysics()` unconditionally overwrites
`PhysicsBody.angularDamping` from the `angularDampingInFlight` tuning
param every frame — and that param's default was 0%, silently zeroing
the baked value on load. A cylinder with ~zero angular damping just
keeps rolling on any friction surface (Coulomb friction opposes
sliding, not rolling) — reads exactly like "hard floor that never
settles." Fixed the actual default: `angularDampingInFlight` 0%→25%
(real ≈0.125, comfortably above the old baked 0.05). Also bumped ground
`restitution` 0.05→0.1 for a touch more "little bounce" on first
impact, per Erik's literal ask.

**5. Grab-range highlight.** New `GrabHighlightSystem`. Uses the
documented pattern verbatim (`@iwsdk/core`'s `state-tags.d.ts` ships a
"Highlight on hover" example using `RayInteractable` + `Hovered`) rather
than inventing custom proximity detection — sticks already carry
`RayInteractable` for `DistanceGrabbable`. Swaps `.material` to a
cloned-and-tinted `woodMaterial` on hover, never mutates the shared
instance in place (would tint every stick/kubb/stake at once — see
`.claude/rules/assets-and-manifest.md`).

**Critical regression found while verifying #1: static ground tunneling.**
The first near-baseline setback (0.3 m) placed the new kubbs inside the
stick-scatter zone. With the fixed seed, at least one scattered stick
spawned overlapping a kubb; Havok's overlap-resolution impulse launched
it clean through the ground (observed at y ≈ -550 to -11,400 depending
on the run) _before I'd touched anything by hand_ — reproduced on a
fully clean `dev down`/`dev up` cycle, so not an artifact of manual MCP
testing. The ground's `PhysicsShape` was only 0.02 m thick (a thin
plate), trivial to tunnel through in one frame given enough corrective
velocity. Fixed both causes: moved the near kubb row out of the scatter
zone (see #1), and — as a general defense against this whole bug class,
not just this one trigger — thickened the ground collider to 1 m
(`dimensions: [30, 1, 30]`, position adjusted to keep the same top
surface at y=0.01 so nothing visibly moved). Verified stable across
five clean reloads (including one held for 15s of settling) with all
10 kubbs, the king, and all 6 sticks landing at consistent resting
heights every time.

**Investigated, not reproduced: left-hand grab.** Erik reported only
the right hand can pick up sticks. Emulator test (move `controller-left`
onto a stick, squeeze button index 1) grabbed it exactly like the right
hand — `Grabbed` added, `StickState` → `HELD`. No hand-specific code
path exists anywhere in the grab/throw pipeline. Logged in
docs/QUESTIONS.md rather than guess-fixed; likely a real-headset-only
cause (input mapping, hand-tracking mode, hardware) the emulator can't
surface.

**Deferred, filed as issues rather than built now:**
[gh#4](https://github.com/Steken3344/kubborama/issues/4) — a "klonk"
sound when two held sticks strike each other. No audio system exists
yet (M5 scope per docs/MILESTONES.md); the impact detector already
fires the event M5's audio adapter will need, so nothing to build now.
[gh#3](https://github.com/Steken3344/kubborama/issues/3) — noticed
while adding rocks (below): several autumn-tinted Kenney trees render
their foliage as flat cyan/teal in both the static scene-composer
render and the live runtime. Pre-existing since M1, unrelated to this
session's changes (the newly-added rocks, from the same Kenney pack,
render correctly).

**Environment felt bare — added rocks.** Erik asked for hills/rocks
around the court. `metavr` doesn't run on Linux (platform binary
unsupported, consistent with the M0 note); the Kenney Nature Kit
archive was already present in `assets/raw/models/` from M1's original
manual download, so five rock variants were copied straight into
`public/gltf/` (no re-compression needed — Kenney's low-poly rocks are
already 3-9 KB, smaller than the committed tree GLBs) and scattered
around the garden perimeter alongside the existing trees. "Hills"
specifically skipped — real terrain modeling is a bigger job than this
feedback pass warranted; the larger rock variants (`rock_large_b/d`)
stand in for now.

## 2026-08-27 — M3: toppling, rounds & stats

Built per docs/sessions/M3.md, continuing straight from M2 per Erik's
explicit instruction to keep going through milestones without waiting
for a check-in (he went to bed mid-session).

**Core (TDD, all pure — zero three.js/IWSDK/Havok imports):**
`core/topple.ts` derives tilt angle from a quaternion via the standard
"rotate local up by q, take the Y component" identity, simplified to
`1 - 2*(x² + z²)` for a unit quaternion — yaw-independent by
construction, which is exactly the "how far off vertical" measure a
topple check needs (no need for a generic vector-rotate helper).
`core/restState.ts` extracts the rest-detection predicate that was
inline in `ThrowingSystem.checkForSettling` — needed a second time for
kubb/king toppling's "at rest, not just wobbling" requirement, so per
CLAUDE.md's DRY rule it became a shared function instead of a second
copy; `ThrowingSystem` was refactored to use it too. `core/scoring.ts`
is a `(state, event) -> state` round reducer: `StickThrown` and
`StickSettled` are tracked _separately_ — round completion
(`isRoundComplete`) waits for the last stick to **settle** (so the
auto-reset never fires mid-flight), while the king-felling stat wants
how many sticks had been **thrown** at that moment (the felling stick
itself may still be in flight when the king goes down). `core/stats.ts`
follows M2's telemetry/tuning-preset pattern exactly: versioned zod
schema, `encode/decode` that never throws on corrupt data, personal
bests that only ever improve (`Math.max`/a null-aware `Math.min`
helper, never blind overwrite).

**Adapters:** `ToppleSystem` queries `Resettable` minus `StickState`
(kubbs + king, never sticks — they're projectiles, not targets) and
branches on a new `KingPiece` tag component to emit `KingFelled` vs
`KubbFelled` separately, per docs/PLAN.md's "king separate event" line.
Felled-tracking clears on the `Reset` event (the same one the menu's
button and the round auto-reset both already fire), so a piece that's
reset back upright can be re-detected next round. `RoundSystem` drives
the reducer from events the throw pipeline already emits — no new
detection logic — and attributes "longest felling throw" via a
heuristic: whichever stick(s) are `Flying` when a felling event fires
get credited once they settle. In this game's actual flow (one stick
at a time) that's almost always the stick that hit the piece; documented
as an approximation, not asserted as exact. `StatsSystem` records
`RoundEnded` into localStorage. `HudSystem` repaints an always-visible
scoreboard purely on `RoundEnded` (no per-frame polling) — reads
`StatsSystem.stats` directly, which is why `src/index.ts` registers
`StatsSystem` before `HudSystem` (commented in place; same-tick
ordering, not a race, but worth flagging for anyone reordering those
lines later). `MenuSystem`'s manual reset button and the round-end
auto-reset now share one implementation, triggered two ways.

No "result screen" was built as a separate blocking UI — the
always-visible HUD updating immediately after each round serves that
role, and a modal would fight with the immediate auto-reset design.

**Verified live in the emulator**, not just unit-tested: a single
real grabbed-stick swing (chained `xr_animate_to` segments building up
real velocity, not a "release" throw) knocked over 3 near-baseline
kubbs on the first attempt (`ToppleSystem` logged `kubb felled` for
each, correctly, with zero false positives on the untouched kubbs).
Finishing that round (throwing the remaining 5 sticks) produced
`round ended {roundNumber: 1, kubbsFelled: 3, kingFelled: false,
sticksThrownWhenKingFelled: null}`, followed by `stats recorded` and
`reset` in the same tick, and the HUD updated to show the new state.
A second, more aggressive swing reached across the full court and
felled **all 10 kubbs and the king in one motion** — a good stress
test of the maximum case (11/11), which the reducer and HUD both
handled correctly (`Rekord: 11/11` rendered live). King-felling was
deliberately tested separately, not just inferred from the shared code
path, since docs/MILESTONES.md calls it out as a distinct event.

**Interesting, honest edge case found via that same stress test:**
`sticksThrownWhenKingFelled` came back `0` for the round that felled
everything. Not a bug — the king and every kubb were physically struck
while the stick was still **held and being swung**, before its
`Thrown` event fired on release. The game's physics doesn't
distinguish "hit while held" from "hit after being thrown" (nothing in
docs/PLAN.md's design says it should — rule enforcement is explicitly
out of scope for the POC, same reasoning as the underhand classifier
being informational-only). Worth knowing about if a future milestone
adds stricter rules: right now a wild swing can bonk pieces over
without ever releasing the stick, and the scoring reducer faithfully
records that as "felled the king in zero thrown sticks."

Mechanical pass: `tsc`/`eslint`/`prettier`/`vitest` (109 tests, up
from 77)/`build`/`smoke` all green. Fresh-eyes review dispatched before
tagging `v0.4-m3` — M3 carries no headset gate (only M0/M2/M5 do), so
it tags as soon as that review clears, unlike M2.

**Fresh-eyes review — one blocker, fixed and re-verified live; two
worth-fixing items fixed alongside it.**

**Blocker (fixed now, per CLAUDE.md's "foundation-breaking findings
are fixed NOW, never filed"):** `RoundSystem` never subscribed to
`Reset`. `ToppleSystem` does (clears its felled-piece tracking so a
manually-reset kubb can topple again), but `RoundSystem`'s own
round-scoped state — `kubbsFelledThisRound`, `sticksThrownThisRound`,
etc. — didn't, so a manual reset mid-round (the pre-existing "Ny
runda" menu button, not a new path) left stale felled-kubb IDs
sitting in the reducer state. Re-felling the _same_ kubb after that
reset would then be silently swallowed by `scoringReducer`'s own
dedup guard (`kubbsFelledThisRound.includes(entityId)` — the exact
guard that's supposed to prevent double-counting, misfiring here
because the state it was protecting was stale, not current), and
`RoundEnded`/lifetime stats could pick up a mix of pre- and
post-reset data.

**Design decision (autonomous — reversible, not a human gate — logged
here rather than paged to Erik who was asleep):** a manual reset
_abandons_ the in-progress round and restarts at the _same_ round
number, rather than banking partial progress or advancing the
counter. The button's own label is literally "Ny runda" (new round),
and abandon-not-bank avoids a way to farm partial credit by resetting
repeatedly. Implemented as `RoundSystem.abandonRound()`, subscribed to
`Reset` alongside the existing gameplay-event subscriptions.

One subtlety the fix had to account for: `RoundSystem`'s own
round-completion path (`maybeEndRound`) emits `RoundEnded`, which
`MenuSystem` handles by auto-resetting — which emits `Reset` —
which now _also_ re-enters `RoundSystem`'s new handler, synchronously,
nested inside the original `emit('RoundEnded')` call. `maybeEndRound`
now advances `roundState` to the next round _before_ emitting
`RoundEnded` (previously: after), so that nested re-entrant call
re-derives from the already-advanced round number — a harmless
no-op — instead of abandoning the round that just legitimately
completed. Verified live: felled 9 kubbs with one swing, manually
reset mid-round via the menu button, confirmed kubbs stood back up
_and_ the reducer's tracking was truly cleared (the same kubb IDs
fired `KubbFelled` again on a second attempt, not silently dropped),
then completed that round for real — `RoundEnded` correctly reported
`roundNumber: 1` (never advanced by the abandoned attempt) and
`kubbsFelled: 3` (only the post-reset attempt's count, no leakage from
the wiped 9), and `stats recorded {roundsPlayed: 1, ...}` confirms the
abandoned attempt was never counted as a played round.

**Worth-fixing, done:** `ToppleSystem.checkOne` built a fresh 4-element
array literal every frame per toppleable entity to adapt `Transform`'s
vector-view read into `core/topple.ts`'s plain-array `Quat` type —
exactly the per-frame-allocation class CLAUDE.md flags, and the same
class M2's fresh-eyes review already caught once in `ImpactSystem`.
Fixed with a persisted `tmpQuat` mutated in place, same pattern as
`ImpactSystem.tmpCurr`. Also extracted `src/systems/bodySpeed.ts`
(`readBodySpeed`, an out-parameter style — fills a persisted
`[number, number]` tuple, allocates nothing) since the exact same
"read `_linearVelocity`/`_angularVelocity`, `Math.hypot` each"
four-line block was duplicated verbatim in both `ThrowingSystem` and
`ToppleSystem`; both now call the shared helper.

**Accepted as-is (not blockers):** the "longest felling throw"
attribution heuristic's documented failure direction (over- vs.
under-crediting) wasn't independently re-verified against real
settle-timing — flagged as worth double-checking empirically, not
worth blocking on for a personal-best stat that degrades gracefully
either way. `HudSystem`'s dependency on `StatsSystem` being registered
first in `src/index.ts` is real, commented, but unenforced by code —
acceptable for now, a candidate for a `StatsUpdated` event later if it
ever bites someone.

## 2026-08-27 — M4: wind, i18n/settings core, and the definitive åäö root cause

Continued straight into M4 after tagging `v0.4-m3`, per Erik's
"keep going" instruction. Scoped down deliberately partway through —
see the cut at the end of this entry.

**core/wind.ts + WindSystem**, TDD: `F = windVector × dragFactor`
(docs/PLAN.md §1), re-added every tick to Flying sticks only —
`PhysicsManipulation` is one-shot, confirmed via the official Buoyancy
example in `.claude/skills/iwsdk-physics/references/workflows.md`
(`entity.addComponent(PhysicsManipulation, { force })` with
**only** `force` set, never touching `linearVelocity`/
`angularVelocity` — passing those would override the stick's real
flight velocity to whatever was passed, which very nearly ended up in
this code before double-checking against that reference). Verified
live in Advanced mode (wind on) through a full grab→swing→release→
settle cycle with zero console errors.

**core/i18n.ts + core/settings.ts**, TDD: a typed `t(key)` translator
over sv/en dictionaries (never throws on a missing key — falls back to
the key itself), and a versioned zod-schema settings store persisted
to localStorage, same never-throws-on-corrupt-data pattern as M2/M3's
telemetry/stats. `SettingsSystem` owns loading/persisting into a
shared `settingsState` singleton (mirrors `tuningState.ts`'s
`presetBank`) and an `i18nState` singleton holding the live translator,
rebuilt on language change. `ToppleSystem`'s topple angle and
`WindSystem`'s wind vector both now read the active game mode
(`src/data/game-modes.json`: Simple = backyard/wind 0/topple 50°,
Advanced = tournament/wind 1.5 m/s lateral/topple 60°) instead of a
fixed config value — the same live-tunable pattern M2's tuning lab
already established for gravity etc.

Extended the existing "Ny runda" menu with language and game-mode
toggle buttons (both call `SettingsSystem` directly — a UI action
dispatch, not the scoring/stats/haptics traffic the "one event bus"
rule is about) and retrofitted every existing UIKitML string (that
menu, the HUD) through the new translator. A `LanguageChanged` event
lets both panels refresh their own labels when the language changes.
Verified live end-to-end: toggling language flips every label on both
panels correctly (screenshots); toggling game mode flips "Enkelt"/
"Avancerat" correctly (took several attempts to physically aim the
emulated ray at the right button — the panel's layout shifted once a
third button was added, and earlier-tested y-coordinates from M2/M3
no longer landed on the buttons they used to; not a code issue, just
CLI aiming against a taller panel).

**The åäö root cause, found for real this time** (docs/DECISIONS.md
already logged two earlier attempts and a workaround, in the M2 and M3
entries above — this closes it out with an actual mechanism, filed as
[gh#5](https://github.com/Steken3344/kubborama/issues/5)):
`@pmndrs/uikit`'s `TTFLoader._generate()`
(`node_modules/@pmndrs/uikit/dist/loaders/ttf.js`) hardcodes the MSDF
atlas-baking charset to plain ASCII:

```js
charset: ' \tABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!?.,;:\'"()-[]{}@#$%&*+=/\\<>',
```

`TTFLoader.loadAsync()` _does_ accept a per-font `charset` override,
but `@drawcall/uikitml`'s `loadTTF()` always calls it with a bare URL
string, never an options object — so a UIKitML `@font-face` has
**no way** to widen the charset, regardless of what glyphs the actual
source `.ttf` contains. This is why the self-hosted Google-subset font
from the M2 entry still failed: the truncation happens in the bake
step, after the font loads, not because of anything about the font
file itself. Confirmed by reading the actual library source
end-to-end (`@iwsdk/core`'s `uikitml.js` → `@drawcall/uikitml`'s
`instantiate.js`/`fonts.js` → `@pmndrs/uikit`'s `ttf.js`), not
guessed. Real fix options (upstream PR, or pre-baking a custom atlas
with `@zappar/msdf-generator` directly and registering it as a
bundled-style font family) are written up in gh#5 for whoever picks
this up — out of scope to build now. The working convention going
forward: sv/en dictionary values never contain å/ä/ö/Å/Ä/Ö, enforced
by a regex test in `src/i18nState.test.ts` so a future dictionary edit
can't silently reintroduce the bug.

**Deliberately cut, not built this session:** the player-facing
settings panel UI (music/SFX volume sliders, haptics toggle control,
non-blocking first-run profile-name prompt, stats tab, court-lines
toggle+rendering) and the dev debug panel's wind knobs. The
_model_/persistence layer for every one of these already exists in
`core/settings.ts` — only the UI controls are missing. This is a
genuine scope cut, not an oversight: after two full milestones
in one session (M2's feedback pass + regression fix, M3's full build),
a player-facing settings panel is exactly the kind of design-facing
work that benefits from Erik's review rather than being pushed through
solo at 1am. Also still open: game-mode switching doesn't yet
re-lay-out the court to the new preset's actual dimensions (topple
angle and wind change immediately; kubb/king/stake positions don't) —
noted in docs/MILESTONES.md as a known gap, not silently shipped as if
it worked.

**Fresh-eyes review of this slice: no blockers.** Confirmed independently
(not just trusted from the session's own notes): `WindSystem` only
ever passes `{ force }` to `PhysicsManipulation`, never touching
`linearVelocity`/`angularVelocity` (the catastrophic mistake that
would have zeroed every flying stick's real velocity every frame);
`SettingsSystem`'s registration-first ordering genuinely guarantees
`settingsState`/`i18nState` are populated before any other system's
`init()` reads them (elics runs `init()` synchronously per
`registerSystem()` call, verified in `node_modules/elics`, not
assumed); no system caches a stale `i18nState.t` reference across a
language change. Two worth-fixing items, both fixed immediately:
`WindSystem.update()` recomputed the wind force from scratch every
frame regardless of whether it had changed (a real per-frame
allocation — the same rule class M2 and M3's reviews already flagged
elsewhere), now cached and only recomputed when the game mode
actually changes; `config.ts`'s new `windVectorForMode`/`getGameMode`
getters had no direct test coverage unlike every sibling getter in
that file, now added. A third, nitpick-level item (the i18n
diacritic-guard regex only matched precomposed NFC characters, not a
decomposed NFD å) was also fixed — cheap, and it's a regression guard,
so a gap in the guard itself seemed worth closing.

**A second, independent `/code-review` pass (Erik's own, run the
morning after) found the WindSystem fix above was itself still
imperfect** — cache-on-change still allocates on the (rare) frame
where the mode actually changes, contradicting the fix's own "never
allocate in update()" claim; the manual cache (instance fields +
per-frame inequality check) was more machinery than the problem
needed; and it introduced an asymmetry with `ToppleSystem`'s plain,
uncached `getGameMode(...).toppleAngleDeg` lookup with no comment
explaining why one path needed caching and the other didn't. All
correct findings, no correctness bug. Fixed properly this time:
`WindSystem` precomputes **both** modes' forces once
(`FORCE_BY_MODE`, a `Record<GameModeName, Vec3>` built from
`Object.keys(gameModes)` so it doesn't hardcode "simple"/"advanced"
and stays correct if a mode is ever added) and just indexes into it
in `update()` — genuinely zero allocation ever, no cache-invalidation
logic to get out of sync, and now exactly as simple a lookup as
`ToppleSystem`'s. The review also independently verified (by reading
`node_modules/elics/lib/types.js`/`component.js`) that reusing the
same `Vec3` array across every entity and frame is safe: elics copies
Vec3 field values into per-entity storage on `addComponent`, it never
holds the reference — so a single shared, never-mutated array is the
correct shape here, not a shortcut. Re-verified live: zero console
errors through a full grab→swing→release→settle cycle in Advanced
mode with the new lookup active.

## 2026-08-28 — M4: settings panel closes out (haptics, volume, profile

name, stats tab, court lines)

Erik approved the full scope in one batch (`AskUserQuestion`, three
answers): build every item deferred from the previous entry (haptics
on/off + intensity, stats tab, profile name, music/SFX volume,
court-lines toggle+rendering), as a third tab in the existing B-menu
panel (his explicit preference over a separate panel), plus move both
`hud-panel` and `reset-menu-panel` further from the player (his own
words: the menu and the scoreboard sit "väldigt nära" — move them a
bit further away). Then: "nu drar jag till jobbet men kör på så långt
du kan" — explicit permission to keep building solo past that point.

**Built:** `reset-menu.uikitml` rewritten to three tabs (Meny /
Alternativ / Statistik), each a plain `div` shown/hidden the same way
the whole panel already was (`display:none` toggle) — there is no
native UIKitML tab component. Every new control is a Button that
shows its current value and advances/toggles on click, continuing the
convention from the M2/M3 menu buttons rather than reaching for the
Horizon kit's native `Toggle`/`Slider`/`Input` — their UIKitML-level
change-event wiring was never confirmed working from application
code, and gambling on it wasn't worth repeating the M4 font rabbit
hole. Court lines are a new `CourtLine` tag component on 4 thin
`BoxGeometry` scene nodes (materialized in
`court-line-{long,short}.scene-asset.ts`), toggled by a new
`CourtLinesSystem` that mirrors `WindSystem`/`ToppleSystem`'s
"read `settingsState` once per frame, act only on change" shape — no
new `PhysicsBody`, purely visual. `hud-panel` moved
`(1,1.5,-1)→(1.4,1.6,-1.4)` at `scale:1.3`; `reset-menu-panel` moved
`(0,1.4,-0.6)→(0,1.4,-1.1)` at `scale:1.15` (rotation unchanged in
both — scaling a position that already points roughly at the player
preserves the yaw). `StatsSystem` had to move earlier in
`index.ts`'s registration order, ahead of `MenuSystem`, since the new
Statistik tab reads `StatsSystem.stats` synchronously from
`MenuSystem.init()`'s wiring (elics runs `init()` synchronously per
`registerSystem()` call, same fact the M4-core entry already
leaned on for `SettingsSystem`).

**Live-verification methodology, and its real limit.** Clicking a
specific row in the emulator needs a ray target in world space, and
guessing one from panel layout math repeatedly failed. What worked:
set the controller's position identical to the headset's, then use
headset screenshots to find the look-at target that visually centers
a given row — since a camera and a same-position controller ray are
geometrically identical for the same target, that target is also the
correct controller aim. This verified, live, both directions of:
tab switching (Meny↔Alternativ), Haptik on/off, Musik/Ljud/Styrka
cycling, and profile-name cycling. It never reliably landed on the
"Planlinjer" or "Statistik" buttons specifically — both sit at the
edges of the panel (first row, and the rightmost of three tabs) where
small aiming errors miss the panel or its bezel entirely. Their
underlying logic was verified a different way instead: court-lines'
full chain (settings write → `CourtLinesSystem` → `Visibility`) was
proven correct by writing `Visibility.isVisible=true` directly via
`ecs_set_component` on all 4 line entities and confirming a correctly
aligned court boundary renders; the Statistik tab's `setActiveTab`
call is textually identical to the already-proven Alternativ tab's,
just a different id and target. This is a documented, accepted gap —
the click _handlers_ for these two controls were never exercised
end-to-end through a real ray, only proven-by-construction and by
identical-pattern analogy to sibling controls that were exercised.
Also worth recording as a lesson, not a bug: earlier in this session,
"Planlinjer" appeared to be silently missing from the rendered panel
entirely (visible up through "Namn" and no further); reordering it to
the first settings-tab row (still its current position — cosmetic,
Erik expressed no ordering preference) revealed it was rendering
correctly all along and the screenshot just wasn't framed far enough
down the panel to show the true last row. No code was at fault.

**Fresh-eyes review found one real, confirmed bug, fixed before
tagging.** `nextVolumeStep(current) = (current + 25) % 125` silently
assumed the current value already sat on the 0/25/50/75/100 grid —
but `defaultSettings()` starts `musicVolumePercent`/
`sfxVolumePercent`/`hapticsIntensityPercent` at **70**, off that grid.
From 70 the sequence went 70→95→**120**→20→45→70…, and 120 is outside
the field's `z.number().min(0).max(100)` schema. Two compounding
failures from that one out-of-range write: `scaleHapticPulse()` would
have fed WebXR's `hapticActuator.pulse(intensity, …)` an intensity
above the spec-required `[0,1]` range; and because `decodeSettings()`
runs the _whole_ settings object through `safeParse` and falls back to
`defaultSettings()` on any failure, a single out-of-grid volume value
would have silently reset language, game mode, haptics-enabled,
profile name, and court-lines-visible together on the next load — not
just the one field. Root cause was the modulo arithmetic's implicit
assumption; fixed by replacing it with "find the smallest grid step
strictly greater than the current value" (`VOLUME_STEPS = [0, 25, 50,
75, 100]`, a linear scan), which is correct for _any_ starting value,
not just grid-aligned ones, and provably terminates in range with no
cache/invalidation logic. Re-verified live in the emulator through a
full cycle on the real default: 70→75→100→0. Two smaller suggestions
from the same review were also folded in: `statsMostFelled`'s "/11"
was a duplicated literal for kubb-count math that already lives in
`court-layout.ts` (now `KUBB_COUNT` is exported and the i18n string
takes a second `{total}` param instead of hardcoding it); and
`MenuSystem`'s two `gameEvents.on(...)` unsubscribes moved from a
hand-rolled `destroy()` override into `this.cleanupFuncs` (the
project's standard teardown convention, which this file predated).

M4 is now feature-complete per Erik's approved scope. No headset gate
for this milestone (only M0/M2/M5 have one) — tagged `v0.5-m4` once
this entry lands.

## 2026-08-28 — M5 slice 1: audio, plus a real pre-existing topple bug found and fixed

Continued autonomously per Erik's "kör vidare så långt du kan". Built
the M5 "Audio" section of docs/PLAN.md: impact/felled sound, ambience,
music, UI clicks, and closed a real gap from M3/M4 — three
`HapticSequence`s (`kubbFelled`, `kingFelled`, `roundCleared`) were
defined in `core/haptics.ts` back then but nothing ever fired them.

**Asset sourcing — real constraints, worked around.** PLAN.md named
Kenney Impact Sounds and Pixabay Music. Kenney's own `fetch-assets.sh`
comment already flagged its download links as "hashed/interactive" —
still true, but the hash is embedded in the page's own "Continue
without donating" link and stable enough to script: fetched the exact
URL via `WebFetch`, verified it with a plain `curl -I` before trusting
it (200, correct content-type), and it worked for both Impact Sounds
and UI Audio. Pixabay Music was a harder wall: `curl` gets a Cloudflare
bot-challenge 403, and `WebFetch` on the track page couldn't surface a
download URL either (it's behind client-side JS, not in the served
HTML) — chrome-devtools MCP couldn't help either, no Chrome binary
installed in this environment. Substituted OpenGameArt.org for both
ambience and music (each individually CC0-verified on its own asset
page, not just the collection page it was found through): "Forest
Ambience" by Rick Hoppmann (TinyWorlds) for the garden loop, "Gone
Fishin'" by You're Perfect Studio (banjo/bluegrass — reads as
backyard-cozy) for music. Both shipped as mp3 originally;
`ffmpeg-static` installed as a one-off scratch npm package (not a
project dependency) converted them to ogg. Full sourcing detail,
including the exact commit-worthy fetch URLs, in ASSETS.md.

**IWSDK's AudioSource has no pitch/playbackRate field** — checked by
reading `@iwsdk/core/dist/audio/audio.js`'s component schema end to
end, not guessed. PLAN.md's "pitch-randomize ±10%" therefore isn't
achievable through this API surface at all; anti-repetition comes
entirely from picking between 3 pre-recorded variants per category
(`core/audio.ts`'s `pickVariantIndex`, seeded per-system so it's
reproducible, not `Math.random()`). Also verified (reading
`AudioUtils.createOneShot`'s implementation and `AudioSystem`'s
positional-audio handling): a one-shot's entity has no `Object3D`, and
positional audio needs a `PositionalAudio` anchored in the scene
graph — passing `position` through `createOneShot` is a no-op in the
installed version. Every SFX in this build is non-positional; a real
in-scene position for impact sounds is a real gap, not attempted this
pass.

**Impact-sound classification is honest about what the physics layer
can and can't tell it.** The per-tick `Impact` event (M2's |Δv|
heuristic) fires per BODY, never per PAIR — there is still no way to
know a stick hit a kubb specifically vs. the ground vs. another stick
(same root cause as the M2 "no collision-event API" finding). Rather
than fake pairwise knowledge, `ImpactSystem` classifies by the
impacting entity's own type (king / stick / kubb) and, for sticks
specifically, by force magnitude via a new `stickImpactTier` (soft /
light / medium — a gentle grass settle is a low-Δv impact, a solid hit
is high-Δv): `impactSoft_medium` / `impactWood_light` /
`impactWood_medium` respectively. `KubbFelled`/`KingFelled` (the
tilt-based topple events, not the per-tick heuristic) get their own
fixed-volume sounds instead, since those events carry no force data at
all to scale from.

**Fresh-eyes-worthy self-review while wiring `MenuSystem`'s UI-click
feedback**: rather than adding a sound+haptic call to all 12 button
handlers individually, extracted a `wireButton(id, handler)` helper
that adds the (also previously-dormant) `uiTick` haptic and a click
sound once, in one place — 12 near-identical call sites is well past
DRY's "second occurrence" bar. Fires on the right hand only; a UIKitML
click event carries no hand/pointer info to pick the real hand, and
B-button-opens-the-menu is already a right-hand convention in this
project, so this is a reasonable, documented simplification rather
than a bug.

**A real, pre-existing bug found by accident: every fresh load could
silently "fell" the king and all 10 kubbs before the player could
possibly interact.** Building `SfxSystem` meant, for the first time,
actually reading console logs closely on a hard page reload (rather
than reusing an already-advanced dev session, which is how M3/M4's own
testing happened) — and `[state] king felled` / `[state] kubb felled`
×10 showed up within a few seconds of boot, every so often, with zero
player input. Confirmed this wasn't cosmetic: `RoundSystem`'s
`KingFelled`/`KubbFelled` handlers update `roundState` unconditionally
(scoring only actually finalizes on the next `Settled` stick event via
`maybeEndRound`), so this corruption sits silently until the player's
very first real throw — which would then instantly "win" round 1 with
wrong stats (a fewest-throws-to-fell-king personal best of effectively
zero, permanently). This is exactly the class of finding CLAUDE.md
calls foundation-breaking — fixed now, not filed.

Root-caused as far as it was practical to without deeper Havok
instrumentation, via direct ECS manipulation and `ecs_pause`/`ecs_step`
frame-stepping in the emulator:

- `ToppleSystem`'s rest-duration check compared `timeS` against a
  first-seen timestamp (`timeS - restStartS >= restDurationS`) — a
  single frame with an abnormally large `delta` (confirmed: THREE.Clock
  is unclamped, so an asset-loading stall hands the next `update()`
  call one big real-world delta) can satisfy that comparison in one
  step even though nothing was ever continuously true. Fixed by
  switching to `accumulateHeldDuration` (`core/restState.ts`, new,
  TDD'd): duration is now the SUM of each frame's delta, each
  individually capped at 0.1s, so no single frame's contribution can
  ever be large enough to fake sustained rest on its own. Verified via
  `ecs_pause` + `ecs_step` with a controlled 0.016s delta: forcing a
  kubb's orientation to 90° via `ecs_set_component` correctly fires
  `KubbFelled` after exactly the expected number of steps, confirming
  the accumulator itself is correct.
- That alone did not fully eliminate the bug in live testing (6/6 clean
  reloads at first, then a 7th run still false-positived) — meaning the
  underlying condition can genuinely read true for several CONSECUTIVE
  real frames during Havok's WASM warm-up, not just one glitchy sample.
  `ImpactSystem`'s single-frame impact-reaction (no duration check at
  all) showed the same class of false positive independently
  (`entityIndex: 36`, a stick, `deltaVMps: 4.08` at boot). Rather than
  keep chasing Havok's internal warm-up behavior — a real rabbit hole,
  and this project doesn't own that code — added a shared
  `createStartupGate` (`core/startupGrace.ts`, new, TDD'd):
  `pieces.throw.startupGraceS` (4s) since the first `update()` call,
  before which neither system reacts to anything. Completely safe
  from a gameplay perspective (donning a headset and reaching for a
  stick takes longer than 4s regardless), and directly prevents the
  observed failure mode regardless of its exact root cause. Re-verified
  live: 6 consecutive clean reloads with the grace window in place;
  genuine topple detection (via the same `ecs_pause`/`ecs_step` method)
  still fires correctly once the grace window has passed.
- Accepted residual uncertainty, stated plainly: the delta-accumulator
  fix is unconditionally correct engineering regardless of root cause
  (it also protects against a mid-game hitch, not just startup) and is
  kept; the startup-grace fix is a pragmatic mitigation for an
  incompletely-diagnosed Havok/WASM warm-up window, not a fully
  root-caused fix — if a false felled/impact event is ever seen more
  than `startupGraceS` into a real session, that would mean this
  theory was incomplete and needs revisiting.

**Process note, unrelated to the bug above but caught while chasing
it**: the managed dev-server's scene editor silently re-serializes and
re-saves `public/scenes/main.iwsdk.scene.json` (key-sorted, multi-line
arrays — a different formatter than this file's normal hand-edited
style) just from having the scene open/interacted-with during a
session, with no actual content change. Caught twice this session via
`git diff --stat` showing a ~1600-line diff with zero semantic change;
reverted both times with `git checkout --`. Worth an explicit
`git diff` gut-check on this specific file before staging anything,
same spirit as the secret-hygiene review-before-push habit.

Mechanical pass green throughout (tsc/eslint/prettier/vitest — 148
tests, up from 140 mid-M4 — /build/smoke).

## 2026-08-28 — Fresh-eyes review fixes, then Erik's second feedback round

**Review gate on the M5 audio slice**: fresh-eyes found one real,
confirmed config bug before it shipped. `stickImpactTier`'s `soft`
band (`normalizedForce < 0.25`) was mathematically unreachable:
`normalizedForce` is `deltaVMps / impactMaxForceForFullHapticMps`
(`/10`), and `detectImpact` never even counts anything below
`impactThresholdMps` (`2.5`) as an impact at all — so the lowest
`normalizedForce` `playImpactSfx` could ever see was exactly `2.5/10 =
0.25`, equal to (never less than) the soft-tier ceiling. The pure
`stickImpactTier` function itself was correct and its unit test passed
— the bug was invisible at the unit level because the test exercised a
`t` value (0.24) production code can never actually produce. Fixed by
raising `audio.json`'s tier thresholds (0.25→0.45, 0.6→0.7) comfortably
above the real floor, added a `config.test.ts` regression guard
(`softMaxNormalized` must exceed
`impactThresholdMps/impactMaxForceForFullHapticMps`) so a future
retune of either JSON file can't silently reintroduce this, and added
code comments at both consumption sites. Two lower-severity notes from
the same review — ambience volume deliberately follows the SFX slider
(already PLAN.md's spec, just added a comment so it doesn't read as a
mistake) and `playHapticSequence`'s untracked `setTimeout`s (real but
minor — logged as accepted debt, not fixed) — addressed without code
restructuring.

**Erik's second feedback round, from his own testing (2026-08-28,
verbatim in docs/SESSION_LOG.md)**: a version indicator, cross-hand
stick handoff, sticks still rolling too far on grass, and the settings
panel feeling too large. All four addressed:

**Version display.** `vite.config.ts` now runs `git describe --tags
--always --dirty` at build time (falls back to `"dev"` if git isn't
available, e.g. a source tarball) and injects it as `__APP_VERSION__`
via Vite's `define`. Shown as a small, muted line at the bottom of the
settings tab (`versionLabel` i18n key, wired through
`MenuSystem.refreshLabels()` — the same proven pattern as every other
label). This reads far better than `package.json`'s rarely-bumped
`"0.1.0"` — it directly names the milestone tag Erik is testing
(`v0.5-m4-dirty` right now, `v0.6-m5` once M5 tags), with commit count
and hash once work has moved past a tag.

**Cross-hand handoff — implemented, but honestly short of "seamless".**
`OneHandGrabbable`'s pointer capture (`@pmndrs/handle`, `multitouch:
false`) rejects a second hand's squeeze outright while the first still
holds the object — verified in source
(`store.js`'s `capturePointer` returns `false` without even queuing
the second pointer). New `HandoffSystem` (`src/systems/handoff.ts`):
when the free hand's squeeze goes down within 15cm of a stick the
other hand is holding, force-releases the holder
(`GrabSystem.forceRelease`). Live-tested in the emulator via
`ecs_set_component`-driven gamepad state and confirmed BOTH the
correctness of the release AND a real limitation: physical-squeeze
grab capture is wired outside the ECS update loop entirely (not a
per-frame poll GrabSystem does in `update()` — that method only
forwards hand-pinch-as-squeeze when `useHandPinchForGrab` is on, which
this project doesn't use). This means the SAME squeeze press that
triggers the release can't also complete the new hand's grab — that
press's own capture attempt already ran and failed before
`HandoffSystem` ran, regardless of system priority (tried registering
at priority -4, before `GrabSystem`'s -3, on the theory that update-
order would matter — confirmed live it doesn't fix this, for the
reason above). The real, tested behavior is two presses: squeeze once
to make the holder let go, squeeze again to actually pick it up. Still
a genuine fix for Erik's literal complaint ("the other hand can't take
over AT ALL" is now false), just not a single fluid motion. A true
one-motion handoff would mean hooking `@pmndrs/handle`'s internal
`capture()` directly from application code — undocumented, version-
fragile, and not attempted this pass; noted as a known follow-up if
the two-press interaction doesn't feel acceptable to Erik.

**Stick rolling reduced, not eliminated — a tuning-value change,
verify by feel.** Traced the actual lever: `TuningLabSystem.
applyTuningToPhysics()` overwrites every stick's `PhysicsBody.
angularDamping` from the live `angularDampingInFlight` tuning
parameter every frame, for every stick regardless of phase (`Racked`/
`Held`/`Flying`/`Settled` — no phase filter in that query) — this
completely supersedes the scene JSON's baked-in `angularDamping: 0.05`
on every stick node, which is therefore dead weight already (not
touched, since editing it would have had zero effect). Since a stick
keeps `StickState.phase === Flying` for its entire post-landing roll
(`ThrowingSystem.checkForSettling` only flips it once linear AND
angular speed both drop under tight rest thresholds), the SAME single
damping value governs in-flight spin retention and how long it takes
to stop rolling once grounded — there's no existing phase-aware split
to change independently. Raised `tuning-params.json`'s
`angularDampingInFlight.defaultPercent` from 25 to 45 (real value
0.125→0.225 within the existing `[0, 0.5]` range) rather than adding
new phase-detection logic: damping compounds over time, and the
grounded-rolling window is longer than a typical short kubb throw's
flight time, so this should shorten rolling noticeably more than it
softens in-flight spin — but this is a felt-physics call I can't
verify without a real headset (exactly the class of judgment M2's
still-outstanding feel-calibration gate exists for). Worth flagging to
Erik explicitly: "Angular damping (flight)" is already a live 0-100
slider in the desktop tuning panel, so this exact value is also his to
nudge further by feel without waiting on a code change.

**Settings panel size**: `reset-menu-panel`'s scene-JSON `scale`
reduced `1.15 → 0.85` (position unchanged at `[0, 1.4, -1.1]`).
Verified visually: a standing-back emulator screenshot (headset at the
default resting pose, looking at the panel) now shows the whole panel
comfortably within frame with margin on both sides, versus needing a
tighter crop to fit it before.

Mechanical pass green throughout (tsc/eslint/prettier/vitest — 149
tests — /build/smoke). Also caught, again, the scene-editor
auto-resave quirk from the previous entry — this time the diff was
correctly just the one intentional `scale` line, confirmed via `git
diff` before treating it as clean.

## 2026-08-28 — Erik's own editor session, then a real headset feedback round

Erik used the managed scene editor himself for the first time this
session: repositioned the fence, HUD, and reset-menu panel, nudged the
sun, and added two rocks. Diffed his save against HEAD with `jq -S`
on both sides before trusting it (the raw diff is ~1600 lines of pure
reformatting noise every time the editor touches this file — see the
process note two entries up). Two real, clearly-accidental changes
surfaced this way and were reverted before push: the ground plane had
jumped up 0.49m (a hard floating-platform edge, and it buried every
kubb below the new surface — only `ground` and `kubb-0` had moved,
the other 9 kubbs hadn't, which is what made it obviously an isolated
drag rather than an intentional edit), and the sun's color/intensity
had reset to generic component defaults (flat grey, intensity 1) while
its position moved to real, non-round numbers — kept the position
(a real drag) and restored the tuned color/intensity (a component
default, not a plausible deliberate choice, especially not one that
would quietly undo M1's whole "garden feeling" pass).

**Then Erik tested the deployed build on his actual Quest 2** and sent
back the first real-headset feedback since M2's playtest. Five items:

**1) Throw feel regressed — "sluggish", was "nästan helt naturligt" in
M1/M2.** Traced to my own change two entries back: raising
`angularDampingInFlight` to 45% to fight ground-rolling also damps
in-flight spin, because that one value governs a stick's rotation for
its ENTIRE lifetime with no notion of "landed" vs "still flying" (see
that entry). Reverted the default back to 25% — restoring the feel
Erik confirmed was right — and rebuilt the ground-rolling fix as its
own thing instead: new `StickGroundDampingSystem` checks every Flying
stick's height and vertical speed each frame
(`pieces.throw.groundHeightM`/`groundVerticalSpeedMps`) and swaps in a
much higher `groundAngularDamping` (0.45) only once a stick reads as
landed-and-settling, leaving genuinely airborne sticks on the tuned
flight value. Verified the mechanism directly: forced a stick into
`Flying` phase at rest height via `ecs_set_component` and confirmed
`PhysicsBody.angularDamping` read back as 0.45 (not the flight
default) — the in-flight branch is plain `percentToReal` math already
exercised elsewhere, not independently re-verified live.

**2) Court lines: wants the center line too ("that's where the king
stands").** Added `court-line-center` (same `court-line-short` asset
as near/far, at z=-3) — the existing `CourtLinesSystem` already
queries by the `CourtLine` tag generically, so this needed zero code
changes, just the scene node. Verified visually (all 5 lines forced
visible via `ecs_set_component`, screenshot confirms correct
placement across the king's row).

**3) Trees and rocks have no collision — pieces roll straight through
them.** True: these were pure visual asset placements with no
`PhysicsBody`/`PhysicsShape` at all. Added a static collider to each
of the 5 trees (`Cylinder`, trunk-radius-ish, 0.4m tall — tall enough
for a rolling stick/kubb, not modeling full tree height) and 8 rocks
(`Box`, sized small/large/tall to roughly match each rock's name) —
13 individual additions, matching the same STATIC
`PhysicsBody`+`PhysicsShape` pattern the corner stakes already use
successfully in this scene. Approximate boxes/cylinders, not
mesh-accurate — reasonable for static garden dressing per the physics
skill's own guidance, and consistent with the "no per-mesh colliders
for decoration" performance posture. Not extended to the fence
(Erik's report named trees and rocks specifically; the fence is a
repeated pattern/prefab, a separate small task if he wants it too).

**4) The floating feeling ("man svävar") — a real, previously-hidden
geometry bug, root-caused and fixed properly this time.** Erik's own
diagnosis was exactly right and pointed straight at the bug: setting
the ground's Y to 0 "feels right" but topples every kubb at boot.
Root cause: `ground`'s VISUAL mesh is a zero-thickness `PlaneGeometry`
(`ground.scene-asset.ts`) — its surface renders exactly at the node's
`position.y`, no implicit offset. Its `PhysicsShape`, though, is a
`Box` of height 1, which every physics engine centers on the node
transform — so its top surface sits at `position.y + 0.5`, half a
metre above the visual surface. The M2 entry that set `position.y =
-0.49` explicitly optimized for the PHYSICS top landing near 0
("position adjusted to keep the same top surface at y=0.01") without
registering that the VISIBLE plane would then render 0.49m below
that — invisible in every screenshot and editor render this whole
project has taken, because a flat, texture-repeating plane doesn't
visually betray a vertical offset the way an embodied, stereoscopic
view immediately does. That's the floating sensation: the player's
feet (and every piece) rest on a physically-correct but 0.49m-too-low
INVISIBLE floor, while the grass you actually see is half a metre
under your feet. Raising `ground.position.y` to 0 fixes the visual at
the cost of moving the physics box's top to +0.5 — 0.49m above where
every piece is placed, hence Erik's reproducible toppling.

Fixed by decoupling the two: `ground` is now visual-only (no physics
components, `position.y = 0`, matching the plane's true surface), and
a new sibling node `ground-collider` (`content: {"type": "group"}` —
no visible surface, confirmed valid per the scene-format reference)
carries the SAME 1m-thick `PhysicsShape` at `position.y = -0.5`, so
its top lands at exactly y=0 too — both surfaces now agree, and the
tunneling-prevention thickness from the M2 fix is untouched. Verified
live: 6 total clean reloads post-fix (no false-felled events), the
king reads back at its designed resting height (`y=0.15`) after
settling, and a `scene_render_file` screenshot shows the ground/grass
boundary as a single continuous surface with no visible step (the
earlier, broken version had an obvious hard edge — see the screenshot
taken mid-investigation).

**5) "Ljudet är bra"** — no action, first positive confirmation on the
M5 audio slice.

Mechanical pass green throughout (tsc/eslint/prettier/vitest — 149
tests — /build/smoke). Live-verified: clean boot (6 reloads), the
grounded/flight damping branch, the center line's placement, and the
ground visual/physics alignment. Not independently live-verified:
the in-flight (non-grounded) damping branch specifically, and the new
tree/rock colliders under an actual thrown-object impact (both use
patterns already proven correct elsewhere in this same scene/session,
and time was prioritized toward the newly-discovered ground bug).

**Fresh-eyes review of this slice found one real bug before it
shipped**: `StickGroundDampingSystem`'s "grounded" check only looked
at height and VERTICAL velocity — a flat, fast throw crossing near
zero vertical velocity at the low point of its arc (release height
under `groundHeightM`, or just a shallow trajectory) would read
"grounded" and get the high damping slap on while still very much in
play, horizontally fast and spinning — reintroducing Erik's exact
"sluggish" complaint for that throw shape specifically instead of
fixing it universally. Root cause was also a DRY miss: the fix
hand-rolled a weaker heuristic instead of reusing
`core/restState.ts`'s existing `readBodySpeed`+full-3D-speed pattern,
already shared by `ThrowingSystem`/`ToppleSystem` for exactly this
"has this body actually stopped" question (with a comment there
explicitly warning that linear speed alone misses an in-place spin).
Fixed by switching to `readBodySpeed`'s combined linear + angular
magnitude, gated by new `groundLinearSpeedMps`/`groundAngularSpeedRadS`
thresholds looser than `isResting`'s (this needs to catch "landed but
still visibly rolling," not "already basically stopped," which
`isResting`'s tight thresholds would only satisfy right at the very
end of a natural stop anyway). Also switched the height read to
`getWorldPosition()` for consistency with every sibling read in
`ThrowingSystem`, per the same review. Two smaller review findings
addressed: a stale "four line nodes" comment in `courtLines.ts` (now
five with the center line); confirmed live via `ecs_find_entities`
that the `ground-collider` group node's `PhysicsBody`/`PhysicsShape`
actually registered as real runtime components, not just valid JSON
(the review correctly pointed out the earlier verification — a
`scene_render_file` screenshot — couldn't have caught a physics-only
node failing to attach, since it has no visual surface to render).

One review finding accepted as-is, not changed: the 13 new tree/rock
colliders are centered on the same position as their visual asset
(matching where kubbs/king/stakes already assume the ground sits), so
half of each collider's height sits below the now-corrected ground
surface — geometrically the same category of visual/physics mismatch
as the ground bug, but functionally harmless here (the exposed upper
half, ~0.2m for the tree cylinders, comfortably exceeds a resting
stick or kubb's actual height) and not worth 13 more node-splits for
static garden dressing. Re-verified live after the fix: 3 more clean
reloads, `ground-collider`'s components confirmed present in the
running world.

## 2026-08-28 — M5: GC/pooling pass

Erik asked to move on to the next milestone; separately investigated
(but did not conclusively resolve) his report that picking up a stick
always grabs at its middle rather than wherever you reach — see below.
Then dispatched a dedicated review pass across all 17 `src/systems/*`
files for per-frame allocation, per CLAUDE.md's "never allocate in
update()" rule.

**Two real per-frame allocations found and fixed, one "worth a
decision" flagged and resolved:**

- `ImpactSystem.update()` calls `detectImpact()` for every dynamic
  body (kubbs, king, sticks — essentially everything not currently
  held) every single frame, unconditionally, for the whole session —
  not gated to throws or impacts. `detectImpact` computed
  `length(sub(currentVelocity, previousVelocity))`, and `sub()`
  allocates a fresh 3-element array on every call: ~17 dynamic bodies
  × 90fps ≈ 1,500 array allocations/sec continuously, the highest-
  frequency finding by far. Added `core/vec3.ts`'s `distance(a, b)` —
  `Math.hypot` of the three componentwise differences, mathematically
  identical to `length(sub(a, b))` (verified with a test asserting
  exactly that equivalence) but with no intermediate array. `sub`/
  `length` themselves are untouched — they're correct, appropriately-
  allocating pure functions for their other (one-shot, release-time)
  callers in `core/throwRelease.ts`; only the per-frame caller needed
  the allocation-free variant.
- `ThrowingSystem.samplePose()` allocated a new `PoseSample` object
  plus two new arrays (position, orientation) every frame for every
  held stick — i.e. for the entire aiming window before a throw, not
  a one-shot event. Fixed by reusing the sample object being evicted
  from the pose-smoothing ring buffer (mutating its fields in place)
  instead of allocating fresh; only the first `windowSize` frames of a
  brand-new grab still allocate, since there's nothing to evict yet —
  a small, per-throw-bounded cost rather than a per-frame one. Kept
  the buffer itself a plain ordered array (push/shift) rather than a
  true circular buffer — `core/throwRelease.ts`'s `computeHandVelocity`
  expects chronological order and is untouched, and shifting a 2-8
  element array (the tuned window size range) has no meaningful cost;
  only the element allocations mattered.
- `WindSystem.update()` called `entity.addComponent(PhysicsManipulation,
{ force })` for every flying stick every frame in Advanced mode —
  a new wrapper object each call, even though the `force` array inside
  it was already correctly shared (confirmed safe in an earlier
  review: elics copies Vec3 data into per-entity storage on
  `addComponent`, never retains the reference). Extended that same
  reasoning to the wrapper object itself — precomputed one options
  object per game mode (`MANIPULATION_OPTIONS_BY_MODE`) alongside the
  existing `FORCE_BY_MODE`, so `update()` now only ever looks one up.

Mechanical pass green throughout (tsc/eslint/prettier/vitest — 151
tests, up from 149 — /build/smoke). Live-verified clean boot and no
new console errors; did not manage to reproduce a full grab-swing-
throw cycle live this session (the emulator's synthetic controller
positioning stopped registering grabs partway through testing, for
reasons unrelated to this pass's changes — see the grab-offset
investigation below) so the throw-release math itself (unchanged,
already TDD-covered in `throwRelease.test.ts`) wasn't re-exercised
end-to-end live; the refactor is behavior-preserving by construction
(same values, same order, just reused storage) and covered by
`vec3.test.ts`'s new equivalence assertion.

**Investigated, not resolved: "I always grab the stick in the middle,
didn't used to."** Read through `@pmndrs/handle`'s actual grab-capture
code (`onPointerDown` stores `event.point`, the real sphere-vs-mesh-
bounding-box intersection point, not the object's origin) — the
underlying mechanism is built to preserve wherever you actually
grabbed, not snap to center, so this isn't an obvious library
default or a config regression (`OneHandGrabbable`'s `rotate`/
`translate` config on sticks is unchanged in git history). Found one
concrete, well-evidenced candidate cause instead: sticks carry BOTH
`OneHandGrabbable` (close-range squeeze, offset-preserving per the
above) and `DistanceGrabbable` (ray/trigger, for reaching a stick too
far to touch) — and `DistanceGrabbable`'s `targetPositionOffset`/
`targetQuaternionOffset` default to `[0,0,0]`/identity, meaning a
ray-grab ALWAYS snaps the object's origin to a fixed spot relative to
the hand, by design, regardless of where the ray hit. If Erik is
triggering the ray-grab (trigger) rather than the close-range squeeze
grab, "always centers" is exactly the expected, working-as-designed
behavior of that path — not a bug in either path individually.
Attempted to confirm live by grabbing at various offsets from a
stick's center via `ecs_set_component`-driven controller positioning;
also discovered the underlying grab pointer's default detection
radius is 7cm (`@pmndrs/pointer-events`'s `createGrabPointer`,
`options.radius ?? 0.07`) — a real, useful number, but every offset
attempt (even within that tolerance, positioned exactly on the
stick's own rotated length axis, verified against Three.js's own
`applyQuaternion` for the direction math) still failed to register
via the CLI's synthetic controller-transform injection. Given even a
dead-center grab worked reliably throughout, while every off-center
attempt failed regardless of distance, this looks like an emulator/
CLI testing-methodology limitation (the synthetic controller pose
likely isn't feeding the actual grip-space tracking the same way
real hand/controller pose data would), not a finding about the real
behavior — flagged as unresolved rather than guessed at further.
Asked Erik whether the "always centers" behavior happens even when
physically reaching out and touching the stick (close grab) versus
only when grabbing from further away (ray grab), to confirm or rule
out the DistanceGrabbable hypothesis before changing anything.

**Resolved: DistanceGrabbable removed from sticks; replaced with a
custom StickPullSystem.** Erik confirmed it happens both ways ("spelar
ingen roll om jag plockar upp dem på marken eller jag får dem åkande
till mig"), and separately confirmed the pull is a visible animated
flight to the hand, not an instant snap ("pinne kommer flygandes till
mig") — both consistent with `DistanceGrabbable`'s `MoveTowardsTarget`
default being the one active grab path for every stick interaction,
never `OneHandGrabbable`'s offset-preserving one, exactly as the
hypothesis above predicted. The exact mechanism for why
`DistanceGrabbable` won the single-Handle-per-entity race despite
`GrabSystem.init()` initializing `OneHandGrabbable` first was never
pinned down — not needed, since the fix removes the conflict at its
root regardless of which one would have "won".

Given three options (drop the fly-to-me convenience / make it smart /
something else), Erik chose "gör något smart": keep the convenience,
lose the conflict. Considered dynamically swapping
`OneHandGrabbable`/`DistanceGrabbable` on an entity based on live
hand distance, but that requires removing the existing `Handle` so a
different grab type can initialize — and `Handle` isn't part of
`@iwsdk/core`'s public API (`.claude/rules/ecs-api.md`: "never
deep-import `Handle`"). Rejected that path before writing any code.

Implemented instead: `DistanceGrabbable` removed from all 6 sticks in
`main.iwsdk.scene.json` (only `OneHandGrabbable` remains — verified
live afterward, off-center grabs now preserve the exact grab offset
as the hand moves: controller delta and stick delta matched to the
float, where before every grab snapped to center). New
`src/systems/stickPull.ts` (`StickPullSystem`) reimplements "pull a
far stick to me" without a second `Handle`: on a `Hovered` +
`RayInteractable` stick (the same `Hovered` tag `GrabHighlightSystem`
already reads), if a hand's trigger is held AND that hand's ray is
actually aimed at the stick (dot product of ray direction vs.
direction-to-stick > cos(35°) — needed because `Hovered` is a plain
tag with no hand/pointer info, confirmed in `@iwsdk/core`'s
`state-tags.ts`, so an unrelated trigger held by the other hand, e.g.
for a UI click, must not be mistaken for the hand causing the hover),
sets `PhysicsManipulation.linearVelocity` toward that hand's grip at
2.5 m/s every frame until within 10cm, then stops and lets
`OneHandGrabbable`'s own ~7cm proximity grab (`@pmndrs/pointer-events`'
`createGrabPointer`) finish the job as a normal, offset-preserving
close grab.

A fresh-eyes review of the first draft caught two real bugs before
this landed: (1) the initial hand-attribution fallback used pure grip
distance, not aim direction — replaced with the ray-alignment check
above; (2) `PhysicsManipulation.linearVelocity` writes are one-shot
and absolute, so a stick let go mid-pull (trigger released, hover
lost, or the 10cm stop reached) would keep coasting at 2.5 m/s
indefinitely with nothing to arrest it — fixed by tracking
currently-pulling entities in a `Map` and giving each one an explicit
one-shot zero-velocity write the frame it stops qualifying. Also
excluded `StickPhase.Flying` from the query per the review — `
WindSystem` also drives `PhysicsManipulation` on flying sticks, and
without the exclusion a flying stick that's also ray-hovered would
have both systems overwrite each other's one-shot component in the
same frame (and a player could otherwise tractor-beam a stick out of
mid-flight, clearly unintended).

Mechanical pass green (tsc/eslint/prettier/vitest — still 151 tests,
no new pure-core logic to cover — /build/smoke). Live-verified the
core regression fix (off-center `OneHandGrabbable` grab, no
`DistanceGrabbable` interference) in the emulator, twice — once before
and once after the review-driven rewrite. Could **not** live-verify
the ray-based pull itself: pointing a synthetic controller at a stick
from beyond `OneHandGrabbable`'s ~7cm proximity range never set
`Hovered`, even with generous, geometrically-precise aiming (straight
down from 28cm directly above the stick's center) — proximity-based
`Hovered` (within ~7cm) works reliably, ray-based `Hovered` from
further away does not register at all through this CLI's synthetic
controller-pose injection. Same category of emulator/CLI-testing
limitation as the unresolved grab-offset reproduction attempts above,
not a new finding. The pull mechanic is code-reviewed and
mechanically verified but needs Erik's real-headset confirmation
before it can be called done.

## 2026-08-28 — Environment pass: hilltop sky, plateau-edge cliffs, campsite vignette

Erik asked for three things: a more open environment with more trees/
rocks from "the same library" (more assets, not a new source); the
garden backdrop replaced with a "standing on a high hill" feeling; and
some fun/exciting dressing around the court. Given three concrete
options for each of the first two (asked via AskUserQuestion since he
was live in the conversation, not autonomous), he picked: sky + cliff-
edge dressing around the plane's visible perimeter (lane stays flat,
no real terrain modeling) for the hill, and a cozy-campsite theme
(campfire, tent, log/stump seating) for the fun dressing.

**"Same library, more assets."** The tree/rock GLBs already in
`public/gltf/` are Kenney's Nature Kit (confirmed via ASSETS.md and
the 2026-08-27 "environment felt bare" entry) — `assets/raw/models/
nature-kit/` has the full 330-model pack already downloaded locally,
of which only 11 were ever used. Picked 17 more straight from that
same local archive (no new source, no re-licensing question — CC0,
same as the rest): `tree_oak_fall`/`tree_tall_fall`/`tree_pine_tall_a`
(pine breaks up the all-round-canopy monotony), `rock_large_e`/
`rock_tall_h`/`rock_small_flat_a`, six `cliff_*_rock` variants (block/
large/top/diagonal/half/corner — the pack's terrain-edge module
family, an exact fit for "plateau edge" dressing), and five campsite
props (`campfire_stones`, `tent_detailedOpen`, `log`, `log_stack`,
`stump_round`). Copied straight into `public/gltf/<id>/` per the
established convention (camelCase source name → snake_case folder,
same as `rock_largeD.glb` → `rock_large_d/`), registered in
`src/assets.ts`, logged in `ASSETS.md`.

**The hill.** `DomeTexture`/`IBLTexture` (the actual sky+IBL mechanism,
per the M1 "garden feeling is built in" note above) pointed at
`autumn-park-1k.hdr`, a flat park panorama with no sense of elevation.
Queried Poly Haven's public API for HDRIs tagged `hilltop`+`valley`+
`vista` and picked `autumn_hill_view` — a genuine hilltop-overlooking-
a-valley photo that also keeps the existing autumn palette (matches
the already-`_fall`-suffixed trees) rather than clashing with a
different season/mood. Downloaded the 1k `.hdr` (same resolution
tier as the file it replaces), committed it as `textures/autumn-
hill-view-1k.hdr`, deleted the now-unreferenced `autumn-park-1k.hdr`
from `public/` (kept in `assets/raw/hdri/`, git-ignored, per ASSETS.md's
existing "unused alternative" precedent for `ballawley_park`/`autumn_
park_2k`) and added it to `fetch-assets.sh`'s HDRI loop for
reproducibility. Framed 11 cliff pieces in a broken ring at 6.5-9.7m
radius — sides and both ends, never inside the flat playable lane
(`x∈[-1.5,1.5]`, `z∈[-6,0]`) — so the horizon reads as a plateau edge
from the player's standing eye height without touching gameplay
geometry at all. Verified via `scene_render_file` at the authored
`playerSpawn` view: the hill vista fills the horizon behind the far
kubb line, with two cliff pieces subtly flanking it — visible, not
obstructing the kubbs.

**The campsite.** A five-prop vignette (tent, campfire, a log bench, a
stump seat, a firewood pile) grouped at roughly (-6.5, 2.5) — behind
the near baseline, to the side, beyond the existing fence line (which
only spans `z∈[-5.26,-1.26]` at `x=-3.72`, confirmed by reading its
`pattern` distribution) and beyond the inner tree/rock ring, so it
reads as "off to the side of the pitch" rather than blocking either
throwing lane's sightline.

**Physics.** All 23 new nodes got the same `PhysicsBody: STATIC` +
`PhysicsShape` treatment as the existing trees/rocks (M5's earlier
"nothing rolling stopped for them" fix) — hand-estimated Box/Cylinder
dimensions per prop family, consistent with the existing rock/tree
sizing convention. Checked pairwise distances between every new and
existing decoration node; the only sub-1.2m pairs are the intentional
campsite clustering (fire next to its own bench/stump) and two cliff-
adjacent placements (a tent pitched against a cliff face, a pine
growing next to one) that read as natural composition, not overlap
bugs — confirmed by eye in the rendered views below.

Mechanical pass green (tsc/eslint/prettier/vitest — 151 tests,
unaffected/build/smoke). Validated via `scene_render_file` at four
views (`orbit`, `top`, `playerSpawn`, `grandstandSide`) — `valid: true`,
zero diagnostics, all 17 new `sceneAssets` entries resolved with
non-zero mesh counts, `visibleNodeIds` matched expectations per view,
triangle count still trivial for VR (≤3.1k across the whole scene).
Live-verified in the running app too (not just the static composer):
reloaded the dev server, confirmed the new sky and props render with
no new console errors or warnings beyond the pre-existing, unrelated
UIKitML editor-preview warning. Did not dispatch a fresh-eyes review
for this pass — unlike the grab-logic fix earlier in this session,
there's no algorithmic logic here to get subtly wrong, just placement
and asset wiring, and that was checked directly (JSON validity, the
distance-collision script above, four rendered angles, live console).

**Post-hoc review, filed as follow-up rather than fixed now**: a
`general-purpose` code-reviewer dispatched after this commit was
already pushed (Erik's own `/superpowers:requesting-code-review`)
measured the new decorative nodes' actual glTF bounding boxes against
their hand-estimated `PhysicsShape` dimensions and found real
mismatches — worst case, `cliff-5` (`cliff_corner_rock`)'s visible
mesh is a 0.168×1.0×0.168 sliver under a full `[1,1,1]` collision box,
~6× oversized in both horizontal axes; several campsite props are 2-4×
off in one dimension; one rock (`rock-6`) is undersized, leaving part
of its visible mesh with no collision at all. Not fixed immediately —
`iwsdk.config.json` has `locomotion: false`, so the stationary player
can never physically reach any of these (cliff ring at 6.5-11m, not
6.5-9.7m as this entry originally said — also caught by the same
review), and only a wild stray throw could ever touch them. Filed as
[gh#7](https://github.com/Steken3344/kubborama/issues/7) per this
project's own "out-of-scope findings become issues" rule, rather than
silently left or blocked on.

## 2026-08-28 — Two follow-up issues closed out: CI/deploy dedup, held-stick klonk haptics

Erik asked to knock out gh#1 and gh#4 from the open-issues list.

**gh#1 (CI and Pages-deploy both build the project on every push).**
Merged `.github/workflows/ci.yml` and `deploy.yml` into one workflow
(kept the `ci.yml` filename, renamed the workflow itself to "CI &
Deploy"): a `verify` job runs the existing typecheck/lint/format/test/
build/smoke steps once, then (skipped entirely on `pull_request`
events, via `if: github.event_name != 'pull_request'`) configures
Pages and uploads `dist/` as a Pages artifact in that same job; a
`deploy` job (`needs: verify`) consumes it. This eliminates the
duplicate `npm run build` — the project is now built exactly once per
push, not twice — and, as a side effect, deploy is now genuinely gated
on verify succeeding (previously the two workflows ran in parallel, so
a broken build could deploy while its own CI check was still failing
or had already failed). `pages`/`id-token` permissions scoped to just
the `deploy` job (least privilege — `verify` never needs them, and
previously ran with GitHub's default read-only token anyway).
`workflow_dispatch` added so either job can still be triggered
manually, matching `deploy.yml`'s old capability. No branch-protection
rules exist on this repo (`branches/main/protection` → 404), so
renaming/merging the workflow couldn't break a required-status-check
name.

**gh#4 (klonk sound when two held sticks are struck together).** The
issue's own suggested approach turned out to be exactly right, and
mostly already true: `ImpactSystem`'s `|Δv|`-per-tick heuristic runs
over every `PhysicsBody` in `DYNAMIC` state with no phase filter, and
a held stick's body stays `DYNAMIC` the whole time it's grabbed
(confirmed by reading `@iwsdk/core`'s `PhysicsSystem.update()` —
`Grabbed` drives the body via `HP_Body_SetTargetQTransform`, a
target-transform-tracking technique that still lets Havok compute a
real velocity every step, it doesn't switch the body to a Kinematic
motion type). So `playImpactSfx` already fired the stick-impact klonk
for two held sticks knocked together, unchanged, no new code needed —
verified live by grabbing a stick in each hand and swinging them
together (console showed `[physics] impact` for both stick entities,
force deltas up to 7.9 m/s).

What was genuinely missing: **haptics**. `pulseIfFlyingStick` (the old
name) early-returned for anything not in `StickPhase.Flying`, so a
held-stick klonk played its sound but the holding hand(s) never felt a
thing. Renamed to `pulseHapticForStick` and extended it: for a Flying
stick, hand comes from `StickState.lastThrowerHand` as before (a
held-but-never-thrown stick has this empty, so it wouldn't resolve
correctly anyway); for anything else, if the entity `hasComponent
(Grabbed)`, hand comes from `GrabSystem.getHolderHand(entity)` — the
project's own established public-API pattern for "which hand holds
this" (`.claude/rules/ecs-api.md`; `HandoffSystem` already uses the
identical `this.world.getSystem(GrabSystem)` init pattern). Since both
sticks in a two-handed klonk are independently in the `dynamicBodies`
query, each one's own impact independently resolves and pulses its
own holding hand — no shared/paired detection logic needed, matching
the rest of this heuristic's per-body, not per-collision-pair, design.

Live-verified: grabbed two sticks (one per hand) in the emulator and
swung them together — three separate impacts logged across both stick
entities (7.9, 4.2, 2.5 m/s deltas), zero console errors, confirming
`GrabSystem.getHolderHand` resolves cleanly from `ImpactSystem`'s new
`init()`. Mechanical pass green throughout (tsc/eslint/prettier/
vitest — still 151 tests, no new pure-core logic — /build/smoke).
gh#1 and gh#4 both closed.

## 2026-08-28 — Environment scale pass: trees/tent/campfire were all too small

Erik's feedback: comparing the environment pass's assets against a
0.15m kubb and his own 1.8m height, the trees, tent, and campfire read
as toy-sized, not real-world scale. Measured this directly rather than
eyeballing it: read each affected glTF's accessor min/max (a five-line
script, same technique the fbc9c77 post-hoc review used) to get real
modeled heights. Every "_fall"/plateau/pine tree in the scene is only
1.1-1.7m tall as modeled — literally shorter than Erik — and the tent
is 0.875×0.561×0.666m, dollhouse-sized next to a 0.3m king piece.

Fixed via each node's `transform.scale` (uniform scalar), not by
re-authoring the source geometry — Kenney's kit is meant to be scaled
per scene, this isn't a broken asset. Picked per-tree multipliers to
land in a plausible real-tree range (3.4-5.6x, landing at roughly
3.8-8.6m final height depending on species — "small" stays smaller
than "tall"/oak/pine, preserving the intended relative variety) and
2.5x/1.8x for the tent/campfire (tent → ~2.2×1.4×1.7m, a real small
tent's footprint; campfire → ~0.97×0.14×0.93m, appropriately low but
no longer tiny).

**Also fixed two of gh#7's flagged mismatches as a side effect**: since
`PhysicsShape.dimensions` is never auto-scaled by `object3D.scale`
(confirmed by reading `@iwsdk/core`'s `createBoxShape`/`createHavok
Shapes` — they take the raw dimensions value with no scale-factor
multiply), leaving the 9 tree colliders and the tent/campfire boxes at
their old dimensions while scaling the visuals up 3-5x would have
made the mismatch from gh#7 dramatically worse (colliders staying
tiny under now-huge trees). Scaled every affected collider by the same
factor as its node's visual scale — correct, not just convenient,
since a uniform `object3D.scale` really does grow the trunk's on-mesh
width by that same factor, not just the canopy. For the tent and
campfire specifically, replaced the old hand-guessed box dimensions
with the real measured bounding box × the new scale factor, which
incidentally resolves those 2 of gh#7's ~8 flagged mismatches (rocks/
cliffs are unaffected by this pass and remain open in gh#7).

Verified via `scene_render_file` at the `playerSpawn` and
`grandstandSide` views: trees now visibly tower over the corner stakes
and kubb line as they should; the tent reads as a real small tent next
to the fence, not a toy. Live-reloaded the running app too — no new
console errors/warnings beyond the pre-existing unrelated UIKitML
editor-preview one. Mechanical pass green (tsc/eslint/prettier/vitest
— 151 tests, unaffected — /build/smoke).

## 2026-08-28 — gh#3 root-caused and fixed: cyan autumn foliage was a metallic-reflection bug

Erik went AFK and asked me to work the open-issue backlog one at a
time. gh#3's own hypothesis ("a texture failing to resolve") turned
out to be wrong — read the actual glTF materials for the three named
trees (`tree_fat_fall`, `tree_small_fall`, `tree_cone_fall`) and found
their `leafsFall` material's `baseColorFactor` is already correct warm
orange (`[1, 0.573, 0.255, 1]`); there's no texture reference at all
(`textures: []`, `images: []`) for the loader to fail to resolve.

The real cause: every material in every Kenney Nature Kit glTF in this
project — trees, rocks, cliffs, fence, campsite props, no exception —
has `metallicFactor: 1, roughnessFactor: 1`. A fully-metallic surface's
visible color comes from reflecting the environment (tinted by
baseColor as Fresnel reflectance), not from diffuse albedo — under
this scene's HDRI sky (mostly blue), that reads as a cyan/blue tint
regardless of the material's actual orange baseColorFactor. Confirmed
by patching one file (`tree_fat_fall.glb`'s `metallicFactor` 1→0,
rewriting the GLB's JSON chunk directly — GLB is just a length-
prefixed JSON+BIN container, no export tool needed) and live-verifying
in the runtime: cyan → correct warm cream/orange, immediately.

Since every Kenney material in the pack shares this defect (confirmed
by dumping every `public/gltf/*/*.glb`'s materials — rocks/cliffs/
fence/campsite props all show the identical `metallicFactor: 1`
pattern), patched all 28 committed GLBs the same way, not just the 3
originally reported — the cyan-tinted rock/cliff tops visible in the
M5 environment-pass screenshots were the same bug, just less
obviously wrong-looking on grey/tan stone than on foliage that should
read unambiguously orange.

**A real debugging trap hit along the way, worth recording**: the
IWSDK-managed browser's in-memory `CacheManager` (a plain module-level
`Map`, confirmed by reading `@iwsdk/core`'s source — genuinely not
persisted anywhere) did NOT explain what looked like a stuck cache at
first. `scene_render_file`'s composer preview kept returning an
identical `screenshotSha256` across calls even after `browser_reload_
page` and a full `npx iwsdk dev down`/`dev up` — turned out to be a
red herring: a `curl` straight to the dev server confirmed the patched
bytes were being served correctly the whole time, and the composer
preview DID pick up the fix after the full server restart (confirmed
by its screenshot hash finally changing). The subsequent live
`browser_screenshot` still showing cyan trees was **not** a caching
bug at all — it was `tree_thin_dark` and `tree_pine_tall_a`, two
_different_, never-reported tree variants sharing a `leafsDark`
material whose `baseColorFactor` genuinely is `[0.169, 0.651, 0.667]`
— an intentionally teal/cyan "dark" foliage color in Kenney's own
data, not a bug. Confirmed by toggling that entity's `Visibility` off
mid-session and re-shooting the same camera angle: the reported-broken
tree next to it was already showing correct warm color: the two trees'
huge new canopies (after the same-session scale-up pass) were simply
overlapping in frame, and the intentionally-teal one visually
dominated the shot. Lesson: when a fix appears to only partially work,
identify the SPECIFIC entity on screen (`ecs_find_entities` position
lookup + `Visibility` toggle) before assuming the fix itself is wrong
or the tooling is stale — three different explanations (cache, wrong
fix, unrelated intentional color) were live candidates simultaneously,
and only the entity-isolation test actually distinguished them.

Not touched: `tree_thin_dark`/`tree_pine_tall_a`'s teal color itself —
that's Kenney's own aesthetic choice for the "dark" variant, not what
gh#3 reported, and recoloring it wasn't asked for. Flagged to Erik as
an observation (now more visually prominent after the trees' scale-up)
rather than acted on unilaterally.

Mechanical pass green (tsc/eslint/prettier/vitest — 151 tests,
unaffected/build/smoke — none of this touches TS source, only
committed binary assets). Live-verified all three originally-reported
trees individually (direct camera aim at each, `Visibility`-isolated
where two trees' canopies overlapped in frame) — all three now show
correct warm autumn color. gh#3 closed.

## 2026-08-28 — gh#7 closed: remeasured every flagged decorative collider

Same technique as gh#3's investigation and the earlier scale pass:
read each affected glTF's accessor min/max directly rather than
re-guessing. Fixed all 17 remaining nodes gh#7 flagged (2 of its ~19
— the tent and campfire — were already fixed as a side effect of the
tree/tent/campfire scale pass earlier this session): all 11 cliff
nodes, `campsite-bench`/`campsite-stump`/`campsite-logs`, and
`rock-6`/`rock-7`/`rock-8`. `rock-7` (`rock_tall_h`) wasn't explicitly
named in gh#7's spot-check but was equally wrong (declared `[0.3,0.5,
0.3]` vs real `[0.575,0.711,0.664]`, roughly half-size) — fixed too
since the real measurement was already in hand.

None of these nodes have a non-1 `transform.scale`, so this was a
straight swap to the measured bounding box, no scale-factor
multiplication needed (unlike the tent/campfire fix, which did need
one). Mechanical pass green throughout (tsc/eslint/prettier/vitest —
151 tests, unaffected/build/smoke). Live-reloaded and checked console
— no new errors beyond the pre-existing unrelated UIKitML warning;
these are pure collider-dimension changes (invisible geometry), so a
visual render wouldn't show a difference — the correctness check here
is the measurement matching the source mesh, not a screenshot. gh#7
closed.

## 2026-08-28 — gh#5 fixed: å/ä/ö now render, via a patch-package patch

gh#5's own root-cause writeup (from M4) was already exactly right and
didn't need re-investigation: `@drawcall/uikitml`'s `loadTTF(src)`
(`node_modules/@drawcall/uikitml/dist/fonts.js`) always called
`new TTFLoader().loadAsync(src)` with a bare URL string, never an
options object — so a custom `@font-face`'s MSDF bake always fell
back to `@pmndrs/uikit`'s `TTFLoader`'s hardcoded ASCII-only default
charset, silently dropping å/ä/ö/Å/Ä/Ö regardless of what the source
`.ttf` actually contains.

Confirmed (reading `packages/.../loaders/ttf.js`, i.e. `@pmndrs/uikit`'s
own `TTFLoader.loadAsync`/`_generate`) that `TTFLoader` itself already
fully supports a per-font `charset` override via `{url, charset}` —
the bug was purely that `@drawcall/uikitml` never threaded one
through. Also checked gh#5's "real fix option 2" (switch to one of the
17 pre-baked `@pmndrs/msdfonts` bundled families instead of a custom
`@font-face`) — dead end: every bundled family's pre-baked atlas
(`node_modules/@pmndrs/msdfonts/dist/*.js`) was generated with that
exact same ASCII-only default charset, confirmed by grepping for the
å/ä/ö/Å/Ä/Ö Unicode codepoints in `inter.js` — none present. So gh#5's
"option 1" (patch the loader) was the only viable path, not option 2.

**Fix**: added `patch-package` as a devDependency, patched `loadTTF`
to call `TTFLoader().loadAsync({ url: src, charset: <ASCII default +
åäöÅÄÖ> })`, generated `patches/@drawcall+uikitml+0.1.8.patch`, and
added `"postinstall": "patch-package"` to `package.json` so the patch
reapplies automatically after every `npm install`/`npm ci` (verified
by reinstalling a clean copy of the package and confirming `npx
patch-package` reproduces the exact patched file — this is essential
since `node_modules` isn't committed, so without a postinstall hook
the fix would silently vanish on the next `npm ci`, including in CI).

Updated `src/data/i18n/sv.json`'s three strings that had been spelling
around the bug (`"Pa"` → `"På"` ×2, `"Basta"` → `"Bästa"`) — did NOT
touch `resetButton: "Ny runda"`, which was never a workaround (an
earlier M3 entry already establishes "Ny runda" is the _correct_ label
for what that button does, not a substitute for "Återställ"). Removed
`src/i18nState.test.ts`'s now-backwards guard test (it asserted no
dictionary value contains å/ä/ö — exactly what we now want to allow)
and updated the two UIKitML files' inline comments that documented the
old workaround.

**Live-verification gap, disclosed rather than glossed over**: could
not get a click-through screenshot of the "Alternativ"/"Statistik"
tabs (where the three fixed strings actually render) — `ui_render_
preview`'s isolated composer preview hit the same pre-existing
"transparent after a WebGL context interruption" quirk noted
elsewhere this session, and live ray-aimed clicks at those exact tab
buttons missed repeatedly, closing the menu instead of switching tabs.
This exact difficulty was already documented in M4's own entry above
("both sit at panel edges where ray-aiming repeatedly missed" — code-
pattern verification was accepted there instead of a live click) —
same panel, same known limitation, not a new problem. Confidence in
the fix itself comes from reading the actual library source
end-to-end (not guessing): `TTFLoader` demonstrably honors a passed
`charset`, and the exact object shape now passed matches what it
expects. Flagged for Erik to visually confirm "Bästa fallkast"/
"Haptik: På" next time he opens those tabs on headset.

Mechanical pass green (tsc/eslint/prettier — 150 tests, one down from
151 since the now-backwards guard test was removed — /build/smoke).
gh#5 closed.

## 2026-08-28 — gh#2 closed: a CI-testable release seam instead of a fixed MCP clock

gh#2's own suggested fix #2 ("a test-only seam feeding a `PoseSample[]`
array directly into the release-velocity pipeline") was the right
call — its option #1 (a synthetic fixed clock inside `ecs_step`) isn't
something this project can implement; it'd be a request against
IWSDK's own MCP tooling, out of reach here.

Extracted `ThrowingSystem.onRelease`'s full release computation
(pose buffer → hand velocity → lever-arm correction → tuning-multiplier
scaling → release speed) into a new pure function, `core/throwRelease
.ts`'s `computeThrowRelease()` — everything `onRelease` does except
the ECS writes, haptics, and audio/event side effects. This is exactly
the "adapters are thin, logic lives in core" shape CLAUDE.md's
architecture rule already calls for; the computation had just been
sitting inline in the system instead of extracted, since nothing
before now needed to call it standalone.

Wrote a genuine "golden throw" regression suite (`throwRelease.test
.ts`) against `core/ballisticBands.ts` — the same physics-computed
target bands (`releaseSpeedMps: 6.9-7.7`, `spinRadS: 3-13`) the tuning
lab already uses, imported directly rather than re-declared, so this
test and the tuning lab can never silently drift apart. A synthetic
72Hz pose sweep (constant velocity + constant flip spin, no MCP
device simulation, no real-clock timing at all) feeds `compute
ThrowRelease` and asserts the release speed/spin land inside those
bands — replacing the abandoned MCP-scripted approach with something
that actually runs in CI, deterministically, in milliseconds. Also
added multiplier-scaling and lever-arm-isolation tests (the latter
initially failed for an interesting, worth-recording reason: the first
attempt offset the synthetic CoM _parallel_ to the spin axis, and
`ω × leverArm` is exactly zero for parallel vectors by construction —
fixed by offsetting perpendicular to the spin axis instead, matching
how a real stick's length actually extends away from a flip axis).

Refactored `ThrowingSystem.onRelease` to call the new pure function
instead of duplicating its logic inline — behavior-preserving by
construction (same formula, same order, same multiplier values), and
confirmed live in the emulator: grabbed and swung a stick, `[throw]
release`/`[throw] telemetry recorded` fired cleanly with the correctly-
shaped event payload and no runtime errors. `releaseSpeedMps: 0` in
that specific live check is the same known MCP round-trip-latency
artifact this very issue is about (a single `xr_animate_to` call
doesn't produce real-cadence pose samples) — not a regression; the
real magnitude-correctness check now lives in the new unit tests,
which don't have that problem at all.

Mechanical pass green (tsc/eslint/prettier/vitest — 154 tests, up from
150 — /build/smoke). gh#2 closed — the open-issue backlog Erik asked
to be worked through while AFK is now empty.

## 2026-08-28 — 3x more trees, first bush props, from the same Kenney archive

Erik: "add 3x more trees and bushes, more assets with a lot of
variation." Picked 14 more distinct models from the same already-local
Kenney Nature Kit archive (no new source): 8 more tree variants
(`tree_default_fall`, `tree_simple_fall`, `tree_blocks_fall`,
`tree_detailed_fall`, `tree_pine_round_a`/`_c`, `tree_pine_small_a`,
`tree_pine_ground_a`) and the pack's 6 bush models
(`plant_bush{,_detailed,_large,_large_triangle,_small,_triangle}`) —
the first bush props used in this project. Learned from this
session's own earlier mistakes and applied both fixes proactively
this time, before anything was placed:

- **Patched `metallicFactor` 1→0 on all 14 new GLBs immediately after
  copying them** (gh#3's fix), rather than discovering the cyan-
  reflection bug again later.
- **Measured every new asset's real glTF bounding box up front** and
  derived `PhysicsShape.dimensions` directly from it, scaled by each
  node's `transform.scale` (gh#7's fix), rather than hand-guessing
  and creating more mismatches to find in a future review.

Noted, not treated as a bug: every pine variant (`tree_pine_*`, matching
`tree_thin_dark` from the earlier pass) and every bush share Kenney's
`leafsDark`/`grass` materials — a genuine mint-teal/cyan-ish color by
design (confirmed identical `baseColorFactor` values across all of
them), not the metallic-reflection defect. Reads fine here — it plays
as a deliberate "blue-green evergreen/groundcover" contrast against
the warm orange `_fall` trees, the same way real blue spruce contrasts
with autumn foliage.

Placement: a seeded-random scatter (Python, one-off content authoring
— not game code, so this isn't the "no `Math.random()`" rule's
target) across an annulus from the existing lane, avoiding the same
flat playable rectangle every other pass has respected
(`x∈[-2,2]`,`z∈[-6.5,0.5]`, padded slightly wider than the true lane)
and rejection-sampled against every existing decorative node's
position (1.3m min spacing for trees, 0.6m for bushes — bushes are
meant to cluster). 16 new tree nodes (8 types × 2), 18 new bush nodes
(6 types × 3) — total tree count 9→25 (~2.8x, Erik's "3x" as a rough
target rather than an exact multiplier), bushes 0→18 as a wholly new
category.

Scale: trees individually tuned to a plausible final height (3-6.5m
depending on species, same reasoning as the earlier tree-scale pass);
bushes uniformly 2.5x (real height 0.17-0.36m → final 0.42-0.9m, a
believable garden-bush range).

Verified via `scene_render_file` at the `playerSpawn` view — good
variety and silhouette (conical pines, round bushy trees, triangular
ground bushes), no visible clipping/floating; the fixed `orbit` preset
camera position turned out to now sit very close to one newly-placed
tree (an artifact of that preset's hardcoded camera position, not a
placement bug — confirmed by re-rendering from `playerSpawn`/
`grandstandSide` instead, both clean). Live-reloaded — no new console
errors beyond the pre-existing unrelated UIKitML warning. Mechanical
pass green throughout (tsc/eslint/prettier/vitest — 154 tests,
unaffected/build/smoke; this is scene-JSON + asset-manifest content
only, no TS logic changed).

**Found by Erik's `/code-review` and fixed same-session: the flat
1.3m/0.6m spacing constants above didn't scale with object size — 8
real overlapping-collider pairs, mostly between the newer, larger bush
models (half-extent up to 0.75m) and their neighbors.** The renders
above genuinely looked clean (bushes/trees are visually compact enough
that a rendered screenshot doesn't obviously reveal a 0.2-0.8m
footprint overlap at scatter-plot scale), but a rigorous oriented-box
check the review ran caught them. Root cause: the placement script's
rejection sampling checked plain center-to-center distance against one
fixed number per category, without accounting for each specific
model's actual footprint radius — a `bush_large_triangle` (half-extent
0.75m after its 2.5x scale) needs roughly 2.5x more clearance than the
0.6m constant assumed, and the script never asked.

Fixed properly rather than nudging the 8 flagged coordinates: rewrote
the spacing check to derive each node's own circumscribed-circle
radius from its actual `PhysicsShape` (radius directly for Cylinder,
half-diagonal of the box for Box — the same measured dimensions
already used to set the collider itself, just finally reused for
placement too), and require `radiusA + radiusB + 0.15m margin`
between any two nodes instead of a flat constant. A circumscribed
circle is rotation-invariant, so this stays correct regardless of each
node's `rotationDeg` without needing full oriented-box math. Also
padded the lane-buffer check by each candidate's own radius, since the
review separately flagged a few bushes reaching into (not through) the
documented `x∈[-2,2]`/`z∈[-6.5,0.5]` buffer.

Regenerated all 34 nodes from scratch with the corrected script (same
seed, same target counts/scale/asset choices — only the spacing logic
changed) rather than patching the flagged pairs individually, since
several formed overlap chains (one bush touching two different
trees). Verified programmatically this time, not just by eye: a
pairwise circle-overlap self-check across every new node plus every
pre-existing one reports zero overlaps involving any new node (a
handful of pre-existing overlaps remain — kubbs/king/court-lines
sitting close by design, and the already-reviewed-and-accepted
campsite/cliff clustering from the earlier environment pass — out of
scope for this fix, not touched). Re-verified live (render + console)
and re-ran the full mechanical pass, all green.

## 2026-08-29 — Trigger now also grabs a nearby stick (not just squeeze)

Erik's feedback: picking up a stick should also work on the index-
finger trigger, not just the current button. `OneHandGrabbable`
itself has no button-remap field (checked its actual schema — just
rotate/translate constraints), and the grab pointer is hardwired to
squeeze inside `@iwsdk/core`'s `GrabSystem`/`MultiPointer` — no
per-component or per-project config exposes a different button.

Found the right seam by reading `GrabSystem`'s own source rather than
guessing: its `useHandPinchForGrab` option (forwards a hand-pinch
gesture to grab) does exactly this already, via `this.input.xr.
multiPointers[handedness].routeDown('squeeze', 'grab', { timeStamp })`
/ `routeUp(...)` — a real, public, typed method
(`MultiPointer.routeDown`/`routeUp` in `@iwsdk/xr-input`'s own
`.d.ts`), gated only by `isPrimary('hand', handedness)` so it only
fires in hand-tracking mode. `routeDown` calls `.down()` directly on
the resolved pointer (bypassing the higher-level `InteractorState`
machine entirely) — the underlying `@pmndrs/pointer-events` pointer
decides whether anything is actually within its own reach at that
instant, exactly like a real squeeze press already does.

New `src/systems/triggerGrab.ts` (`TriggerGrabSystem`): on the
controller trigger's press/release edge (`getButtonDown`/`getButtonUp
(InputComponent.Trigger)`), calls the exact same `routeDown`/`routeUp
('squeeze', 'grab', ...)` — controller mode's equivalent of what the
hand-pinch path already does for hand tracking. No `Handle` deep-
import, no parallel grab pipeline: a trigger-initiated grab sets the
real `Grabbed` tag through the real `GrabSystem`/`Handle` machinery,
so `ThrowingSystem`/`ImpactSystem`/`HandoffSystem` all see it exactly
like a squeeze grab, offset-preserving included. Registered before
`StickPullSystem` in `src/index.ts` so a same-frame trigger-grab's
`Grabbed` tag already excludes the entity from that system's query
this same frame.

No conflict with `StickPullSystem`'s own use of trigger for pull-from-
distance: `routeDown` is a no-op whenever nothing is within the grab
pointer's own ~7cm proximity, so a far stick is entirely unaffected —
`StickPullSystem`'s ray+`Hovered` logic keeps working exactly as
before, right up until the stick is close enough that trigger being
held would grab it anyway.

Live-verified in the emulator: grabbed a stick with trigger alone (no
squeeze), moved the controller, confirmed the exact same offset-
preserving behavior already verified for squeeze grabs — controller
delta matched stick delta bit for bit. Released via trigger, confirmed
`Grabbed` cleared. Re-confirmed squeeze still grabs correctly
afterward (unaffected regression check). Zero console errors.
Mechanical pass green (tsc/eslint/prettier/vitest — 154 tests,
unaffected/build/smoke).

## 2026-08-29 — App icon + a real entering-the-game moment

Erik picked option B: a simple icon with the king piece and crossed
throwing sticks. Built it from the game's own existing procedural
geometry (`king`/`stick` scene-assets, already registered in
`src/assets.ts` — no new external asset, no licensing question) rather
than hand-drawing something disconnected from the actual game.

New `public/scenes/icon.iwsdk.scene.json`: a small, non-playable
composition — king centered, two sticks crossed behind it (rotated
±45° around Z so they read as a flat X in camera space, not
foreshortened), a solid dark-forest-green backdrop via `DomeGradient`
with all three color stops set to the same value (the simplest way to
get a flat-color background — no HDR file needed), one warm
directional light + a hemisphere fill matching the main scene's
palette, and a tight "icon" hero view. Kept as a permanent, committed
scene file (not deleted after rendering) so the composition can be
re-rendered later if the icon ever needs a tweak — same reasoning
`iwsdk-scene-composer`'s scratch-module pattern already uses, just for
a one-off tooling asset instead of a level fragment. It's never
referenced by `iwsdk.config.json`, so it has no effect on the app
itself.

Rendered via `scene_render_file`/`npx iwsdk scene render-file` at
1024×1024, then used `sharp` (already a project devDependency) to
flatten the alpha channel against the same background color and
generate the actual shipped sizes: `public/icons/icon-{192,512}.png`
(future PWA manifest icons — M6 hasn't started, these are just sitting
ready for it) and `public/favicon-{32,48}.png`. Checked the smallest
size by eye: the crown's red accent gets subtle at 32px but the
crossed-sticks-behind-a-post silhouette still reads as a distinct
shape, which is what a favicon needs to do at a glance.

**The "see it when entering the game" half of the ask**: `index.html`
previously had zero branding at all — `<link rel="icon" href="data:,">`
(a literal empty placeholder) and a lowercase `kubborama` title, no
loading UI of any kind. Added a fixed, full-viewport `#splash` div
(same background green as the icon, the icon image, a "KubbOrama"
wordmark) directly in the static HTML body — critically, in the markup
itself, not injected by JS, so it paints before the module script even
starts executing, guaranteed by ordinary HTML parsing order, not
something that needs a race-prone runtime check. `src/index.ts` adds a
`splash-hidden` class (CSS opacity/pointer-events transition) at the
very end of `World.create(...).then(...)`, after every system is
registered — so it only disappears once the game is actually ready to
play, not at some earlier, misleadingly-early "loaded" signal.

Verified: the built `dist/index.html` shows Vite correctly rewrote
every new `/`-prefixed icon/favicon reference to the same relative
`./` form already used for `/src/index.ts` (confirming the existing
`base: './'` GitHub Pages setup handles the new assets identically),
and all four PNGs land in `dist/`. Live console clean, no 404s.
Could not catch the splash mid-fade with a screenshot — local dev
loads faster than an MCP reload-then-screenshot round-trip, so by the
time the screenshot tool captures anything the world has always
already finished loading. Not treated as a real verification gap: a
static element painted directly in server-delivered HTML markup
rendering before deferred module JS runs is basic, guaranteed browser
behavior, not something that needs to be empirically caught on camera
to trust. Mechanical pass green throughout (tsc/eslint/prettier/vitest
— 154 tests, unaffected/build/smoke).

## 2026-08-29 — Found and fixed a real CI flake: smoke test could false-fail on cleanup

Noticed while double-checking CI history that the `fix(scene):
eliminate overlapping colliders` push (8ce4c6c) actually **failed**
CI, unnoticed until now — typecheck/lint/format/test/build all passed,
and `scripts/smoke-test.mjs` even printed "Smoke test passed" (its own
assertions genuinely succeeded), but the process then crashed with
exit code 1 anyway. The actual error, from the log: `vite preview`'s
HTTP/2 server threw `ERR_HTTP2_INVALID_STREAM` ("the stream has been
destroyed") from inside `server.close()`, in the script's `finally`
block, uncaught — a shutdown-time race in Vite's own HTTP/2 preview
server, unrelated to whether the build actually works.

Fixed by catching cleanup failures separately from the test verdict:
`browser.close().catch(() => {})` / `server.close().catch(() => {})`.
`process.exitCode` was already being set correctly by the real
pass/fail logic above the `finally` block — the bug was purely that an
unrelated exception thrown _after_ that verdict was already decided
could still crash the process and overwrite it. Couldn't reproduce the
exact race locally (ran the smoke test three times clean, exit code 0
each time) — this is inherently timing-dependent, not something to
chase further; the fix is correct regardless of whether it reproduces
on demand, since swallowing a post-verdict cleanup exception is
unambiguously right either way.

Not treated as blocking anything — later pushes (ca568f3, a8355af)
already show CI green again, so this was a one-off flake, not a
persistent break. Fixed anyway per "foundation-breaking findings get
fixed now" — a CI step that can silently cry wolf undermines trust in
every future green checkmark. Mechanical pass green (tsc/eslint/
prettier/vitest — 154 tests, unaffected/build/smoke, smoke re-run 3x
clean).

## 2026-08-29 — Underhand HUD badge (M2/M3's "Övriga kvar" list, item 1)

The classifier (`core/underhandClassifier.ts`) has produced a real
`ThrowStyle` (`underhand`/`overhand`/`helicopter`) on every throw since
M2 — the HUD just never showed it, per `docs/MILESTONES.md`'s own
M2 note ("HUD badge NOT built — player-facing UI, out of scope until
the HUD exists"). The HUD has existed since M3; this was just never
circled back to.

Added a fourth HUD row (`hud.uikitml`: `style-label`/`throw-style`).
`HudSystem` now also subscribes to the existing `Thrown` event (it
already fires on every release, complete with `style` — no new event,
no new core logic) and sets the row's text via three new i18n keys
(`hudStyleLabel`, `throwStyleUnderhand/Overhand/Helicopter`) plus an
inline color: green for `underhand` (the one correct kubb technique),
neutral white for the other two — informational, never a penalty, per
the classifier's own documented intent.

**First attempt used "Underhand ✓" — real bug, caught live, not
guessed.** The ✓ (U+2713) isn't in gh#5's patched charset (only
å/ä/ö/Å/Ä/Ö were added), so it hit the exact same "Missing glyph info
for character" failure gh#5 fixed for Swedish letters — confirmed via
console log, then confirmed VISUALLY in the emulator: the badge showed
a solid green tofu-box glyph in place of the checkmark, not blank
(DM Sans's MSDF bake generates _some_ geometry for a requested-but-
unsupported codepoint, apparently a fallback/notdef box, not empty
space). Extended the same `patches/@drawcall+uikitml+0.1.8.patch`
charset to include ✓ too (verified the patch still reapplies cleanly
from a fresh install) — but then dropped the ✓ from the actual string
anyway rather than trust a symbol this font may not really contain a
proper glyph for; the color coding alone (green vs white) already
carries the "this was correct" signal without depending on a fragile
glyph. Re-verified live: "Underhand" renders cleanly in green, no tofu
box.

**Unrelated but real finding while testing, filed not chased**: one
grab-and-release cycle, right after a page reload that coincided with
several audio assets timing out (`Asset load timed out after 30000
ms`) and a production build that took 2m48s instead of the usual ~10s
(clear signs the dev machine was under real resource pressure at that
moment), left a stick in unbounded free-fall (`position.y` reaching
-39000 then -51000, `linearVelocity.y` climbing past -195 m/s) — a
classic tunnel-through-the-floor symptom from an oversized single-
frame physics delta. Reproduced-once, not on-demand: a clean reload
immediately after put everything back to normal resting state, and
this session's changes touch UI/i18n only, nothing physics-adjacent.
Filed as [gh#8](https://github.com/Steken3344/kubborama/issues/8)
rather than chased — confirming/fixing a physics-delta-clamping gap
properly is real physics-debugging effort, not something to guess-fix
in passing while verifying a HUD text change.

Mechanical pass green throughout (tsc/eslint/prettier/vitest — 154
tests, unaffected/build/smoke).

## 2026-08-29 — Court size now changes with game mode (M4's known gap)

Root cause: `setGameMode()` never emitted anything (unlike
`setLanguage()`'s `LanguageChanged`), so nothing could react to a mode
switch — `computeCourtLayout()` (pure, tested since M1) was already
capable of producing the right layout per preset, it just had exactly
one caller anywhere in `src/` (`config.ts`'s own `courtLayout()`
wrapper), which nothing else called either. The scene JSON's authored
king/kubb/stake/stick/court-line positions were a one-time snapshot of
`computeCourtLayout('backyard', ..., STICK_LAYOUT_SEED)`'s output,
frozen at authoring time.

Added `GameModeChanged` to the one event bus, emitted from
`setGameMode()`. New `CourtLayoutSystem` subscribes and, on change,
recomputes the layout for the new mode's preset (`game-modes.json` →
`courtPreset`, asserted back from JSON's widened `string` to
`CourtPresetName` by a new `courtPresetForMode()` — see `config.ts`)
and:

- hands king/kubb/stick positions to a new
  `MenuSystem.applyCourtLayout(homePoses)`, which overwrites the
  relevant entries in the existing `homePoses` cache and calls the
  existing private `resetAll()` — reusing the release/rack/teleport +
  `Reset`-event/round-abandon path instead of duplicating it (switching
  mode mid-round IS a reset, just onto a different layout);
- moves the 4 corner stakes directly via `PhysicsSystem
.setBodyTransform()` — **real bug caught live, not guessed**: stakes
  have no `Resettable` tag (real stakes are never knocked over/reset
  mid-round) so the first version silently no-opped on them —
  `applyCourtLayout()`'s home-pose overwrite only affects entities
  `resetAll()` actually iterates, i.e. `Resettable` ones. Verified via
  `ecs_query_entity`: switching to Advanced moved king/kubbs correctly
  but left a stake at the backyard preset's x=-1.5 instead of
  tournament's -2.5, until `CourtLayoutSystem` got its own
  `PhysicsSystem` reference and moved stakes itself;
- resizes and repositions the 5 court-line meshes (also outside the
  Resettable pipeline — static decoration, no physics body) by
  swapping in a new `BoxGeometry` sized for the new preset. Per
  `.claude/rules/assets-and-manifest.md` ("every placement is a
  distinct hierarchy clone, but geometry stays shared... never dispose
  from a placed clone"), the old geometry is intentionally NOT
  disposed — near/far/center lines share one prototype geometry, and
  disposing it from one clone while the others still reference it
  would be exactly the mistake that rule warns about. The orphaned
  BoxGeometry objects are tiny (24 verts) and mode-switching is a rare
  user action, not a per-frame allocation.

Extracted the court-line thickness/height (previously copy-pasted
identically into both `court-line-{short,long}.scene-asset.ts`) into
`pieces.json`'s new `courtLine` block, now the single source both
scene-asset files AND `CourtLayoutSystem` read from.

**Live-verified end to end** in the emulator (not just unit tests):
entered XR, opened the menu (B button), clicked the game-mode button,
and read back `ecs_query_entity` positions before/after — king moved
from `z=-3` (backyard centerZ) to exactly `z=-4` (tournament centerZ),
`kubb-0` to `x=-2, z=-8` (tournament far corner, matches
`computeCourtLayout`'s formula exactly), stakes to `x=±2.5`, a stick
to a correctly-scaled scatter position with `StickState.phase` back to
`RACKED`, and `court-line-left` to `x=-2.5, z=-4`. Toggled back to
Simple and confirmed everything returns to the backyard layout.

**UIKitML button hit-testing has no per-element mesh to target.**
`scene_get_runtime_hierarchy` under the panel shows nothing named after
element ids — UIKitML panels are single-sided quads (per the UI
skill), so a controller ray must land in the right on-panel 2D region,
not on a named sub-object. Worked out empirically + from the Horizon
kit source (`@pmndrs/uikit-horizon/dist/button/index.js`: default
`size: 'lg'` → `height: 44` units, i.e. cm) that a `reset-menu.uikitml`
button's world-Y center is
`panelY + panelHeightWorld/2 - (offsetFromTopUnits * 0.01 * panelScale)`
— the panel entity's `Transform.position` is its vertical **center**,
not its top edge (confirmed by matching predicted vs. actual hit
ranges for the language button). Worth reusing next time a skill needs
to click a specific `reset-menu.uikitml` button via `xr_look_at` +
`xr_select` rather than re-deriving this from scratch.

**Unrelated but real environment finding, fixed in passing**: found
24+ orphaned `vite` dev-server processes accumulated since 2026-08-27
(never cleaned up across sessions — each `iwsdk dev up`/reload
apparently left its old process running), which had left the CURRENT
dev server stuck in `starting: true` indefinitely. This is a strong
candidate root cause for gh#8's unreproduced physics-tunneling
anomaly and that session's abnormally slow builds/audio timeouts,
both attributed at the time to vague "resource contention" — 24
idle-but-resident node processes is a concrete, unambiguous contention
source. `pkill -f node.*node_modules/.bin/vite` cleared them; a fresh
`iwsdk dev up` connected immediately after. No code change from this
(process hygiene, not a bug in the app) — noting here so a future
session recognizes the same "dev status stuck starting forever" or
"physics acts up right after a reload" symptom faster.

Mechanical pass green (tsc/eslint/prettier/vitest — 154 tests,
build/smoke) plus the live emulator verification above.

## 2026-08-29 — Positional audio (re-checked and shipped a previously-documented gap)

M5's session log said positional audio was "verified in source, not
attempted" because `playSfxVariant` used `AudioUtils.createOneShot`,
whose entity has no `Object3D`. Re-reading
`node_modules/@iwsdk/core/dist/audio/audio-system.js` this session
showed the real picture: `createPool()` anchors the pool to
`entity.object3D || this.scene` — and `AudioSource`'s own doc comment
says outright, "For positional audio, attach the component to an
entity with a valid Object3D." The limitation was `createOneShot`
specifically (`world.createEntity()`, no Transform), not the audio
system itself. Also confirmed directly: `createOneShot`'s own
`if (options.positional && options.position) ;` is a literal
empty-statement no-op — a stub that never got filled in.

`playSfxVariant` (`playSfx.ts`) now takes an optional `position: Vec3`.
When given, it creates a `world.createTransformEntity()` at that world
position instead of a bare `createEntity()`, and passes
`positional: true` — everything else (variant picking, volume) is
unchanged. `ImpactSystem` passes the impacting entity's own world
position (already computed for the `Impact` event, reused rather than
duplicated — `undefined` when the entity has no `Object3D` at all, not
`[0,0,0]`, so it degrades to non-positional instead of appearing to
come from world origin). `KubbFelled`/`KingFelled` gained a `position`
field (read from `Transform` at the moment `ToppleSystem` detects the
fell, mirroring `Impact`'s existing pattern) so `SfxSystem`'s
felled-sound handlers can pass it through too. Foley (the release
whoosh) and UI-click sounds stay non-positional deliberately — they're
not spatially meaningful (foley is always "at your hand", clicks are
UI chrome).

Added `audio.json`'s `positional` block (`refDistanceM: 0.6`,
`rolloffFactor: 1.3`, `maxDistanceM: 20`) — a reasonable first-pass
tuning for the court's actual scale (backyard 3×6m up to tournament
5×8m), not a calibrated-by-ear value (audio can't be auditioned in
this environment); revisit if Erik reports it sounding off on a real
headset.

**Real, previously-unnoticed bug found and fixed while building
this**: NOTHING disposes a one-shot sound's entity, ever, and never
has. `AudioSystem.createAndPlayInstance` wires `audio.source.onended`
to `releaseInstance`, which returns the Audio/PositionalAudio object
to its per-entity pool — but nothing calls `entity.dispose()` or even
removes the `AudioSource` component. Every impact klonk, felled sound,
foley whoosh, and UI click this game has ever played (M5 onward) has
been leaking one entity, forever. Fixed with a new tag component
(`OneShotAudio`) and `OneShotAudioSystem`: tracks which one-shot
entities have actually started playing (`AudioUtils.isPlaying`), and
disposes any that were playing and now aren't. `playSfxVariant` tags
every entity it creates (positional or not) with `OneShotAudio`, so
this one fix covers the pre-existing non-positional leak too, not just
the new positional path.

**Live-verified, with real limits on how far verification could go.**
Grabbed and dropped a stick from height repeatedly in the emulator;
console showed multiple real `[physics] impact` log lines (correct
deltaVMps values, no errors/warnings) each time, and `ecs_find_entities
({withComponents: ['OneShotAudio']})` consistently found zero lingering
entities afterward across many repeated impacts — proving disposal
isn't leaking, and combined with error-free logs and the exact code
path being unconditionally exercised, strong indirect evidence
creation succeeds too. Could NOT catch a one-shot entity actually alive
mid-playback: async MCP tool round-trips (each several hundred ms to
low-single-digit seconds, apparently — see below) are far slower than
these clips' lifetime. Tried `ecs_pause` + frame-by-frame `ecs_step`
to remove the timing race entirely; this let the impact-detection
heuristic itself be exercised more/differently than normal play (many
physics steps synchronously back to back) and surfaced spurious
`deltaVMps` readings around 140 m/s — clearly not real motion (the
stick was resting normally, velocity 0, immediately after), but a
second independent data point (alongside gh#8's unreproduced
tunneling incident and the 24-orphaned-`vite`-processes finding
earlier this session) that heavy MCP-driven physics manipulation
(pause/large-batch-step, or possibly just this environment's general
load) can produce transient bogus readings from the impact heuristic.
Not chased further — same reasoning as gh#8: a real investigation
needs dedicated physics-debugging effort, not something to half-verify
while shipping an audio feature. Noting here in case it helps whoever
eventually picks up gh#8: `ecs_pause` + large `ecs_step` batches may be
a more reliably reproducible trigger than a plain reload.

Mechanical pass green (tsc/eslint/prettier/vitest — 154 tests,
build/smoke).

## 2026-08-29 — Wind indicator (last item on the "remaining polish" list)

docs/PLAN.md §13 always specced this: "a handful of drifting leaf
particles as a VISIBLE WIND INDICATOR (direction + strength). It's the
cheapest possible way to make the wind tunable feel real." M4 deferred
it (optional, not part of that milestone's approved scope); Erik's
"remaining polish" list picked it back up this session.

New `WindIndicatorSystem` spawns `windIndicator.leafCount` (14) leaf
entities via `world.assets.instantiate('leaf')` +
`world.createTransformEntity()` — the exact pattern the UI skill uses
for a runtime-instantiated UIKitML panel, just for a plain procedural
`Object3D` instead. `leaf.scene-asset.ts` is a small pointed-oval
`ShapeGeometry` silhouette (two quadratic curves), the same
"deterministic parentless Object3D prototype" pattern as
kubb/king/stake/stick.

Each frame, every leaf: (1) drifts along X at
`windVectorForMode(gameMode)[0] * windIndicator.driftSpeedScale` — the
SAME per-mode wind vector `WindSystem` reads for the real
`PhysicsManipulation` force on flying sticks, just scaled down
separately for a readable ambient pace; zero in Simple mode, so no net
drift there, matching "strength" being part of what the indicator
shows; (2) bobs vertically on a per-leaf sine wave and tumbles on a
random spin axis, regardless of wind, so leaves read as "alive" even
at zero wind rather than looking frozen/broken; (3) respawns at the
opposite edge with a fresh random height/z once it drifts past
`windIndicator.areaHalfWidthM` — an unbounded recycling effect from a
small fixed pool, not a growing/leaking particle count. The spawn area
(`windIndicator.json`: half-width 3.2m, z from +0.6 to -8.6) is sized
to cover every court preset up to tournament's 5×8m with margin, fixed
regardless of which preset is active — deliberately NOT wired into
CourtLayoutSystem, since this is ambient dressing, not gameplay, and
doesn't need to track the exact active preset.

**Live-verified and iterated on real feedback, not guessed.** First
version used green leaves (`#8bae4c`) at 4.5cm — confirmed via
screenshot in the emulator to be nearly invisible against the grass
at normal viewing distance (green-on-green), only visible when the
headset was moved to within ~0.3m of one. Switched to a warm autumn
gold (`#d1892f`, matching the garden's existing "tree_*_fall"/bush
dressing) and enlarged to 8cm; re-verified via screenshot from a
normal court-viewing distance — small but clearly visible warm flecks
against the cool green/teal palette. Confirmed the wind-reactivity
itself via direct `ecs_query_entity` position reads: a leaf's X stayed
bit-for-bit identical across two consecutive reads in Simple mode
(zero drift), then, after switching to Advanced via the real menu
button, moved consistently in the positive-X direction across several
reads including at least two full wrap-arounds (each showing the
expected fresh z and edge-reset x) before switching back to Simple and
confirming X froze again.

Mechanical pass green (tsc/eslint/prettier/vitest — 154 tests,
build/smoke) plus the live verification above.

## 2026-08-29 — Code review of the three items above, one fix applied

Requested a fresh-eyes code reviewer subagent over the full diff of
this session's three shipped features (court resize, positional audio,
wind indicator). Verdict: ready to merge, no Critical issues. The
reviewer independently recomputed `computeCourtLayout('backyard', ...)`
and diffed it byte-for-byte against the authored scene JSON (matched
exactly), and read IWSDK's actual `AudioSystem`/`AudioUtils` source
to confirm the one-shot-audio-leak claim rather than taking it at
face value — both came back confirmed correct.

One real Important-severity finding, fixed same session:
`CourtLayoutSystem.setLine()`'s first `BoxGeometry` swap correctly
skips disposal (still the shared prototype), but every swap after that
replaces a geometry that by then belongs privately to just one mesh,
without disposing it — a slow-accumulating GPU-buffer leak, one tiny
box per line per mode switch. Negligible in practice (mode-switching
is a deliberate, infrequent action), but CLAUDE.md treats this class
of leak as worth closing. Fixed by tracking which line node ids have
been resized at least once (`resizedLineIds: Set<string>`) and
disposing the previous geometry from the second swap onward. Re-
verified live: toggled game mode 4 times in a row, zero console
errors, final state matched the active preset exactly.

Two Minor notes from the review, not acted on (correctly low priority):
mode-switch-mid-round silently abandons the round with no distinct
feedback from a manual reset (same behavior as the existing "Ny runda"
button already has, so not a regression); and IWSDK's own `AudioSystem`
retries a failed audio load forever, so a one-shot entity whose clip
404s would never reach `isPlaying` and never get disposed by
`OneShotAudioSystem` — a pre-existing IWSDK behavior, not introduced by
this session, not worth defending against speculatively.

## 2026-08-29 — Simple mode's real-kubb rules: sin-bin removal + king-protected-until-baseline-clear

Erik's request, with two open design questions resolved via
AskUserQuestion before writing any code (both recommended options
picked): (1) the king simply **cannot be felled** until every kubb is
down — not "falls but doesn't count," not "instant loss" — and (2)
this builds INTO the existing Simple/Advanced toggle (Simple gains the
new rules on its existing backyard/no-wind/50° preset; Advanced stays
today's free-throw-any-order behavior unchanged) rather than a
separate setting. Erik's larger 3-mode vision (simple/normal/advance)
is intentionally scoped down to just Simple for now — Normal is
deferred, not stubbed.

**Also asked before building, and glad I did**: Erik wanted a "jubel"
(cheer) on every kubb felled. Kenney's ready-made jingle packs (Music
Jingles: 85 files, 5 instrument variants) have no win/lose
distinction in their filenames (`jingles_NES00.ogg`, etc.) and I
cannot play or otherwise audition audio in this environment — checked
for `ffmpeg`/`sox`/`python3+numpy` to attempt a pitch-contour-based
guess instead of a literal listen, none available. Picking blind
between an unlabeled win vs. lose jingle is a genuine ~50/50 coin
flip, a materially different risk than this project's earlier
audio picks (all clearly named by content, e.g. "Forest_Ambience").
Asked rather than gambled; Erik chose to skip a new audio asset
entirely and instead reinforce the existing `kubbFelled` sound with a
clearer haptic pattern. `core/haptics.ts`'s `kubbFelled` sequence
changed from a flat two-pulse thud (0.4/0.4, 15ms/15ms, 60ms gap) to a
peppy three-pulse ascending pattern (0.35→0.5→0.6, 12/12/25ms, 45ms
gap) — distinct from the flat original and scaled clearly below
`kingFelled`/`roundCleared`'s bigger ramps so the moment hierarchy
(kubb < king < round) still reads correctly.

**Implementation.** New `SimpleRulesSystem`, purely event-driven (no
`update()` needed):

- `KubbFelled` (only when `gameMode === 'simple'`): resolves the
  event's `entityId` back to a real `Entity` via
  `world.entityManager.getEntityByIndex()` (the standard elics API for
  this — no prior use of it existed in this codebase, `round.ts` had
  only ever used `entityId` as an opaque tracking key, never needing
  the actual entity), teleports it to the next sin-bin slot via the
  existing `PhysicsSystem.setBodyTransform()`, and tags it
  `OutOfPlay`.
- `Reset` (covers the manual "Ny runda" button, a round auto-reset,
  AND a game-mode switch — `CourtLayoutSystem`'s `GameModeChanged`
  handler already funnels into `MenuSystem.applyCourtLayout()` →
  `resetAll()` → emits `Reset`, so a single handler here covers all
  three without a separate `GameModeChanged` subscription): strips
  every `OutOfPlay` tag. Position is already correct by the time this
  runs — the felled kubb is still `Resettable` with its ORIGINAL
  standing home pose untouched (`SimpleRulesSystem` never touches
  `MenuSystem`'s `homePoses` map), and `resetAll()` (the very thing
  that emits `Reset`) has already teleported every `Resettable` entity
  back before any subscriber sees the event.
- King protection is a literal ECS query gate, not a manually-tracked
  boolean: a new `KingProtected` tag, added/removed by re-deriving
  `gameMode === 'simple' && standingKubbs.size > 0` after every
  `KubbFelled`/`Reset`. `ToppleSystem`'s query gained `KingProtected`
  to its `excluded` list (alongside the existing `StickState`) — while
  present, the king simply never enters `ToppleSystem`'s query at all,
  so no rest/angle tracking exists for it to fire early on. Cleaner
  than a runtime special-case inside `checkOne()`.

New pure core function `sinBinSlotPosition(index, kubbHeightM, config)`
(`core/sinBin.ts`, unit tested) computes each felled kubb's slot: a
fixed row outside the court (not wired to the active preset — a
preset/mode switch already empties the sin bin via `Reset`, so there's
never an already-placed kubb to reconcile against a new preset).

**A felled kubb does NOT actually get frozen in place — deliberately,
not an oversight.** Read IWSDK's `PhysicsSystem` source specifically
to check: `state` (Static/Kinematic/Dynamic) is read exactly ONCE, at
Havok body creation (`createBody()`), and `HP_Body_SetMotionType` is
never called again afterward — there is no live motion-type-change API
on an already-created body. Confirmed by trying it: `PhysicsSystem`'s
own per-frame sync unconditionally overwrites `entity.object3D`'s
position/quaternion FROM Havok's authoritative transform for every
non-grabbed body (`matrixBuffer.decompose(...)`), so a direct
`ecs_set_component` write to `Transform.orientation` on a resting body
gets silently discarded on the very next physics tick regardless of
pause/step state — confirmed this dead-ends by testing it directly
before designing around it. So both a felled kubb sitting in the sin
bin and the king before it's felled stay perfectly normal DYNAMIC
bodies the whole time; "out of play" and "protected" are both pure
ECS-query-membership effects, never physics-engine ones. Accepted,
documented simplification: a stray stick reaching far enough outside
the throwing lanes to hit the sin bin could in principle disturb an
already-felled kubb sitting there. Given the sin bin sits outside
normal throwing lanes, this is low-probability and not worth
engineering around.

**Live-verified end to end**, including a real physical topple (not a
faked one): grabbing a stick and dropping it straight down onto a
kubb mostly missed or just wobbled it (a squat, low box resists tipping
from a purely vertical hit) — a horizontal SWEEP through the kubb's
side (grab the stick, position it just past one side at
half-kubb-height, then sweep the controller across to the other side
while still holding it) reliably toppled it. Confirmed via
`ecs_query_entity`: the felled kubb landed at the EXACT computed
sin-bin slot-0 position, tagged `OutOfPlay`; via `ecs_list_systems`'
query entity counts: `standingKubbs` dropped from 10 to 9,
`ToppleSystem.toppleable` stayed at 10 throughout (9 standing kubbs +
1 now-`OutOfPlay`-but-still-in-query kubb — `OutOfPlay` was
deliberately never added to `ToppleSystem`'s own exclusion list, since
`felledReported` already no-ops a re-detected entity for free; the
king staying excluded the whole time is the number that actually
matters here, and it never appeared, confirming protection held).
Clicked "Ny runda" for real and confirmed the full round-trip: position
restored, `OutOfPlay` cleared, `standingKubbs` back to 10,
`KingProtected` back on the king.

**Real environment flakiness hit mid-verification, worth recording.**
After a novel interaction pattern this session hadn't done before
(dragging a GRABBED object in a fast lateral sweep near the menu
panel's general area), every subsequent menu-button click silently
stopped registering — `Hovered` still correctly appeared on the panel
(the ray was reaching it fine), but no button's `Pressed`/click ever
fired, across several different buttons and several different
recalculated aim angles, ruling out an aiming-math regression. A full
`browser_reload_page` (not just `ecs_pause`/`ecs_resume`) immediately
and completely resolved it — the very next click landed correctly. Not
investigated further (this is IWER/emulator-input-pipeline plumbing,
not application code — nothing in `SimpleRulesSystem` or any file this
session touched has any way to influence `GrabSystem`/`InputSystem`'s
internal pointer state), but noting the specific trigger pattern here
in case a future session hits the same "clicks stopped working" wall:
try a full page reload before spending a long time debugging aim math.

Mechanical pass green (tsc/eslint/prettier/vitest — 157 tests,
build/smoke) plus the live verification above.

## 2026-08-30 — gh#8 root-caused and fixed: uncapped physics delta, patched via patch-package

Followed `superpowers:systematic-debugging`'s process rather than
guessing. Root cause, confirmed by reading `@iwsdk/core`'s own source
(not assumed): `node_modules/@iwsdk/core/dist/init/world-initializer.js`'s
`setupRenderLoop()` computes `delta = clock.getDelta()`
(`THREE.Clock`) with **zero clamping** and feeds it straight into
`world.update(delta, elapsedTime)` every frame. `PhysicsSystem.update()`
then does `HP_World_SetIdealStepTime(havokWorld, delta)` immediately
followed by `HP_World_Step(havokWorld, delta)` — **the same
uncapped `delta` for both calls**, meaning Havok's substep count is
always exactly 1 regardless of how large `delta` gets (a genuine
substep-based implementation would set `IdealStepTime` to a small
FIXED value once and let `Step` compute `elapsedDelta / idealStepTime`
internal substeps — this package doesn't do that). So a delta large
enough for gravity to integrate a falling body's velocity+position
past a thin collider's thickness in one step tunnels it clean through,
with nothing to catch it.

**Reproduced directly, not inferred.** `ecs_step`'s own `delta`
parameter turned out to call `world.update()` from the MCP debug
harness directly, bypassing `setupRenderLoop`'s render-loop closure
entirely (confirmed by testing: my patch, once applied, had zero
effect on an `ecs_step`-driven repro — see below) — so I couldn't use
it to validate the eventual fix, but it WAS the right tool to first
confirm the underlying vulnerable mechanism exists at all, independent
of exactly how a large delta arises in production: lifted a stick to
y=5 while grabbed (kinematic, unaffected by integration), paused,
released the grab (queued, not yet processed since paused), then
`ecs_step({count:1, delta:5})`. Result: position.y went from 5 to
**-148.28** in that single step, `_linearVelocity.y` = **-36.79 m/s**
— textbook match for gh#8's original symptom (y ≈ -39000 → -51000,
velocity ≈ -195 m/s and climbing). Confirmed this ISN'T specific to a
resting body either way: an EARLIER attempt at the same delta=5 step
on an already-resting, already-settled kubb produced NO visible
change at all (Havok's contact solver evidently re-projects a body
already in stable resting contact regardless of step size) — the bug
only manifests for a body genuinely in free motion when the huge
delta lands, exactly matching the original report's "a stick's
physics body fell straight through" (a stick that had presumably just
been released, not one already resting).

**Fix**: patched the single delta-producing call site (not
`PhysicsSystem`'s consuming side — clamping at the source protects
every delta-consuming system uniformly, including our own future
code, not just physics) —
`Math.min(clock.getDelta(), MAX_DELTA_S)` with `MAX_DELTA_S = 0.1`,
matching this project's own existing precedent for the exact same
class of problem (`core/restState.ts`'s `MAX_FRAME_DELTA_S`, chosen
independently for a different purpose — rest-duration accumulation,
not physics integration — but the same "don't let one anomalous
frame's elapsed time overstate reality" reasoning). Applied via
`patch-package` (`patches/@iwsdk+core+0.5.3.patch`), the same
established mechanism already used for the UIKitML font-charset fix —
verified reapplication from a truly fresh install
(`rm -rf node_modules/@iwsdk/core && npm install @iwsdk/core@0.5.3
--no-save && npx patch-package`), which is what CI's `npm ci` +
`postinstall: patch-package` will actually run.

**What I could NOT directly verify**: a live repro of a REAL
multi-second wall-clock stall hitting the actual patched render-loop
code path (as opposed to `ecs_step`'s separate, bypassing path). No
available tool blocks the browser's main thread or backgrounds the
tab long enough to force a naturally large `Clock.getDelta()`. What
IS verified: the patch reapplies cleanly from a fresh install
(matching CI exactly), a full mechanical pass is green, the production
build boots with zero console errors, and normal gameplay (grab/drop,
settle) is bit-for-bit unaffected — expected, since real frame deltas
(11-14ms at 72-90fps) are nowhere near the 0.1s clamp threshold. The
fix is applied at the objectively correct, sole chokepoint for this
class of bug; the gap is specifically in reproducing the EXACT
triggering condition end-to-end, not in confidence about the fix
itself.

Left `patch-package @iwsdk/core --create-issue`'s upstream-issue offer
untaken for now — filing against a third party's public repo under
Erik's own GitHub identity is worth a deliberate yes/no from him
rather than doing it silently; flagged to him separately.

Commented gh#8 with this full writeup and closed it as fixed.

Mechanical pass green (tsc/eslint/prettier/vitest — 157 tests,
build/smoke) plus the live verification above.

## 2026-08-30 — Dev debug panel wind knobs (last of the three "what next" items)

docs/PLAN.md's original vision named this explicitly:
`debugPanel.ts # dev-only sliders: wind strength/direction, gravity`
— gravity already exists as a Tuning Lab (tweakpane) param; wind never
got one. Direction is deliberately NOT exposed as a knob: wind's
direction is a fixed cross-court lateral axis by design
(`windVectorForMode()`'s own doc comment), not something the game
should ever vary, so a direction slider would just invite testing a
combination the shipped game can never produce.

Kept OUT of the existing `TuningPreset`/`tuning-params.json` A/B/C
system on purpose: those are throw-FEEL parameters (gravity, spin,
mass, damping) meant to be exported/imported/compared as a preset.
Wind is an environmental experiment, not a feel parameter, and
forcing it into that schema would mean every preset export now
carries a wind value that has nothing to do with feel tuning.

Added `WindSystem.setForceOverride(force: Vec3 | null)` — `null` is
the default and only state until a human touches the new panel
slider, and reproduces today's exact behavior (wind purely derived
from the active game mode). `TuningLabSystem.setWindOverride()` wraps
it; `tuningPanel.ts` gained a "Wind (dev override)" folder: an "Auto
(game mode)" checkbox (default checked) plus a 0-3 m/s slider that
only takes effect once unchecked.

**Live-verified the regression side, not the override side.** The
tweakpane panel is a real desktop DOM overlay, not part of the WebXR
scene graph — none of the available tools (`xr_select` and friends
work only inside the WebXR canvas via ray interaction; `chrome-
devtools-mcp`'s own click/DOM tools can't attach to this managed
browser, it tried to launch its own separate Chrome and failed) can
click an HTML checkbox/slider outside the canvas, so I could not
directly flip the "Auto" toggle and observe the override taking
effect. What IS verified: switched to Advanced mode for real, threw a
stick for real, and confirmed via `ecs_query_entity` that
`PhysicsManipulation.force` is exactly `[0.03, 0, 0]` —
`windVectorForMode('advanced')[0] (1.5) * pieces.wind.dragFactor
(0.02)`, bit-for-bit the pre-existing value — proving the new
nullable-override plumbing didn't disturb the default path. The
override branch itself (`this.forceOverride ?? FORCE_BY_MODE[gameMode]`)
is a two-line ternary using the exact same downstream `options`/`force`
variables the confirmed-working default branch already uses, so this
gap is a tooling limitation, not a real doubt about correctness.

Mechanical pass green (tsc/eslint/prettier/vitest — 157 tests,
build/smoke) plus the live verification above.

## 2026-08-30 — M5 review gate: fresh-eyes found 2 real per-frame allocations, both fixed

Ran the full milestone review gate (mechanical pass → fresh-eyes
subagent review → adversarial pass) over the whole of M5 (`v0.5-m4`
tag → HEAD, 27 commits) before Erik's headset test, per CLAUDE.md's
"Milestone review gate before 'done'" workflow. Architecture held up
well across the milestone — functional core stayed pure (`grep`
confirms zero `@iwsdk/core`/`three` imports anywhere under
`src/core/`), the single event bus stayed the sole dispatch point, and
every mode-driven system (`CourtLayoutSystem`, `WindSystem`,
`WindIndicatorSystem`, `ToppleSystem`, `SimpleRulesSystem`) reads the
same `config.ts`/`settingsState` source of truth with no divergent
copies found.

Two real, previously-unflagged violations of the project's own
"never allocate in `update()`" rule, both fixed same session:

1. **`StickPullSystem.update()`** (`src/systems/stickPull.ts`) —
   `const stillPulling = new Set<number>();` allocated fresh on
   EVERY tick, unconditionally, for the life of the session. This is
   exactly the class of bug M5's own GC/pooling pass (2026-08-28)
   targeted and fixed three instances of — but `StickPullSystem` was
   added one commit AFTER that pass ran, so it was never swept.
   Fixed: hoisted to a persisted `private stillPulling = new
Set<number>()` field, `.clear()`'d at the top of `update()`.
2. **`WindIndicatorSystem.randomLeafState()`** — allocated a fresh
   `LeafState` object AND a fresh `new Vector3(...)` every time a leaf
   recycled (drifted past the spawn area's edge), reachable from
   `update()`'s hot path. Much smaller in practice (bounded to once
   per leaf per edge-crossing, not every frame), but the same
   "added after the pass, never re-swept" story. Fixed by splitting
   out a `randomizeLeafState(state)` that mutates an existing
   `LeafState` (and its `spinAxis` Vector3) in place — `init()` still
   allocates one `LeafState` per leaf via `randomLeafState()` (a true
   one-time cost), recycling now reuses it. Preserved the exact same
   RNG call order so seeded determinism is unaffected.

**Live-verified both fixes.** `StickPullSystem`: no direct repro
needed beyond the mechanical pass — the fix is a pure hoist with
identical logic, `Set.clear()` vs `new Set()` are behaviorally
identical at every call site. `WindIndicatorSystem`: nudged a leaf to
`x=3.15` (just inside the +3.2 edge) via `ecs_set_component`,
switched to Advanced mode for real wind, and watched it cross the
edge and recycle correctly — TWICE, across a few real seconds — with
a fresh random z each time and no console errors, confirming the
in-place mutation didn't break anything across repeated cycles.

**Also flagged by the reviewer, not acted on (correctly scoped out
or deferred, not ignored):**

- The GC pass's own "14 systems confirmed clean" claim in
  `docs/MILESTONES.md` is now stale (8 systems were added/changed
  since) — noting this here rather than re-running a full sweep now:
  the two allocations above WERE the sweep, found via fresh-eyes
  review rather than a dedicated re-pass. No further per-frame
  allocations were found in this review's own spot-checks of
  `CourtLayoutSystem`, `SimpleRulesSystem`, `OneShotAudioSystem`,
  `ImpactSystem`, `ToppleSystem`.
- `patches/@drawcall+uikitml+0.1.8.patch` carries an incidental file-
  mode change on an unrelated file (`cli.js`, 755→644) as a side
  effect of how `patch-package` generated it. Harmless (that file
  isn't invoked as an executable by this project) — left as is rather
  than hand-editing a generated patch file to strip an inert diff line.
- My own uncommitted wind-tuning-panel work-in-progress was correctly
  identified by the reviewer as out of scope for the M5 review (it
  postdates the reviewed range) and excluded from findings.

### Adversarial pass (second, more skeptical review) — 4 real findings, all fixed

Dispatched a second reviewer with explicit instructions to actively
try to break things, not just read for correctness — race conditions,
boundary behavior, "works because I tested it this one way" gaps.
Traced end-to-end and confirmed as SAFE (didn't break, worth recording
since a review that only reports problems is less trustworthy than
one that shows its work both ways): double-fire of `KubbFelled` for
an already-`OutOfPlay` kubb (independent `hasComponent(OutOfPlay)`
guard, not just reliance on `ToppleSystem.felledReported`); a stale
entity reference in `SimpleRulesSystem.onKubbFelled` (`gameEvents.emit`
is fully synchronous, no async gap exists for an entity to be disposed
in between); `Reset` handler ordering across systems (touches disjoint
state, order-independent); rapid double-toggling `GameModeChanged`
(the whole handler chain is synchronous, no interleaving possible in
a single-threaded event loop); entity-index reuse in
`OneShotAudioSystem` (confirmed via reading `elics`'s entity-manager
source that this system is the ONLY disposer of `OneShotAudio`
entities, so no other code path can leave a stale index in
`startedPlaying` while Havok/elics recycles it back out from under —
safe today, but a fragile invariant nobody had written down until now).

Four real findings, all fixed same session:

1. **`src/systems/triggerGrab.ts`** — `for (const hand of ['left',
'right'] as const)` allocated a fresh array every single frame,
   unconditionally, for the life of the session. `as const` only
   narrows the TYPE, it doesn't hoist the array. A genuine 3rd
   instance of the exact bug class both prior review passes were
   hunting for — this one slipped through because `TriggerGrabSystem`
   was added mid-milestone (`ca568f3`) and simply never got the same
   scrutiny its neighbors (`wind.ts`, `stickPull.ts`) got. Fixed:
   hoisted to a module-level `const HANDS = ['left', 'right'] as const`.
2. **`src/systems/oneShotAudio.ts`** — a one-shot sound that never
   starts playing (autoplay blocked pending a user gesture — genuinely
   common in browsers before the first interaction resolves; a 404; a
   decode failure) was never disposed: the system's only disposal
   condition is "was playing, now isn't," which such an entity never
   satisfies. This is the SAME leak this system exists to prevent,
   approached from the opposite direction. Fixed: added a
   `firstSeenTimeS: Map<number, number>` and a generous
   `MAX_LIFETIME_S = 5` force-dispose fallback for an entity that's
   gone that long without ever starting to play.
3. **`src/systems/courtLayout.ts`** — `applyGameMode` mutated live
   state (stake teleports, court-line geometry swaps) interleaved
   with `requireSceneEntity`/`requireSceneObject` lookups that throw
   SYNCHRONOUSLY on a missing node id. A missing/renamed id partway
   through (plausible: Erik hand-edits `main.iwsdk.scene.json` in the
   editor most sessions) would throw mid-migration, leaving some
   stakes/lines on the new preset and the rest on the old one, with no
   `Reset` ever firing to signal or recover. Restructured into two
   phases: resolve ALL 21 scene entities/objects first (any throw here
   happens before any mutation), then apply every transform/geometry
   change from the already-resolved set — nothing in the mutation
   phase can throw anymore.
4. **Redundant clamp + no observability** — `patches/@iwsdk+core+0.5.3
.patch`'s `MAX_DELTA_S` and `core/restState.ts`'s
   `MAX_FRAME_DELTA_S` are the same value (0.1) for the same physical
   concern, a literal DRY violation now that the patch clamps at the
   source (making `restState.ts`'s own clamp mathematically
   unreachable in practice). Kept BOTH rather than unifying — a
   patched `node_modules` file and project source can't cleanly share
   one constant across that boundary, and `restState.ts`'s clamp is
   legitimate defense-in-depth against the patch itself ever failing
   to apply (a dependency bump, a lost patch file) — but added a
   comment cross-referencing the two so the duplication reads as
   intentional, not an oversight. Separately: the patch's clamp had no
   signal when it actually engages, so a real production hitch (as
   opposed to a routine sub-frame delta) was invisible in the console.
   Added a `console.warn` in the patch itself, gated on the raw delta
   actually exceeding the clamp — silent on every normal frame,
   informative on the one that matters.

Also acted on two Minor findings while in this code (cheap, worth
doing rather than filing):

- `SimpleRulesSystem.applyKingProtection()` silently no-op'd on 0
  kings and silently picked an arbitrary one of >1 — structurally
  impossible today (exactly one `KingPiece` in the scene) but
  undiagnosable if a future scene-authoring mistake ever created one.
  Added a `log('warn', 'state', ...)` when the count isn't exactly 1;
  behavior unchanged, just visible now.
- `core/sinBin.test.ts` had no boundary coverage (negative index,
  index past the current 10-kubb design). Added two tests documenting
  the deliberate "no clamping, caller's job" contract rather than
  leaving it implicit.

**Live-verified all of it in the same session**, not just by
inspection: confirmed both patches reapply cleanly from a fresh
install; switched game mode twice for real through the refactored
`CourtLayoutSystem` (court-line position matched the new preset
exactly, zero console errors, zero false-positive king-count
warnings); trigger-grabbed a stick for real (confirms `TriggerGrabSystem`
still works post-hoist); dropped a stick and confirmed a normal
impact sound still plays and disposes cleanly (zero `OneShotAudio`
entities lingering afterward); confirmed the new patch warning never
fires during ordinary play (a normal 11-14ms frame is nowhere near
the 0.1s threshold).

Mechanical pass green (tsc/eslint/prettier/vitest — 159 tests,
build/smoke) plus the live verification above.

### Go/no-go

**M5 milestone review gate: GO, with fixes already applied.** Both
review passes are complete. No Critical issues were found by either
pass. Important issues found across both passes (2 per-frame
allocations from fresh-eyes; 3 correctness/robustness gaps plus a DRY
violation from the adversarial pass) have all been fixed and
live-verified in this same session — nothing is being deferred that
should block Erik's headset test. Remaining M5 checklist items (72Hz
verification on real hardware, the full in-headset perf/comfort/
experience pass) require the physical headset and are Erik's gate, not
something further code changes can satisfy. Recommend: proceed to
that headset test; tag `v0.6-m5` once it comes back clean.

## 2026-08-30 — Stick rack (Erik's ergonomics feedback)

Erik: sticks used to spawn scattered on the ground, and bending down
for each one repeatedly got tiring in VR. Asked via AskUserQuestion
where a rack should go — chose beside the player, right side
(recommended), at a comfortable hip-level reach height rather than
behind (would require turning around) or on the ground.

Replaced ground-scatter with a fixed physical rack: a fixed 6-slot
rack (`core/court-layout.ts`'s new `computeStickRackPositions()`, a
config-driven, non-random pure function — a real rack holds sticks in
tidy parallel slots, nothing to randomize) at `(0.7, 0, -0.15)`,
plank-top height 0.95m, sticks lying flat, evenly spaced. This is
**not court-preset-dependent** (the rack's position has nothing to do
with court size) and **not seeded/random** — both the old `seed`
parameter and all RNG dependency were removed from
`computeCourtLayout()` entirely, since king/kubb/stake placement was
already fully deterministic and only the old stick-scatter ever used
the seed.

New asset `stick-rack.scene-asset.ts` (plank + 2 legs, `woodMaterial`,
matching the existing procedural-prop convention). `CourtLayoutSystem`
no longer touches sticks at all on a game-mode switch — removed the
`stickSpawnPositions`-repositioning block and the now-dead
`stickQuaternion()` helper — since the rack is fixed regardless of
preset.

**Found and fixed a real bug via live emulator testing, before any
commit**: sticks fell straight through the rack's plank to the ground.
Root cause: the visual `stick-rack` scene node is a pure decorative
mesh with no collider at all, so the dynamic stick `PhysicsBody`s had
nothing to land on. Fixed by adding a separate `stick-rack-collider`
scene node (`PhysicsBody: STATIC` + a `Box` `PhysicsShape` sized to
the plank, positioned at the plank's true world-space center) —
the same "visual node + separate invisible collider node" pattern
already used for `ground`/`ground-collider`. This is exactly the class
of bug CLAUDE.md's "verify before you claim it works" discipline
exists to catch — inspection alone (reading the scene JSON) would not
have caught the missing collider.

**Live-verified, not just inspected**: 6 sticks render resting on the
rack (screenshot); direct grab from the rack works (StickState →
HELD); a full throw → auto-reset cycle returns a stick to its exact
rack slot and phase (RACKED); switching game mode (Simple↔Advanced)
leaves a racked stick's position completely untouched — confirms
`CourtLayoutSystem`'s removal of stick-handling logic didn't silently
break anything. Mechanical pass green (tsc/eslint/prettier/vitest —
160 tests — build/smoke) after the collider fix. No console errors
throughout.

### 2026-08-30 (later) — Erik relocated the rack in the scene editor

Erik moved the whole rack (via the managed scene editor, direct
drag/rotate) to sit flush against the fence on the court's right side,
rotated 90° from its original orientation, rather than the original
free-floating `(0.7, -0.15)` spot. Two real issues surfaced from this
manual edit, both fixed same session:

1. **`stick-rack-collider` didn't rotate with the visual rack** —
   its `rotationDeg` stayed `[0,0,0]` while the rack (and plank mesh)
   rotated to `[0,-90,0]`, so the collider's box footprint no longer
   matched the plank's actual world orientation (0.5×0.4m swapped
   axes). Verified by hand that the then-current stick positions still
   happened to fall inside the mismatched footprint's overlap region
   (so nothing was visibly broken yet), but it was fragile — flagged
   to Erik and fixed by setting the collider's transform to exactly
   match the plank's real world position/rotation
   `(1.7313, 0.935, 0.468)`, `[0,-90,0]`.
2. **`scene-sync.test.ts` correctly failed** — Erik's manual drag left
   the 6 stick nodes' authored positions diverging from what
   `computeStickRackPositions()` computes, exactly the drift this
   guard test exists to catch. Rather than reverting Erik's placement,
   promoted it to the source of truth: added a `yawRad` field to
   `StickRackConfig`/`stick-rack.json` (rack rotation around Y, ± the
   rotation the rack itself was dragged to — `-90°`/`-π/2` here) so
   `computeStickRackPositions()` can lay the row out along any rack
   orientation, not just world X. `src/data/stick-rack.json` updated to
   `xM: 1.7313, zM: 0.468, yawRad: -π/2` (matching the rack node's own
   dragged transform, which is a single clean drag/rotate action and
   far more reliable than the 6 individually-dragged stick positions,
   which were only approximately even); the 6 scene-authored stick
   positions were then recomputed exactly from that config and
   overwritten in the scene JSON (not left at Erik's approximate drag
   values), restoring an exact sync. New unit test covers the rotated
   case. Live re-verified: all 6 sticks render in a clean, evenly
   spaced row along the rotated plank (screenshot). Full mechanical
   pass green (161 tests, tsc/eslint/prettier/build/smoke) after the
   fix.

### 2026-08-30 (later still) — rack relocated again, same collider bug recurred

Erik moved the rack a second time, now to sit just behind the player's
spawn point (`(0.0157, 0, 1.0896)`, rotated `-180°` instead of `-90°`).
`stick-rack-collider` again failed to rotate with it — the exact same
class of bug as the first relocation. Fixed the same way (collider
transform snapped to match the plank exactly) and re-promoted the new
placement into `stick-rack.json` (`yawRad: -π`), recomputing all 6
stick positions from `computeStickRackPositions()` rather than the
approximate drag values. 161 tests green, full mechanical pass clean,
live-verified via screenshot.

**This has now happened twice.** If Erik relocates the rack a third
time, worth considering whether `stick-rack-collider` should be
derived automatically from the rack node's transform at load time (a
small system) instead of being a second manually-authored node that
can drift — flagged, not yet built, since it's an architecture change
and this is only the second occurrence.

## 2026-08-30 — HUD sign posts (Erik's request)

Erik: the HUD scoreboard read as "a dashboard hanging in the air" —
asked for it to look like a real sign on two posts instead.

Added `src/scene-assets/hud-sign-posts.scene-asset.ts`: two wooden
`CylinderGeometry` posts (`woodMaterial`, matching the stick-rack/stake
style), placed as a scene node that shares `hud-panel`'s exact X/Z
position and Y-rotation (so no rotation math is needed — the posts
inherit the panel's facing) but with its own Y=0 (ground-anchored,
unlike the panel's Y=1.6 eye-height position — a first attempt copied
the panel's Y verbatim and left the posts floating near the treetops
instead of reaching the ground; fixed once caught live).

Panel real-world size isn't queryable at authoring time (UIKitML
auto-layout height has no static answer), so post height/inset were
estimated from the panel's CSS (`width: 220` UIKit units = 2.2m ×
the `hud-panel` node's `scale: 1.3` ≈ 2.86m wide) cross-checked against
a measured screenshot, then tuned by live iteration: `POST_HEIGHT_M`
raised slightly so the post visibly overlaps the panel's underside
rather than leaving a gap, and `POST_Z_OFFSET_M: -0.05` added so the
posts sit just behind the panel's single-sided front face instead of
sharing its exact depth (which read as poking through the score
numbers, since UIKit right-aligns them close to the panel's right
edge via `justify-content: space-between`).

Live-verified in both the scene editor and the application runtime
(`browser_screenshot`) — this is pure static geometry with no system
behind it, so both should (and do) match. No console errors. Full
mechanical pass green (161 tests, tsc/eslint/prettier/build/smoke).

**Unrelated environment finding, fixed in passing**: hit the same
24+-orphaned-`vite`-process issue from the gh#8 investigation again
(`dev up`/`dev status` stuck reporting `browserCommandReady: false`
indefinitely; `ps aux` showed 6 stray `vite` processes going back to
this morning). `pkill -f node.*node_modules/.bin/vite` cleared it, same
fix as before. This has now recurred at least twice across sessions —
worth a standing habit of checking `ps aux | grep vite` when `dev up`
reports success but the bridge still won't come ready, rather than
retrying `dev up` repeatedly.

## 2026-08-30 — HUD frame ("en tavla")

Erik: wanted a proper frame around the HUD, like a mounted board.

Added `src/scene-assets/hud-frame.scene-asset.ts`: a flat wooden board
(darker `kingWoodMaterial`, distinct from the pale `woodMaterial` used
for the sign posts/stick-rack, so the frame reads as a deliberate
mount rather than matching furniture) sized `PANEL_WIDTH_M +
2×FRAME_MARGIN_M` by `PANEL_HEIGHT_M + 2×FRAME_MARGIN_M`, placed as a
sibling scene node sharing `hud-panel`'s exact transform, same pattern
as the sign posts.

**Real bug caught before committing**: the first version exported a
bare `Mesh` as the asset root with the "sit behind the panel" Z offset
baked into that root's own `position.z`. It had zero effect regardless
of the offset's sign — the frame fully occluded the panel either way.
Root cause: a bare-Mesh asset root has its transform overwritten
entirely by the scene node that places it (the node's authored
position/rotation replaces the prototype's own), so any offset
authored on the root itself is silently discarded. `stick-rack` and
`hud-sign-posts` never hit this because they already wrap their
content in a `Group` and set offsets on children, not the root. Fixed
by doing the same here — wrapped the board `Mesh` inside a `Group`
root and moved the Z offset onto the child. Live re-verified after the
fix: frame renders correctly behind the panel with the score text
fully readable, both in the scene editor and the application runtime
(`browser_screenshot`), no console errors. Full mechanical pass green
(161 tests, tsc/eslint/prettier/build/smoke).

**Worth remembering for future single-mesh procedural assets**: always
wrap in a `Group`, even for a single mesh, if the asset needs any
internal local-space offset — a bare Mesh root only works when its own
origin should coincide exactly with the scene node's authored
transform.

## 2026-08-30 — Live-test regression report, not reproduced (documented, not fixed)

Erik, testing the deployed build after the HUD-frame push: "sticks
seem to end up lower than the floor now, I can't pick up a stick that
landed on the ground" — suspected the stick-rack collider fixes.

Investigated before touching anything (systematic-debugging discipline
— no fix without repro): `ground`/`ground-collider` are untouched by
every commit since `bbfeca4` (grepped the full diff history). Live-
tested in the emulator: grabbed a stick from the (twice-relocated)
rack, dropped it on open court ground — settled at y≈0.0219 (exactly
the cylinder radius, correct) and was immediately re-grabbable.
Repeated directly underneath the relocated rack (between its two
support posts, at ground level) — same correct result. Could not
reproduce either symptom in either tested spot.

Erik decided it was "maybe just something weird" and moved on (2 real
Quest headsets, testing at night — a transient tracking/rendering
glitch on real hardware is plausible and wouldn't show up in the
emulator). Logged rather than silently dropped: if this recurs, the
next report should include exactly WHERE the stick landed (near the
relocated rack vs. out on the open court) and whether the rack itself
looked visually sunk/floating, not just the symptom — that's the
detail that would actually distinguish "real physics bug" from
"real-headset space/tracking quirk" from these two already-ruled-out
open-ground scenarios.

## 2026-08-31 — MP1 co-presence: first multiplayer implementation

Erik has 2 physical Meta Quests and asked for a report on how to add
a second player, then — after reviewing docs/PLAN.md §10-12's existing
(pre-session) multiplayer research — said to go ahead and start
implementing, working autonomously overnight for him to test the next
day. Scoped to the plan's own **MP1 (co-presence)** tier: shared
presence only, no shared match state (that's MP2).

**Stack, matching the plan's pre-approved choice exactly**: Trystero
v0.25.4 installed (plan named v0.25.3; a newer patch, no API
difference found via context7's current docs). Default import
(`trystero`) uses the Nostr signaling strategy, matching the plan's
"Nostr relays by default" — confirmed via context7, not assumed.
`joinRoom`/`room.makeAction` are synchronous/typed as documented;
`DataPayload` accepts plain JSON-shaped objects directly, no manual
serialization needed.

**Architecture, following the functional-core/imperative-shell split**:

- `core/presence.ts` (pure, zod, TDD — 9 tests): the wire format for
  one player's presence (head + both hands, each a
  position+quaternion pose), version-stamped. `parsePresenceMessage`
  never throws — a peer sending a mismatched version or malformed
  shape is silently dropped, treating the network as the untrusted
  boundary it is (CLAUDE.md's own rule, applied to a genuinely new
  kind of boundary this project hasn't had before: another player's
  browser, not just localStorage/URL params).
- `systems/multiplayer.ts` (adapter): joins a room on init (`?room=`
  URL param, default `kubborama-lobby` — chosen so two headsets
  opening the same plain deployed URL land in the same room with zero
  manual setup, good enough for a first test between exactly 2 known
  devices; a real friend-link room UI is later, per the plan).
  Broadcasts local head/`gripSpaces` transforms at ~20 Hz (config's
  `sendIntervalS`, matching the plan's presence-sync rate) — throttled
  inside `update()` via an accumulator, and the outgoing pose/message
  objects are allocated once and mutated in place every send rather
  than rebuilt (`never allocate in update()`, CLAUDE.md's own rule,
  applied even though this is a ~20 Hz path, not a 90 Hz one).
- `peer-avatar.scene-asset.ts` + `avatarMaterial`: a deliberately
  minimal placeholder — 3 spheres (head + 2 hands), matching the
  plan's own avatar design principle ("replicate only what is
  tracked... NO legs and NO IK"). Real character avatars are a later
  MP1 step per the plan (Quaternius packs), not attempted here — the
  goal tonight was proving the transport and rendering path work, not
  art.

**A real, undecided design gap, called out rather than guessed at**:
both players' own tracked origin is world `(0,0,0)` by default (no
authored `player.transform`), so a remote peer's raw broadcast
position would land exactly on top of the local player's own body.
Added a fixed `remoteOffset` (`data/multiplayer.json`, currently
`[3,0,0]`) shifting every incoming pose sideways purely so the two are
visibly distinct for this first test. This is NOT "each player at
their own baseline" — that needs an actual design decision (which
baseline is whose, how it's assigned per room) that only Erik can
make, and guessing one autonomously overnight felt like exactly the
kind of open design call CLAUDE.md's workflow reserves for him. Logged
here rather than silently picked.

**What's verified, and what explicitly isn't**: full mechanical pass
green (170 tests, tsc/eslint/prettier, build, smoke — bundle grew
~67KB gzipped for Trystero). Live-verified single-client in the
emulator: the room join succeeds, `[net] joined multiplayer room`
logs with no errors, the ~20 Hz send loop ran for several seconds with
zero console errors, `ecs_list_systems` confirms `MultiplayerSystem`
registered and unpaused. **What could NOT be verified with the tools
available**: actual 2-peer connection and sync — the MCP toolset
drives exactly one managed browser tab, so there's no way to spin up
a genuine second WebRTC peer locally. This needs Erik's 2 real
headsets, which is the whole reason this feature exists right now —
recommend he opens the deployed URL on both, no query param needed
(both default into the same room), and confirms he can see the other
device's head/hands moving.

**Also unfinished from the plan's MP1 scope, deliberately cut for a
first pass, not forgotten**: voice chat (Trystero's `addStream` is
built for this, straightforward to add once presence itself is
confirmed working), any room/lobby UI beyond the URL param, and of
course all of MP2/MP3 (shared match state, turn authority, the rules
engine over the network).

## 2026-09-01 — ground-collider misreading, NOT a bug (pushed back, didn't "fix")

Erik, after looking at the scene editor: "ground-collider ligger under
ground... ändra så de ligger på samma höjd" (ground-collider sits
below ground, make them the same height) — reasoning from seeing
`ground` at `position.y: 0` and `ground-collider` at `position.y:
-0.5` in the JSON and concluding they don't match.

**They do match — didn't touch it, would have reintroduced a real,
already-fixed bug if I had.** `ground-collider`'s `PhysicsShape` is a
`Box` with `dimensions: [30, 1, 30]` — per the physics skill reference,
Box dimensions are full width/height/depth, not half-extents, and a
node's `position` is that box's CENTER. A 1m-tall box centered at
`y=-0.5` spans from `y=-1` to `y=0` — its TOP face is exactly at `y=0`,
matching the visual `ground` plane exactly. This asymmetry (thick slab
centered below zero, top surface at zero) is deliberate, not an
oversight: it's the exact fix from 2026-08-28's "floating ground" bug
(docs/DECISIONS.md, M5 real-headset feedback), which Erik confirmed
fixed on his actual Quest 2 at the time. Moving the collider's position
to `y=0` as literally requested would put the box's center there
instead, so it would span `y=-0.5` to `y=0.5` — objects would rest
0.5m ABOVE the visible ground, reintroducing that exact bug.

Verified fresh rather than just asserting this from memory: re-read
the current JSON (unchanged since Aug 28), re-ran the physics-shape
dimension convention from `.claude/skills/iwsdk-physics/references/
component-reference.md`, and live-tested twice more in the emulator —
dropped a stick from height onto open court ground, it settled at
`y≈0.0219` both times (matches the stick's own radius exactly — a
cylinder lying on its side rests one radius above the contact plane,
confirmed against `stick.scene-asset.ts`'s un-offset, centered
geometry) and was immediately re-grabbable both times. Screenshot
confirmed the stick visually resting ON the grass, not sunk into it.

**What this probably actually is**: Erik is testing on 2 real Quest
headsets over consecutive nights; the most likely real explanations
are (a) a stale cached build on a Quest browser tab that never got a
hard refresh after a deploy, or (b) a genuine real-hardware space/
tracking quirk near the floor that the emulator's exact programmatic
grabs can't reproduce — not the collider math, which checks out twice
independently. If this recurs, the next report should include exactly
WHERE the stick landed and a screenshot from the headset, not just the
symptom.

## 2026-09-01 — MP1 remote player placement: far baseline, not a sideways offset

Erik's decision, resolving the "known limitation" flagged when MP1
first shipped: the other headset should spawn behind the far
baseline — the one you normally throw at — facing back toward you,
matching how a real 1v1 kubb match is actually laid out, rather than
an arbitrary sideways shift.

Added `core/presence.ts`'s `mirrorPoseToFarBaseline(pose, farZ)`: a
peer sends poses in its OWN local tracked space (origin `(0,0,0)`,
facing `-Z`, same convention as the local player). This rotates that
whole local space 180° around Y and translates it to the far
baseline — pure closed-form math, no `three.js` `Quaternion` needed:
composing a 180°-around-Y rotation with any quaternion `(x,y,z,w)`
reduces to exactly `(z,w,-x,-y)`, verified against the identity case
(a peer facing -Z, the default, mirrors to facing +Z — i.e. the 180°
rotation itself) and unit-length preservation for a non-trivial
rotation. 3 new tests (12 total in `presence.test.ts`).

`FAR_Z` is derived from the current default court preset
(`-getCourtPreset(defaultCourtPreset).lengthM`, currently `-6`),
matching the exact far-baseline Z the kubb/king row already use — not
a separately-hardcoded number. Removed the old `remoteOffset` field
from `data/multiplayer.json` entirely now that it's superseded, rather
than leaving dead config around.

Mechanical pass green (173 tests, tsc/eslint/prettier/build/smoke).
Live-verified the room still joins cleanly with no console errors
after the change; the actual mirrored placement itself still needs a
second real peer to see rendered (same limitation as the rest of MP1 —
noted, not re-litigated here).

## 2026-09-01 — MP1 voice chat, plus the real MP1/MP2 boundary explained

Erik ran the first real 2-headset test: confirmed seeing the other
player's head/hands moving correctly, but reported "we seem to be in
our own separate worlds" — the shared court state (kubbs, king,
sticks) isn't synced, only presence is. **This is exactly MP1's
scoped boundary, not a bug**: docs/PLAN.md §10 explicitly defines MP1
as "shared garden, avatars, voice, waving — no shared match yet (both
throw at their own pieces)"; syncing the actual game pieces is MP2,
and needs a real turn-based physics-authority handoff (who simulates
which piece, when authority changes hands) that the plan flags as its
own design problem — not something to improvise silently overnight.
Decided to build the other MP1-scoped item instead of guessing at
MP2's authority model: **voice chat**, explicitly listed in the plan's
MP1 scope and technically well-defined, unlike the open authority
question.

**Voice implementation**: Trystero's `addStream`/`onPeerStream`
(`getUserMedia({audio:true})` → `room.addStream()`), NOT IWSDK's own
`AudioSystem` — that system only plays pre-loaded clips through a
`private`, unexposed `AudioListener`, with no path for a live WebRTC
`MediaStream`. Deliberately NOT spatial/positional audio for this
pass — a plain hidden `<audio>` element per peer (global stereo, not
panned to the avatar). Real 3D voice needs its own `AudioListener`
wired to the camera, which is a reasonable follow-up but not required
to answer "can we hear each other," so cut to keep this pass's scope
honest rather than half-reimplementing part of IWSDK's audio
pipeline.

**Mute (plan's own "mute button mandatory")**: new `micMuted` setting,
**defaults to `true`** — broadcasting a live mic should be an opt-in
action, not the out-of-the-box state. Added via `z.boolean().default(true)`
rather than a bare `z.boolean()` specifically so a settings JSON
already saved to a player's `localStorage` before this field existed
still parses successfully (falls back to the default for the missing
key) instead of failing zod's whole-object validation and silently
resetting every other saved setting too — a real migration-safety
detail, not just a style choice (new test in `settings.test.ts` covers
exactly this). Wired into the existing reset-menu settings tab
("Mikrofon: På/Av", matching the haptics/court-lines toggle-button
pattern already there) — `MultiplayerSystem` checks
`settingsState.current.micMuted` every tick and sets the local mic
track's `.enabled` accordingly (no settings-changed subscription
exists to hook instead).

**Live-verified end to end in the emulator**, not just inspected:
microphone permission granted, `[net] microphone connected` logged
with no errors; opened the settings tab, confirmed the button reads
"Mikrofon: Av" by default (matching the new default-muted setting),
clicked it, watched the label flip to "Mikrofon: På" with no console
errors, clicked again to restore the default before reloading to a
clean state. Full mechanical pass green (174 tests, tsc/eslint/
prettier, build, smoke). What's NOT verified: actually hearing a
second real peer's voice — same "one browser tab" tooling limit as
the rest of MP1, needs Erik's 2 headsets.

## 2026-09-01 — MP2 phase 1: shared court state (king + kubbs)

Interviewed Erik (his own suggestion) on the open MP2 design questions
before building anything, per CLAUDE.md's "three alternatives" —
AskUserQuestion, 3 questions. Answers, more ambitious than the
recommended defaults on the first two:

1. Should the guest be able to grab/throw pieces too, or presence-only
   for now? **Both should be able to throw.**
2. Shared single set of pieces, or a real turn-based 1v1 match (each
   defending their own baseline)? **Real match, right away.**
3. Scoring: host-only, or figure it out later? **Host-only for now**
   (the one recommended option he picked).

Erik also supplied the authority rule himself, unprompted: **"först in
äger spelet"** — whichever peer joined the room first is authoritative
for the whole session (no per-turn handoff needed, much simpler than
kubb's real turn-by-turn authority).

**Full scope assessed before writing code**: "both throw + real match"
genuinely needs three separable pieces of work: (a) host/guest role
determination, (b) host-authoritative sync of the passive court state
(king/kubbs — never grabbed, only ever knocked over), and (c) relaying
a _grabbed and released_ stick through the host's physics (since once
kubbs are host-owned, a guest's local throw can't be authoritative —
their release has to become a network request the host applies to its
own copy of that stick), plus (d) turn enforcement and per-baseline
kubb ownership in the rules engine for a real match
(`SimpleRulesSystem`/`ToppleSystem` currently assume one practicing
player, not two competing sides). (a) and (b) are what actually got
built tonight — **phase 1**. (c) and (d) are real next phases, not
attempted here; guessing at a turn-based rules-engine rewrite
unsupervised, on top of an already-large session, was the wrong call
versus building the foundation correctly and stopping at a clean,
verifiable boundary.

**Phase 1 implementation**:

- `core/multiplayerAuthority.ts`'s `isHost()` (pure, 5 tests):
  implements "först in äger spelet" as a symmetric, deterministic
  comparison of each peer's local join timestamp (`Date.now()` at
  `MultiplayerSystem.init()`), with a peer-id tie-break for the
  same-millisecond case. No signaling server needed — both peers
  independently compute the same answer once they've exchanged a tiny
  one-time `hello` message (sent directly to a newly-joined peer via
  Trystero's `{target: peerId}` option, not the room broadcast, so a
  late joiner doesn't miss an earlier peer's announcement).
- `core/pieceSync.ts` (pure, zod, 7 tests): the host's authoritative
  snapshot format — `{id, position, quaternion}` per piece. Piece ids
  are exactly the scene node ids (`king`, `kubb-0`..`kubb-9`) — no new
  ID scheme invented.
- `systems/multiplayer.ts`: the host broadcasts all 11 piece
  transforms at the same ~20 Hz as presence, gated on having received
  `hello` from every _currently connected_ peer first (avoids a
  transient dual-broadcast race right after connecting, when both
  sides would otherwise tentatively believe they're alone/host before
  role information has propagated). The guest applies every incoming
  snapshot via `PhysicsSystem.setBodyTransform()` — the same API
  `MenuSystem`'s reset already uses — rather than switching those
  bodies to `PhysicsState.Kinematic`. The physics skill reference is
  explicit that changing a body's motion state at runtime needs
  "deliberate lifecycle handling" (remove and recreate the body with
  its shape config preserved), and doing that safely across 11 pieces
  wasn't worth the risk for a first pass when periodic snap-correction
  (small, bounded visual drift between the ~20 Hz network ticks while
  local gravity briefly nudges an otherwise-mirrored body) achieves
  the same "we both see the same kubbs" result far more simply.

**NOT this pass, on purpose**: sticks stay MP1-local (ungrabbed
guest-side interaction isn't networked yet — that's phase (c) above);
no turn enforcement or per-side kubb ownership yet (phase (d)); no
authority _handoff_ mid-session (matches "först in äger spelet"
literally — one host for the whole session, not per-turn).

**Live-verified in the emulator** (single client, so only the
non-networked half of this is directly observable): room joins
cleanly, all 11 `requireSceneEntity()` lookups succeed at init with no
throw, the king and kubbs remain in their normal resting positions and
`ecs_list_systems` shows `MultiplayerSystem` running unpaused with the
rest of the game (10 standing kubbs, no corrupted state) — confirms
the new broadcast loop doesn't disturb the host's own local
simulation. What could NOT be verified: an actual guest receiving and
applying a real snapshot (needs Erik's 2 headsets, same limitation as
the rest of MP1/MP2). Mechanical pass green (186 tests,
tsc/eslint/prettier, build, smoke).

## 2026-09-01 — MP2 phase 2: both players can throw

Continuing straight from phase 1 ("fortsätta bygg" — Erik wanted to
keep going without pausing for a headset test). Built the second of
the four separable pieces identified in the phase-1 entry: relaying a
guest's stick release through the host's physics, so a throw from
either player actually affects the shared kubbs.

**DRY cleanup done in passing**: `core/presence.ts` and
`core/pieceSync.ts` each defined an identical local `vec3Schema`/
`quaternionSchema`. Adding a third copy for this file would have been
the exact violation CLAUDE.md's "extract on second occurrence" rule
warns about — extracted both into `core/networkSchemas.ts` and
updated the two existing files to import from it instead of silently
letting a third near-duplicate slide by.

**Design, once the existing code was actually read (not assumed)**:
`ThrowingSystem.onRelease()` already emits a `Thrown` event on the
shared bus (`core/events.ts`, whose own doc comment literally lists
"network" among the bus's future subscribers) carrying everything
needed — `releasePosition`, `releaseVelocity`, `angularVelocity` — for
every throw, host or guest, no changes to `ThrowingSystem` required.
`systems/multiplayer.ts` just also subscribes: if I'm not the host, it
reads the stick's current orientation (safe — `Thrown` fires
synchronously, before physics steps again this frame) and relays the
full release state (`core/throwRelay.ts`, pure/zod/6 tests) to the
host. The host applies it to ITS copy of that stick using the
IDENTICAL two-call pattern `onRelease()` itself uses for a local throw
(`PhysicsSystem.setBodyTransform` then a one-shot `PhysicsManipulation`
component) — so `ImpactSystem`/`ToppleSystem`/scoring all react
exactly as if the host had thrown it, no special-casing needed
anywhere else in the game.

Sticks were also added to the existing pieces-broadcast list (now 17:
king + 10 kubbs + 6 sticks) so a thrown stick keeps converging toward
the host's authoritative trajectory after the initial relay — but a
piece the LOCAL player is actively holding (`Grabbed`) is skipped
during that correction, so a stale host snapshot never fights a
player's own hand-tracking mid-aim. The guest's own local stick keeps
flying on its own physics in parallel — untouched, free client-side
prediction — while the periodic broadcast reconciles it once released;
standard prediction+reconciliation netcode, not lockstep.

**Known limitation, documented not solved**: two players grabbing the
exact SAME physical stick at once is undefined (in practice host's
local grab wins, since only the host's grab has physics
consequences on the shared body) — an edge case with 6 sticks
available, not the common path, not worth solving for a first pass.

**Still NOT built**: turn enforcement or per-baseline kubb ownership.
Both players can currently throw at the SAME shared kubbs — real
co-op, not yet a scored 1v1 match. That's phase 3, unchanged from the
phase-1 assessment.

**Live-verified in the emulator**: grabbed and threw a stick locally
(solo session, so host) — full pipeline fired correctly end to end
(`[grab] stick grabbed` → `[physics] impact` → `[throw] release`,
`StickState` transitioned to `Flying` with `lastThrowerHand` set), zero
errors, and the guest-relay path correctly no-opped (no send, no
"applied relayed throw" log) since a solo session is always host. What
could NOT be verified: an actual guest's relay arriving and being
applied on a real host — needs Erik's 2 headsets, same limitation as
the rest of MP1/MP2. Mechanical pass green (192 tests,
tsc/eslint/prettier, build, smoke).

## 2026-09-01 — MP2 phase 3: a real winner (with an honest cut)

Continuing straight from phase 2 (Erik: "fortsätt"). This is the
"riktig match, varsin sida" (real match, each own side) half of his
original interview answer.

**Scope decision made before writing code, not guessed at mid-build**:
real kubb's win move is felling the king, but `KingProtected`
(`SimpleRulesSystem`) is a GLOBAL rule — all 10 kubbs across both
baselines, no notion of "which side is attacking." Reworking that into
a genuine per-side protection model is separate, careful rules-engine
work, not something to improvise on top of the whole multiplayer stack
in one more pass. **Phase 3 v1's win condition is "clear the
opponent's kubbs first," full stop — no king-felling win yet.** This
is a documented, deliberate cut, not a silently-missing feature; noted
in three places (`core/match.ts`'s doc comment, `systems/
multiplayer.ts`'s class doc, this entry) so it can't be mistaken for
an oversight later.

**Side assignment needed zero new state**: `computeCourtLayout()`
already lays kubb-0..4 as the far baseline and kubb-5..9 as the near
baseline, and phase 1's `mirrorPoseToFarBaseline()` already places the
guest at the far baseline. So `core/match.ts`'s `kubbSide()` is pure
arithmetic on the existing scene ids — guest defends kubb-0..4, host
defends kubb-5..9 — no kubb repositioning, no new scene authoring.

**Implementation**: `core/match.ts` (pure, 11 tests) is the whole state
machine — `MatchState` (per-side kubb counts, whose turn, winner),
`withKubbFelled`/`withTurnAdvanced`, both no-ops once a winner exists
or a side is already at zero (defensive, no double-count).
`core/matchSync.ts` (zod, 6 tests) is the wire format, deliberately
event-driven rather than the ~20 Hz physics-sync cadence — match state
changes rarely. Wired into `systems/multiplayer.ts` (not a separate
system — it already owns the host/guest determination and the Room
instance every message type needs, and splitting that access across
systems would mean exposing more of its internals than the coupling is
worth) by subscribing to the EXISTING `KubbFelled`/`RoundEnded`/`Reset`
events `SimpleRulesSystem`/`RoundSystem`/`MenuSystem` already emit —
none of those three systems needed a single change. Only the host
computes transitions; the guest just applies whatever the host
broadcasts, same authority model as phases 1-2.

**NOT enforced: whose turn it is.** `MatchState.currentTurn` is
genuinely tracked and synced, but nothing stops the off-turn player
from grabbing a stick — real enforcement means gating
`OneHandGrabbable` per-player, the same class of runtime-component
surgery flagged as too risky back in phase 1's Kinematic-vs-
snap-correction decision. Honor system for v1, same as two friends
taking turns at a real court. Also no UI yet for turn/score — visible
only via `[state]`-channel logs for now; a HUD update is a real,
separate follow-up, not attempted in this pass given the size of what
already shipped tonight.

**Live-verified with a REAL topple, not a synthetic state write**:
first tried setting a kubb's `Transform.orientation` directly via
`ecs_set_component` to fake a topple — Havok silently overwrote it on
the very next physics step, confirming (again) the physics skill
reference's warning that a dynamic body's transform must go through
the live physics system, never written directly. Fell back to an
actual physical stick sweep (grabbed, swept fast through a host-side
kubb, released) — `[state] kubb felled {entityIndex: 31}` fired for
real, `SimpleRulesSystem`'s sin-bin move happened exactly as before
(unaffected — confirms this phase didn't regress solo play), and the
new `KubbFelled` subscriber ran with zero errors. Also fired `Reset`
via the real "Ny runda" button and confirmed `[state] reset` processed
cleanly with no exceptions. Mechanical pass green (209 tests,
tsc/eslint/prettier, build, smoke). What's still unverified: an actual
match-winning sequence (all 5 of one side down) and 2-peer match-sync
— both need either more emulator time or Erik's 2 headsets.

**Unrelated but real finding, worth flagging**: during this test, a
genuine unknown peer connected to and disconnected from the room
(`[net] peer joined/left` with unfamiliar ids) — Trystero's Nostr
signaling is public infrastructure, and `kubborama-lobby` is a fixed,
undifferentiated default room name (MP1's own decision, made for
zero-setup testing between exactly 2 known devices). This is a real,
observed privacy detail, not hypothetical: anyone else testing this
exact deployed URL right now lands in the same room. Low practical
risk today (no private data beyond voice/avatar position, and this is
still pre-release), but worth remembering before this ships more
broadly — a real per-session room code is a legitimate follow-up, not
just theoretical hardening.

## 2026-09-01 — HUD shows turn/match status (was log-only)

Continuing straight from phase 3 (Erik: "fortsätt"). Phase 3 left match
state genuinely tracked and synced but invisible outside console
logs — picked this over the harder "real king-win" cut since a match
neither player can see the status of isn't usable for an actual
2-headset test.

New `MatchStateChanged` game event (`core/events.ts`) carries both the
`MatchState` and `mySide` (which side the LOCAL player is on) — so
`HudSystem` never needs a reference to `MultiplayerSystem` to ask "am
I host," matching this project's one-event-bus rule instead of adding
new cross-system coupling. `systems/multiplayer.ts` gained one
mutation point, `setMatchState()`, that every match-state change now
goes through — replacing four separate direct `this.matchState = ...`
assignments — and only emits the event once `hasMultiplayerPeer()` is
true, so solo play NEVER shows match/turn UI (the existing single-
player HUD is completely unaffected).

`hud.uikitml` gained one new row (`match-row`), hidden by default,
matching the panel's existing row pattern exactly. Shows "Din tur" /
"Motst. tur" while the match is open, "Du vann!" / "Du förlorade" once
`state.winner` is set. New i18n keys in both `sv.json`/`en.json`.

**Live-verified**: reloaded, confirmed zero UIKitML parser errors for
the new markup, and confirmed via screenshot that the HUD looks
IDENTICAL to before (Runda/Fallna/Rekord/Stil, no fifth row) in solo
play — the gating works. **What could NOT be verified**: the row
actually appearing and showing the right text once a peer connects —
that requires a real second client sending presence long enough for
`hasMultiplayerPeer()` to go true, which the single-browser-tab
tooling can't produce. Needs Erik's 2 headsets, same limitation as the
rest of MP1/MP2. Mechanical pass green (209 tests — no new tests this
pass; this is UI/event-wiring, consistent with CLAUDE.md's "adapters
covered by ... emulator MCP checks instead" for this class of change),
tsc/eslint/prettier, build, smoke.

## 2026-09-02 — Room privacy: keep the shared default (Erik's decision, no code change)

Asked Erik directly (not guessed) about the fixed `kubborama-lobby`
room-name gap flagged in phase 3's entry: keep the zero-setup shared
default, or switch to a per-session random code shared via URL
(private, but requires an extra copy-link step every session)?
**Decision: keep the current zero-setup default.** Low practical risk
while the app has few users, and losing the "just open the same URL on
both headsets" convenience wasn't worth it yet. No code changed. Worth
revisiting once/if this ships more broadly — logged here so the
tradeoff and the reasoning aren't lost, not because anything needs
fixing right now.

## 2026-09-02 — MP2 phase 4: the guest's own body, and a second table

Erik's own analysis, not a live test report: phase 1's
`mirrorPoseToFarBaseline()` only ever moved the OTHER player's AVATAR
— as rendered for the peer watching it. The guest's own physical
presence stayed at world `(0,0,0)`, exactly like solo play, so a real
guest would be standing on top of the host and reaching for the HOST's
stick rack. Erik: "andra spelaren skall bli förflyttad till andra
baslinjen med ett eget pinnbord. Pinnarna spawnar när ens tur är."

**Two fixes, both reusing the SAME transform** (`mirrorPoseToFarBaseline`)
instead of three separately-derived pieces of geometry:

1. `maybeRepositionAsGuest()` moves the guest's own XR rig
   (`this.player`, the `XROrigin` Group everything else — head, both
   grip spaces — is parented under) to the far baseline, once, as soon
   as role is known (gated on `rolesResolved()`, a small refactor split
   out of `isHostNow()` so this and the existing role check share the
   same "have I heard from every connected peer" test rather than
   duplicating it). Called from the `hello` handler, since that's
   exactly when role status can change. Reuses
   `mirrorPoseToFarBaseline(defaultPose(), FAR_Z)` rather than
   hardcoding the target transform a second time.

   **This made `applyPoseToPart()`'s own mirroring dead code, and it
   was removed**: once the guest's rig is physically at the far
   baseline, `getWorldPosition()` on their own head/hands already
   returns correct shared-world coordinates — mirroring a SECOND time
   on receipt would have doubled the transform. Both peers now send
   already-world-correct presence; the receiver just applies it as-is.
   A real "should have been done differently from the start" moment,
   not additive — phase 1's mirroring was solving the SYMPTOM (the
   other player's avatar looks wrong) rather than the actual problem
   (the guest's own presence was never actually moved).

2. A second physical rack, `stick-rack-2`/`stick-rack-2-collider`
   (scene JSON), at the far baseline — the exact mirror of the
   near rack's own already-authored transform, computed with the SAME
   function (verified by hand: a 180°-rotated symmetric plank+2-legs
   prop mirrors to a visually-identical footprint at 0° rotation,
   since the geometry itself is left-right symmetric — confirmed via
   `scene_screenshot` before writing any code). `moveSticksToFarRack()`
   runs in `onRoundEndedForMatch()` only when the new turn is
   `'guest'`: `MenuSystem`'s own `RoundEnded` handler already reset
   every stick to its authored NEAR-rack home pose by the time this
   runs (registered — so subscribed — before `MultiplayerSystem`, see
   `src/index.ts`), so this just mirrors each stick's now-current pose
   to place it at the far rack instead of maintaining a second
   hardcoded layout. Turning turn back to `'host'` needs no
   corresponding call — the next reset already puts sticks back at the
   near rack.

**A pleasant side effect, not a separate feature**: this gives real
turn "enforcement" for free. The off-turn player's sticks are
physically at the OTHER table, out of reach — no risky
`OneHandGrabbable` runtime surgery needed, the honor-system caveat from
phase 3 is now moot for the common case (a player simply can't reach
sticks that aren't there).

**Live-verified**: `scene_screenshot` confirmed the new rack renders
correctly at the far baseline before any code was written. After the
code changes: reloaded, zero console errors, both `Pinnstall`/
`Pinnstall 2` scene entities resolve with their expected components,
the player's own headset transform stays at the untouched default
spawn `(0, 1.6, 0)` in solo play (host is never repositioned — correct
by construction, `isHostNow()` short-circuits `maybeRepositionAsGuest`),
and a normal local grab→release still fires cleanly with no errors.
**What could NOT be verified**: the guest's own reposition actually
happening, and sticks actually appearing at the far table on a real
guest's turn — both need a genuine second peer, same limitation as the
rest of MP1/MP2. Mechanical pass green (209 tests — no new pure-logic
tests this pass; this reuses `mirrorPoseToFarBaseline`, already
covered, rather than introducing new pure logic), tsc/eslint/prettier,
build, smoke.

## 2026-09-02 — GATE PASSED: MP1/MP2 confirmed live with 2 real headsets

Erik: "kan bekräfta att de fungerar bra med 2 spelare" — the first
genuine, positive end-to-end validation of everything built this
session (co-presence, voice, shared court sync, throw relay, per-side
match state, guest reposition, second stick rack). Two real findings
came out of the same test, both addressed in the entries below:

1. The HUD's relative "din tur"/"motståndarens tur" read as ambiguous
   standing next to a real second player — wants absolute "Spelare
   A"/"Spelare B" labels instead.
2. A stick that kept rolling around after the last throw of a turn
   never let the turn pass to the other player.

## 2026-09-02 — Independent code review surfaces 3 Critical multiplayer bugs

Per `superpowers:requesting-code-review`, dispatched a fresh
`general-purpose` subagent (no session history) over the full
`63da6bb..18f56ca` diff — the entire MP1/MP2 feature — before trusting
it further, especially since none of it had been tested with 2 real
peers until the entry above. It verified tsc/eslint/prettier/vitest
clean independently, confirmed the functional-core purity and DRY
extraction claims by grep rather than trusting the commit messages, and
hand-verified `mirrorPoseToFarBaseline()`'s geometry for both phase-4
call sites against the actual authored scene JSON transforms. Full
review kept for reference; summarizing the 3 Critical findings and
fixes here since they change committed behavior:

**1. RoundEnded's own nested Reset was wiping MatchState every round.**
`MenuSystem.resetAll()` (`src/systems/menu.ts`) is called BOTH by the
manual reset button AND by `RoundSystem`'s `RoundEnded` auto-
continuation into the next round, and in both cases emits a plain
`Reset` event synchronously. Because `MenuSystem` is registered (so
subscribed) before `MultiplayerSystem` in `src/index.ts`, and
`EventBus.emit` runs the same event's handlers in subscription order,
the actual sequence on every round-end was:

1. `RoundEnded` fires.
2. `MenuSystem`'s `RoundEnded` handler runs `resetAll()`, which emits a
   NESTED `Reset` — fully synchronous, inside step 1's own dispatch.
3. That nested `Reset` reaches `MultiplayerSystem.onResetForMatch()`,
   which (before this fix) unconditionally called
   `setMatchState(initialMatchState())` — wiping kubb counts, turn, and
   winner back to fresh.
4. Only THEN does the outer `RoundEnded` dispatch reach
   `MultiplayerSystem`'s own `RoundEnded` handler
   (`onRoundEndedForMatch()`), which computes `withTurnAdvanced(this.
matchState)` — but `this.matchState` was just wiped in step 3.

The reviewer reproduced this standalone with the project's real
`EventBus`/`core/match.ts` logic: a match with `guestKubbsRemaining: 3`
had it reset to 5 on the very next round-end, and turn order collapsed
permanently. This is completely invisible to everything tested before
the GATE above — `match.test.ts` only exercises the pure functions in
isolation, and every live emulator check was single-throw/solo (match
logic is gated off entirely without a peer). A real match spanning more
than one round of 6 sticks (i.e. essentially every real match, since a
full game is 10 kubbs but only 6 sticks/round) hits this on the very
first round transition.

**Fix**: gave the `Reset` event payload a `cause: 'manual' | 'roundEnd'`
discriminator (`src/core/events.ts`). `MenuSystem.resetAll(cause)` now
takes and forwards it — the reset button and `applyCourtLayout()`
(mode-switch relayout) pass `'manual'`, `RoundSystem`'s own
auto-continuation passes `'roundEnd'`.
`MultiplayerSystem.onResetForMatch(cause)` only wipes MatchState when
`cause === 'manual'`, leaving `onRoundEndedForMatch()`'s turn-advance
computation untouched by the nested emission. No test existed for the
cross-system event ordering itself (the reviewer's own Important
finding #7) — logged as a follow-up (gh issue below), since a proper
regression test needs simulating two consecutive `RoundEnded` cycles
through the real event bus, not just `core/match.ts`'s pure functions.

**2. `hello` (host election) had no schema — spoofable.**
Every other network message type (`presence`/`pieceSync`/`throwRelay`/
`matchSync`) goes through a `parseXMessage` zod boundary per CLAUDE.md's
untrusted-boundary rule; `hello` alone trusted `data.joinedAtMs`
verbatim, falling back to `?? 0` when absent. Since host election picks
whoever reports the SMALLEST timestamp, any peer sending `{}` or
`{joinedAtMs: 0}` would be concluded to be host by every other client —
freezing the real host's `pieceSync` broadcasts. Not hypothetical: a
genuine unknown peer already connected to the shared default room once
during MP2 phase 3 testing (see that entry above).

**Fix**: `core/multiplayerAuthority.ts` gained `HelloMessage`
(`z.object({ joinedAtMs: z.number() })`), `buildHelloMessage()`, and
`parseHelloMessage()` (never throws, same pattern as every other
message type) — 4 new tests. `MultiplayerSystem`'s `helloAction.
onMessage` now drops a malformed hello instead of applying it.

**3. `pieceSync` was applied from ANY sender, not just the trusted host.**
Unlike `throwRelayAction` (gates on `isHostNow()`) and `matchSyncAction`
(gates on `!isHostNow()`), `pieceSyncAction.onMessage` called
`applyPieceSync()` unconditionally regardless of who sent it. Combined
with #2, or even alone (a second/buggy/malicious peer broadcasting on
the same action), every client including the real host would apply an
arbitrary peer's snapshot, teleporting the king/kubbs/sticks anywhere.

**Fix**: `core/multiplayerAuthority.ts`'s `isHost()` is now expressed in
terms of a new `resolveHostId(self, peers): string` (DRY — both
functions share one election rule; `resolveHostId` additionally names
WHICH id won, which `isHost()` alone can't answer) — 3 new tests.
`MultiplayerSystem` gained `resolvedHostPeerId()`, and
`pieceSyncAction.onMessage` now checks the sender's `peerId` against it
before applying anything.

**Deferred, not fixed inline** (reviewer's Important/Minor findings #4-
9 — role-resolution race dropping a guest's first throw, HUD match-row
never clearing on peer disconnect, a peer-avatar creation TOCTOU, the
ordering-dependency test gap already mentioned in #1's fix, a captured-
home-pose alternative to `moveSticksToFarRack()`'s ordering dependency,
and a haptic misattribution on a relayed throw): none of these block a
real match — the reviewer's own assessment was "fix Critical/#2/#3 now,
#4-9 can reasonably follow after a first successful 2-headset session,"
and that session already happened (GATE above). Filed as GitHub issues
per CLAUDE.md's out-of-scope workflow rather than expanding this pass's
scope further.

Mechanical pass green: tsc/eslint/prettier/vitest (216 tests, +7 from
this pass), build, smoke. Live-verified in the emulator: solo play
loads cleanly with zero console errors, HUD match-row correctly stays
hidden (no peer). The 3 fixes themselves are network-boundary/ordering
logic that fundamentally needs a second real peer to exercise — Erik's
next 2-headset session is the real verification.

## 2026-09-02 — Stick force-settle timeout (turn-blocking bug)

Erik, live-tested with 2 real players: "När man kastat sista pinnen,
vänta max i 5 sekunder efter den har kastas. Vissa pinnar rullar runt
på scenen och då verkar den inte förstå att turen skall gå över till
andra spelaren." Root cause: `RoundSystem.maybeEndRound()`
(`src/systems/round.ts`) only fires once every stick individually
reaches `StickPhase.Settled`, which `ThrowingSystem.checkForSettling()`
only grants after a stick has been continuously at rest (`isResting()`,
both linear and angular speed below threshold) for
`pieces.throw.restDurationS` (0.5s). A stick that keeps rolling —
apparently common enough on a real physical throw, not just a
theoretical edge case — never satisfies that and blocks `RoundEnded`
forever, which in multiplayer also means the turn never advances.

**Fix**: new `pieces.throw.maxFlightTimeS` (5s, Erik's own proposed
number) + a per-entity `flyingStartS` timer
(`src/systems/throwing.ts`), set in `onRelease()`. `checkForSettling()`
now force-settles a stick once it's been Flying that long, regardless
of its actual physics rest state — safe because the imminent round-end
reset (`MenuSystem.resetOne()`) teleports every stick back to its rack
and clears velocity anyway, so there's no risk of a "phantom moving
stick" surviving the forced settle. Same established pattern as
`OneShotAudioSystem`'s existing `MAX_LIFETIME_S` fallback elsewhere in
this codebase — not a new idiom. A force-settled stick logs a `warn`
(distinct from the normal `debug` "stick settled" log) so a future
session can tell how often this actually triggers.

Mechanical pass green: tsc/eslint/prettier/vitest (209 tests, no new
pure-logic tests — this is adapter-level timing logic, not core; golden-
throw/emulator coverage per CLAUDE.md's testing rule for adapters),
build, smoke. Not independently live-verified with an actually-
never-settling stick (hard to trigger deterministically without a real
rolling throw) — normal settling behavior confirmed unaffected.

## 2026-09-02 — Absolute turn labels in the HUD

Erik, same 2-headset test: "istället för att de står din eller mot. tur
så skriv att de är spelar A eller spelar Bs tur." The HUD's `match-row`
(`src/systems/hud.ts`) now shows "Spelare A:s tur"/"Spelare B:s tur" —
host is always Player A, guest always Player B, matching the existing
"först in äger spelet" host-election rule — instead of relative "Din
tur"/"Motst. tur", which read as ambiguous standing next to a real
second player rather than playing solo against an abstract opponent.
`matchWon`/`matchLost` stay relative (still about the local viewer's
own outcome, unambiguous either way). i18n keys renamed in both
`sv.json`/`en.json` (`matchYourTurn`/`matchOpponentTurn` →
`matchPlayerATurn`/`matchPlayerBTurn`); no other call sites referenced
the old keys. Mechanical pass green (216 tests), build, smoke.
Live-verified: solo play's HUD renders identically (match-row still
correctly hidden with no peer) — the actual "Spelare A/B" text with a
real opponent connected needs Erik's 2 headsets.

## 2026-09-02 — "Ingen är Spelare A": missing initial match-state announcement

Erik, second 2-headset test: "båda spelarna verkar bli spelare B. Ingen
är spelare A" — proposing device-id registration to prevent role
mix-ups. Investigated the role election first rather than building
that: **the election itself cannot produce this symptom.** Both peers
compare the exact same two `(id, joinedAtMs)` pairs (each side's own
stamp plus the one received via `hello`), so they always agree on who
won — clock skew between headsets doesn't matter since the comparison
never mixes a clock against itself. "Both think they're guest" is
impossible by construction.

The actual root cause is a visibility bug: match state was only ever
emitted/broadcast REACTIVELY on its first mutation. `setMatchState()`
(which emits `MatchStateChanged`, the only thing that reveals the HUD
match-row) and `broadcastMatchState()` were only called from the
host-gated `KubbFelled`/`RoundEnded`/`Reset` handlers — and the
earliest of those in a normal match is round 1's own `RoundEnded`,
whose `withTurnAdvanced()` flips `currentTurn` from the initial
`'host'` to `'guest'`. So on BOTH clients the match-row stayed hidden
through the host's entire first turn, and the first label anyone ever
saw was "Spelare B:s tur." Nobody ever saw "Spelare A:s tur" — reading
exactly like a role mix-up without being one.

**Two fixes:**

1. `announceMatchStartIfHost()` (`src/systems/multiplayer.ts`): as soon
   as roles resolve (called from the `hello` handler, the moment role
   knowledge can change — same hook as `maybeRepositionAsGuest()`), the
   host emits its current match state locally AND broadcasts it, so
   both HUDs show the match — and that it's Player A's turn — from the
   start. Re-runs harmlessly on every hello (idempotent), which also
   refreshes a re-joining guest.
2. A new always-visible-once-connected "Du är: Spelare A/B" HUD row
   (`role-row`, `public/ui/hud.uikitml` + `src/systems/hud.ts` +
   `roleLabel`/`rolePlayerA`/`rolePlayerB` i18n keys) — each player's
   own fixed identity for the whole match, distinct from the turn
   indicator. This addresses the "förväxling" concern directly: even if
   a future bug confuses turn state again, each player can always see
   which player they ARE.

**Deliberately NOT built (yet)**: Erik's proposed explicit device-id
registration at room start. The election is deterministic and sound
(see above), so registering identities would add a pairing/UX flow
without fixing anything this diagnosis explains. If the next 2-headset
test still shows role confusion WITH the fixes above, that conclusion
is wrong and device-id registration (or an explicit host-creates-room
flow) becomes the right next step — revisit then.

Mechanical pass green (216 tests), build, smoke. Live-verified in the
emulator: HUD renders correctly in solo with both new rows correctly
hidden, zero console errors. The actual announce-on-connect behavior
needs the next 2-headset session.

## 2026-09-02 — Second review round: force-settle gap on relayed throws + matchSync authentication

A second independent review (same `superpowers:requesting-code-review`
flow, range `18f56ca..fdebf92`) verified all four earlier fixes correct
by hand-tracing — including confirming the "ingen är Spelare A"
diagnosis complete (no other code path produces that symptom) — and
found one new Critical plus two Important issues, all fixed:

**Critical — the force-settle timeout didn't cover relayed throws.**
`flyingStartS` was only stamped in `ThrowingSystem.onRelease()`, but a
guest's relayed throw enters Flying via
`MultiplayerSystem.applyThrowRelay()` without going through onRelease —
so on the HOST (the client whose settled count actually gates the turn
advance) a guest's never-resting stick had no timer and could still
block the turn forever: the exact live bug the timeout was built for,
silently unfixed for half the turns. Worse, a STALE entry (host threw
stick-N last turn, round-end reset set phase Racked without clearing
ThrowingSystem's maps) would make a later relayed re-throw of stick-N
force-settle INSTANTLY. Fix: stamp on ENTRY into the Flying phase via
`queries.flyingSticks.subscribe('qualify', ...)` and clean both timer
maps on `'disqualify'` — one mechanism covers both throw paths AND
removes the stale-entry hazard (a mid-flight reset leaves Flying and
drops its timer). Live-verified in the emulator: a normal local
grab→throw still settles via the natural rest path (phase SETTLED, no
force-settle warn).

**Important — `matchSync` had the same sender-authentication gap
`pieceSync` had**: any peer in the public lobby could set the guest's
match state, including `winner`. Now gated on
`peerId === resolvedHostPeerId()` — which also subsumes the old
"host ignores incoming matchSync" check (a host resolves null, so no
sender matches). Subtlety: the host's initial announce races its own
hello to the guest, and gating alone would silently DROP the announce
when matchSync wins that race — regressing the fix above. So an
unverifiable-yet message is BUFFERED (`pendingMatchSync`) and retried
from the hello handler once roles resolve.

**Important — the hello-zod comment overclaimed.** Schema validation
closes the accidental/malformed path (`{}` defaulting to 0), but a
deliberately hostile peer can still send any small positive integer
and win the election — no schema makes a self-reported timestamp
trustworthy. Schema tightened to `.int().positive()` (rejects the
literal `{joinedAtMs: 0}` spoof and nonsense values) and the comment
rewritten to state the honest limit + the accepted threat model (a
hostile peer in the public lobby can grief a session, nothing
persistent; the real mitigation is a private room code — see the
room-privacy entry above).

Minor findings: the new role-row inherits gh#10's "never clears on
peer disconnect" (noted on that issue rather than filed new);
`resolvedHostPeerId()`/`isHostNow()` allocate small arrays per call at
~20 Hz — within the letter of the no-per-frame-allocation rule, left
as-is until it shows up in a perf pass.

Mechanical pass green (217 tests, +1), build, smoke, CI.

## 2026-09-03 — Closed remaining deferred review findings (gh#9-#14)

Worked through the six Important/Minor findings deferred from the two
prior code reviews while Erik was AFK, since they were all well-scoped
enough to fix without a live 2-headset session. All closed:

- **gh#14** (haptic misattribution): `ThrowRelayMessage` gained a
  `hand: 'left' | 'right'` field; `applyThrowRelay()` now sets
  `StickState.lastThrowerHand` from it, matching what a local throw
  already does.
- **gh#11** (peer-avatar TOCTOU): a synchronous `peerAvatarsInFlight`
  Set, checked/set BEFORE the `instantiate()` await, closes the window
  where two presence messages arriving before the first instantiate
  resolved could each pass the old (post-await-only) guard and leak a
  duplicate entity.
- **gh#13** (moveSticksToFarRack ordering dependency): each stick's
  near-rack home pose is now captured ONCE in `init()` — reading the
  authored transform before anything can move it — instead of reading
  the CURRENT pose and assuming MenuSystem's reset already ran first.
  Removes the src/index.ts registration-order dependency entirely; this
  also incidentally makes the `Reset`-cause fix (2026-09-02) fully
  order-independent too, since nothing MultiplayerSystem does for a
  round-end any longer relies on what MenuSystem did first.
- **gh#10** (HUD rows never clear on disconnect): new
  `MultiplayerPeerDisconnected` event, emitted once the room's peer
  count reaches zero (not on every leave in a hypothetical 3+ peer
  room). `HudSystem` hides `match-row`/`role-row` on it.
  `MultiplayerSystem` also resets its own `matchState` and
  `hasRepositionedAsGuest` flag at the same point, so a later rejoin
  starts clean rather than carrying stale state forward.
- **gh#9** (guest's first throw dropped during role-resolution race):
  `throwRelayAction`'s handler now buffers a single pending message
  (`pendingThrowRelay`) when roles aren't resolved yet instead of
  dropping it, and retries from the `hello` handler once they are —
  same pattern as the existing `pendingMatchSync` buffer.
- **gh#12** (missing regression test for the RoundEnded ordering
  contract): downgraded rather than closed with a test. The gh#13 fix
  above removes the last real ordering dependency this issue was about
  — `moveSticksToFarRack()` no longer needs MenuSystem to have run
  first, and the `Reset`-cause guard (2026-09-02) already made
  `onResetForMatch`/`onRoundEndedForMatch` correct regardless of
  handler registration order (traced by hand: flipping the two
  systems' registration order in `src/index.ts` no longer changes the
  outcome, since `onResetForMatch` no-ops on `cause: 'roundEnd'`
  independent of when it runs relative to the turn advance). A proper
  integration test through the real ECS/EventBus is still a legitimate
  future addition but no longer protects against an active bug — left
  open as tech-debt, not fixed with a test this pass.

Mechanical pass green: tsc/eslint/prettier/vitest (218 tests, +1 for
the new `hand` field's rejection case), build, smoke. Live-verified in
the emulator: a normal local grab→throw still settles via the natural
rest path with no regression from the qualify-subscription change,
zero console errors. Unplanned bonus verification: a genuine unknown
peer was connected to the shared default lobby room during this
session (the known, already-accepted room-privacy tradeoff) — the
solo-play screenshot check instead showed a REAL live confirmation of
the 2026-09-02 announce-on-connect and role-row fixes working
end-to-end ("Match: Spelare A:s tur", "Du är: Spelare B", correctly
reflecting this client being the later-joining guest).

## 2026-09-03 — M6: PWA packaging (autonomous, per pre-approved kickoff)

Erik asked (AFK) whether there was more M/MP work to do; `docs/
sessions/M6.md`'s kickoff was already pre-approved ("vite-plugin-pwa
(pre-approved)"), so built it directly rather than waiting.

`vite-plugin-pwa` (v1.3.0, matching docs/PLAN.md §12's earlier note)
generates the web manifest and service worker at build time —
`registerType: 'autoUpdate'` so a deploy is picked up on next launch
automatically, never leaving a player stuck on a stale cached build (a
real risk for a solo dev pushing frequently, per the kickoff's "never
cache-bust the deploy flow" instruction).

**Manifest**: `start_url`/`scope` set to `'./'`, not `'/'` — matching
`vite.config.ts`'s own `base: './'` convention that's been load-bearing
since M0 for the app to work under GitHub Pages' `/kubborama/` subpath
at all. An absolute `'/'` scope would have silently broken installation
under that subpath. Icons reuse the existing kubb-king-motif
`icon-192.png`/`icon-512.png` (built in an earlier branding session) —
no new asset work needed. `background_color`/`theme_color` match
`index.html`'s existing splash screen (`#1c4a36`) so the OS launcher
splash and the app's own splash don't visibly flash two different
colors during the handoff.

**Service worker caching split**: precache (`globPatterns`) covers only
JS/CSS/HTML/the Havok wasm — the actual app shell needed before the
scene can render at all. Textures/audio/glTF/fonts go through a
`CacheFirst` RUNTIME rule instead, since precaching every font weight
and every scene asset up front would bloat the initial install for
content not all of which is even used at runtime. Workbox's default
2 MB per-file precache cap had to be raised to 10 MB — the Havok wasm
(~2.1 MB) and the main bundle (~6.8 MB) both exceed it and are
load-bearing, so silently excluding them (workbox's default behavior
when a file exceeds the cap) would have shipped a broken offline app
shell with no error.

**Verification, no headset available for GATE**: `chrome-devtools-mcp`'s
Lighthouse PWA audit was the first choice but this machine has no
Chrome binary installed for the tool's `stable` channel (an environment
gap — logged here so a future session doesn't waste time re-diagnosing
it, and knows this isn't fixable without installing Chrome). Fell back
to a throwaway Playwright script against the real production build,
checking exactly what a browser's install prompt itself checks: the
manifest link resolves and parses, both icon URLs return 200, and
`navigator.serviceWorker.getRegistration()` resolves with an `active`
worker at the correct scope. All passed. This is strong evidence the
PWA is installable but is NOT the same as Erik's own Quest-browser
install — that GATE stays open (docs/MILESTONES.md), same discipline as
every other real-hardware confirmation this project treats as
non-self-approvable.

**Found and fixed a real regression while verifying**: adding the
service worker broke `scripts/smoke-test.mjs` — Chromium's SW
registration validates the origin's TLS cert through a code path that
Playwright's context-level `ignoreHTTPSErrors` doesn't cover (a known
Playwright/Chromium gap, confirmed by the exact error: "SSL certificate
error occurred when fetching the script" for `sw.js` specifically,
while every other https request on the same self-signed `vite preview`
origin loaded fine). GitHub Pages' real deploy has a valid cert, so
this only ever affected the local smoke test. Fixed by launching the
smoke-test's browser with `--ignore-certificate-errors`.

Mechanical pass green: tsc/eslint/prettier/vitest (218 tests,
unaffected — no core/systems logic touched), build (now emits
`manifest.webmanifest`/`sw.js`/`workbox-*.js`/`registerSW.js`
alongside the existing bundle), smoke (fixed and passing). `npm audit`
flagged one moderate transitive dev-only vulnerability (`qs`, pulled in
by workbox's build tooling, never shipped to the runtime bundle) —
resolved with `npm audit fix`, zero vulnerabilities remaining. README
updated with install instructions.

## 2026-09-03 — USB adb testing now available; README's own instruction was wrong

Erik got a USB card installed, enabling the `adb`-over-USB testing
route (README option 3) for the first time this project. First real
attempt hit an immediate, confusing failure: the Quest browser reported
"empty response" opening `http://localhost:8081` — exactly reproduced
locally with `curl http://localhost:8081/` ("Empty reply from server"),
while `curl https://localhost:8081/` returned `200` instantly. The dev
server (`npx iwsdk dev status`) reports its own `localUrl` as
`https://localhost:8081/` — it only ever speaks TLS, even on localhost,
so a plain HTTP request isn't rejected with a redirect or an error page,
it just gets silence (a raw TLS server has nothing to say to a
plaintext HTTP request).

README's USB section had this backwards ("open `http://localhost:<port>`
... localhost is a secure context on its own") — true of the BROWSER's
security policy (localhost is exempt from requiring HTTPS to be treated
as a secure context), but irrelevant here since the SERVER itself
doesn't listen for plain HTTP at all. Fixed the README to say
`https://` and accept the self-signed cert warning, same as the
existing Wi-Fi (option 2) instruction already correctly said. Not
investigated further why iwsdk's dev server doesn't also serve plain
HTTP on localhost — not blocking, `https://` + accepting the cert
warning works fine and matches the already-correct Wi-Fi path.

Live-verified end to end over real USB: `adb devices` shows the Quest 2
authorized (`device`, not `unauthorized`), `adb reverse tcp:8081
tcp:8081` set up, `adb shell am start -a android.intent.action.VIEW -d
"https://localhost:8081"` opened the Quest's browser directly from this
session (a nice trick worth remembering — no need to ask Erik to
manually type the URL in-headset next time), Erik accepted the cert
warning, and confirmed the scene rendered (grass court + kubbs visible).

## 2026-09-03 — M2 headset gate PASSED (qualitative), tagged v0.3-m2

The project's oldest open gate, blocked since M2 on "how does Erik's
real-headset feel data reach a session." First real headset pass over
the newly-working USB/adb route (see the entry above): Erik threw
10-15 flat + 10-15 backspin throws at varied distances and reported
"det flyter på fint" — then, asked specifically about distance
accuracy, spin realism, release timing, perceived weight, and anything
distracting (haptics, bounces, grip), answered "allt bra, godkänn
gaten." Gate passed on his explicit approval; v0.3-m2 tagged.

**Honest scope note**: the gate as written also wanted the throws
"recorded to JSON." That did NOT happen. Three routes to get telemetry
out of the headset's browser tab were tried this session and all
ruled out:

1. **Chrome remote debugging over adb** — the Quest browser DOES expose
   a `chrome_devtools_remote` socket (`adb forward tcp:9333
localabstract:chrome_devtools_remote` works), but `/json/list`
   returns only the browser's own chrome:// UI panels and the
   registered service worker — the actual content tab is never listed.
   Meta's browser appears to withhold content-tab targets from the
   remote protocol even with USB debugging on. Not a config issue on
   our side.
2. **IWSDK's own MCP bridge** — the dev summary says the injected
   runtime "only activates on localhost/local networks," and the Quest
   tab WAS on `https://localhost:8081` via adb reverse — but
   `connectedClientCount` stayed 0. The bridge only ever connects the
   CLI's managed browser, not an arbitrary tab hitting the same URL.
3. **The tweakpane telemetry-export button** — a flat DOM overlay that
   disappears once the immersive session starts (no `dom-overlay` WebXR
   feature is requested anywhere), and its "Export telemetry JSON
   (console)" button only console.logs anyway — no clipboard, no
   download — so it needs devtools access to read even in 2D mode,
   which is route 1 again.

**Follow-up that would close the numbers half properly**: a dev-only
telemetry relay — the app POSTs each throw record to the Vite dev
server (a tiny middleware in `vite.config.ts` appending to a local
JSON file, dev mode only, never in the production build). The headset
already reaches the dev server over adb reverse, so this needs no new
network path. Not built this session — Erik was mid-test and the
qualitative pass was the point; logged here so the next calibration
session doesn't rediscover the same three dead ends.

**Why passing on words alone is legitimate here**: this is a FEEL
calibration gate. The numbers were meant to make Erik's perception
reproducible as golden-throw profiles, not to substitute for it. His
perception, across both styles with nothing flagged, IS the gate's
core question answered. The golden-throw regression suite already
exists (synthetic 72 Hz sweep against the same target bands, see M2 in
docs/MILESTONES.md) and stays as the automated guard.

## 2026-09-03 — Third review round: gh#12 was closed on a false premise, plus PWA cache fixes

A third independent review (`fdebf92..46c9fc1`: the second-round
fixes, the gh#9-#14 closures, M6 PWA) found no Critical issues and
verified the force-settle subscription, matchSync gating, throw-relay
buffering and disconnect event correct against the actual elics and
trystero sources. Four Important findings, all fixed:

**1. gh#12's closure rationale was wrong — the ordering dependency was
still real.** I had claimed that after gh#13 (captured home pose)
"flipping the two systems' registration order no longer changes the
outcome." False: with MultiplayerSystem subscribed to RoundEnded before
MenuSystem, `moveSticksToFarRack()` would run first and MenuSystem's
own teleport-home would then put every stick straight back at the near
rack. gh#13 removed the pose-READ dependency, not the write-ORDER one —
and three comments (multiplayer.ts class doc, `moveSticksToFarRack`,
src/index.ts) contradicted each other about it. **Fix, by design
rather than by guard**: MultiplayerSystem no longer subscribes to
RoundEnded at all. The turn advance and far-rack placement now ride on
MenuSystem's `Reset{cause:'roundEnd'}` — the single emitter, fired only
AFTER its own teleport — so the far-rack move can never be undone by
that teleport in either registration order. `onResetForMatch()` is now
the one place that branches on cause ('roundEnd' → advance turn,
'manual' → wipe). Traced in both orders; all three comments corrected;
gh#12 annotated with the correction and stays closed because the
contract it asked to test no longer exists. Lesson logged for myself:
"order-independent" is a claim to trace in BOTH orders before writing
it down, not to infer from having fixed one half.

**2. Disconnect left the guest's rig stranded at the far baseline.**
The gh#10 fix reset `hasRepositionedAsGuest` but never moved
`this.player` back, so a former guest stayed at the far baseline — and
if the host reloaded and rejoined with a later `joinedAtMs`, the
stranded player became host with the sticks at the near rack, out of
reach for both. Now: when the room empties, the rig returns to the
default origin and — only if the turn was 'guest' (sticks actually at
the far rack) — sticks return to the near rack via a new
`moveSticksToNearRack()` (both rack moves share `placeSticks()`).

**3. PWA precached all 17 UIKit font chunks (~7 MB the app never
loads)** despite the docs saying fonts were runtime-cached: they're JS
chunks, so `**/*.js` caught them. Fix: a `manualChunks` rule names every
`@pmndrs/msdfonts` module `font-<name>`, and workbox `globIgnores:
['**/font-*.js']` drops them. Precache went 32 entries / 15.6 MB →
19 entries / 9.5 MB, verified in the generated `dist/sw.js`.

**4. The runtime asset rule never matched audio (or UIKitML, or scene
JSON).** Three's loaders go through `fetch()`, so `request.destination`
is `''` — an `'audio'` destination check matched zero `.ogg` files, and
the panels/scene JSON weren't cached anywhere, so the "installable app
shell" could not actually start offline. Fix: `ui/**/*.uikitml` and
`scenes/**/*.json` are now precached (small, needed at startup) and the
runtime rule matches by extension (`.ogg/.glb/.gltf/.ktx2/.hdr/
.uikitml/.json`) instead of destination. Offline START is now an
explicit goal, and the earlier M6 entry's caching description above is
superseded by this one.

Minor findings also taken: a ghost-avatar path (peer leaves during
`instantiate()` — now disposed through an entity instead of orphaned);
a redundant `restTimerStartS.delete` in `onRelease()` (removed — the
qualify/disqualify subscriptions are the single owner); a one-line note
on the force-settle stamp being last frame's time when a relay lands
from a network callback; an eleven-line `Object3D → Pose` array literal
that had reached its third copy (`localPoseOf()`, CLAUDE.md's
extract-on-second-occurrence rule); and the throwaway PWA check folded
into `scripts/smoke-test.mjs` (manifest link + ACTIVE service worker
are now asserted on every build). Left as notes: `pendingThrowRelay`
being single-slot (a second guest throw inside one hello RTT is
implausible); `display: 'fullscreen'` vs `'standalone'` for Quest's
installer (unverifiable from here, gate deprioritized anyway).

Mechanical pass green: tsc/eslint/prettier/vitest (218), build, smoke
(now with the PWA assertions).

## 2026-09-03 — adb "no permissions" after USB re-enumeration: Debian's rules don't cover Meta

Mid-session the Quest 2 went from `device` (authorized, working) to
`no permissions (user erikkalstrom is not in the plugdev group)`. It
had re-enumerated (`transport_id` 3 → 4, product id 5012 → 5013 — the
headset switches USB config when it sleeps/wakes or changes mode), and
the new device node `/dev/bus/usb/001/006` came up `root:root
crw-rw-r--` — world-READABLE only. Root cause: Debian's
`/lib/udev/rules.d/51-android.rules` is a per-vendor/product whitelist
and **Meta/Oculus (vendor `2833`) is not in it**; there was no local
rule either (`/etc/udev/rules.d/` had only Jabra + powercap). The user
is also not in `plugdev`. So the first enumeration working was luck
(most likely a logind `uaccess` ACL on that particular node), not
configuration — and CLAUDE.md's toolchain note "udev rules already
installed" was wrong for the Quest specifically. Corrected there.

**Fix (needs sudo — Erik runs it, not the session)**, a permanent rule
for all Meta headsets, then reload + restart adb:

```
printf 'SUBSYSTEM=="usb", ATTR{idVendor}=="2833", MODE="0666", TAG+="uaccess"\n' \
  | sudo tee /etc/udev/rules.d/51-oculus.rules \
  && sudo udevadm control --reload-rules \
  && sudo udevadm trigger --subsystem-match=usb --action=add \
  && adb kill-server; sleep 1; adb devices -l
```

If it still says `no permissions`, unplug/replug the cable once so the
rule applies to a fresh node. **Confirmed applied the same evening**:
node came up `crw-rw-rw-+`, adb went `no permissions` → `unauthorized`
(fresh key exchange after the server restart — Erik re-accepted the
in-headset prompt) → `device`.

Two more USB-session notes worth keeping: `adb shell am start -a
android.intent.action.VIEW -d "<url>"` opens the Quest browser directly
from the session (no in-headset typing); and `adb logcat -d` without a
tight `-t` limit hangs for minutes over USB on this headset — run the
filter on-device (`adb shell "logcat -d -t 400 <TAG>:I '*:S'"`) with a
`timeout`, never a bare dump.

## 2026-09-03 — M5 frame rate measured on the real Quest 2: 90 Hz, 89-90 fps

The M5 checklist wanted "72 Hz verified ON Quest 2 (chrome-devtools via
adb)". chrome-devtools is off the table (the Quest browser exposes a
devtools socket but never lists its content tab — see the M2-gate
entry above), so this used the compositor's own per-app stats instead:
the `VrApi` logcat tag, which Meta's runtime prints once per second per
VR client (`FPS=<actual>/<target>,Prd=…,Tear=…,Stale=…,App=<ms>,
GPU%=…,LCnt=<layers>…`). Method that actually works on this headset:

- Filter ON the device, never dump: `adb shell "logcat -d -t 12000 |
grep VrApi | grep ' <pid> '"` with `timeout` — a bare `adb logcat -d`
  hangs for minutes over USB, and `-t N` counts lines of the WHOLE
  buffer before tag filtering, so a small `-t` with `VrApi:I '*:S'`
  returns nothing (VrApi is ~2 lines/s among thousands).
- Map pids first: `adb shell pidof com.oculus.browser` (10742 here) vs
  `com.oculus.vrshell` (3174) — both log VrApi; only the browser's
  lines are the game.
- Aggregate with `LC_ALL=C awk` — the machine's sv_SE locale makes awk
  read `0.87` as 0 otherwise (cost one confused pass).
- `LCnt` (layer count) separates phases: 8-12 layers = 2D shell +
  panel UI during enter/exit-XR transitions; 1-2 layers = the
  immersive session. Every fps dip in the sample sat in a high-LCnt
  transition second, not in gameplay.

**Result, ~35 s of live throwing (21:10:38-21:11:12)**: the browser
negotiated a **90 Hz** target for the WebXR session — Quest 2's
browser does that when it can, the 72 Hz in the checklist was the
conservative assumption — and the app held **89-90 fps with 0 stale
frames** throughout, app render **≈6.5 ms avg, 9.3 ms max** against
the 11.1 ms budget at 90 Hz. Two honest caveats: (1) one ~2 s hitch
mid-session (21:11:08-09: 84 fps, 12 stale frames, 2 tears) with no
identified cause — a round-end reset, a settle burst, or GC are all
candidates, none confirmed; (2) `GPU%` peaked at 0.93 — the GPU is
near its ceiling AT 90 Hz, so there's little headroom for the M5
environment pass's decorative additions at that rate (at 72 Hz the
budget is 13.9 ms and it would be comfortable). Follow-up if longer
sessions show hitching: request 72 Hz explicitly with
`XRSession.updateTargetFrameRate(72)` — trading the 90 Hz smoothness
nobody asked for against guaranteed headroom. Not done now; one 2 s
hitch in 35 s isn't evidence enough to give up 90 Hz.

The "72 Hz verified" checklist item is checked on this basis — the
target was exceeded, not merely met. The M5 GATE (Erik: perf + comfort

- full experience pass) is his call, put to him with these numbers.

## 2026-09-05 — MP3a match-rules spec: review findings decided autonomously

Erik approved the match-rules design in brainstorming (win = all opponent
kubbs then the king, king early = loss, sin-bin per side for the whole
match, 10 s auto-restart with host starting, "Ny runda" aborts, `A – B`
score, rules active whenever a peer is connected, new `MatchRulesSystem` +
pure `core/match.ts`), then went AFK asking for a spec review and
implementation. The independent spec review found 2 Critical + 8 Important
gaps; all are design choices small enough to decide now (reversible, per
CLAUDE.md's autonomy rule) rather than block on Erik. Decisions, all written
into `docs/superpowers/specs/2026-09-05-match-rules-design.md`:

- **C1 — king could never fall in Simple mode**: `KingProtected` is already
  on the king from solo play and nothing in the original spec removed it, so
  in the default mode no match could be won. `MatchRulesSystem` now removes
  it on activation; disconnect triggers a full reset so `SimpleRulesSystem`
  re-derives it.
- **C2 — the guest's "Ny runda" did nothing**: `onResetForMatch` bails on a
  non-host, so only the host could abort. Decided: the guest's `Reset{manual}`
  is relayed to the host as a new zod-guarded `resetRequest` action; the host
  emits `ResetRequested`. Erik's "Ny runda aborts the match" now holds on
  both headsets. Game-mode button is disabled on both during a match (a
  relayout mid-match is undefined; host/guest in different modes filed as an
  issue).
- **I1 — king and 5th kubb in the same throw**: ToppleSystem emits per piece
  in rest order, so the outcome would depend on which piece stopped first.
  Decided: the host defers `withKingFelled` by `match.kingDecisionGraceS`
  (1.5 s, new `src/data/match.json`) so a same-stick kubb is counted first.
- **I2 — own-side kubb (ricochet)**: ignored by the reducer; the round-end
  reset stands it back up, as in real kubb.
- **I3 — disconnect left kubbs in the sin-bin**: disconnect now emits
  `ResetRequested`.
- **I5 — `FAR_Z` hardcoded to the default 6 m court**: in Advanced (8 m) the
  mirrored sin-bin row would land inside the court. Moved to a pure
  `farBaselineZ(preset)` in `core/court-layout.ts`, computed from the active
  preset by both systems.
- **I6 — direct `menuSystem.resetAll()` call vs bus**: new `ResetRequested`
  event handled by `MenuSystem`; three emitters (timer, disconnect, guest
  relay) share it. Timer made idempotent.
- **I7 — sin-bin slot counter**: derived from list index instead
  (`core/matchSinBin.ts`, pure, tested) — a late-joining guest's first
  snapshot can carry several ids at once.
- **I8 — PWA autoUpdate can leave one headset on the old wire version**:
  distinct "schema version mismatch" warn so it is diagnosable.
- Minor: `phase` dropped (`isFinished` derives from `winner`);
  `withKingFelled(state, kubbsPerSide)`; `ToppleSystem` excludes `OutOfPlay`.

Filed as issues rather than fixed: host/guest in different game modes; stats
pollution from relayed guest throws (a `Settled` without a `Thrown` on the
host — pre-existing).

## 2026-09-05 — MP3a match rules implemented (autonomous, Erik AFK)

Built per `docs/superpowers/specs/2026-09-05-match-rules-design.md` and
`docs/superpowers/plans/2026-09-05-match-rules.md`, eight tasks, one
commit each, TDD for everything in `src/core/`:

- `core/match.ts` v2: per-side felled-kubb id lists, `withKingFelled`
  (king after all opponent kubbs = win, earlier = loss), own-side
  ricochet ignored, `score()`, `isFinished()`; 17 tests.
- `core/matchSinBin.ts`: `sinBinPlacements(state)` — slot = list index
  (never a counter), guest row = host row mirrored with the same
  `mirrorPoseToFarBaseline` every far-end placement uses; `farBaselineZ`
  moved into `core/court-layout.ts`; `src/data/match.json`
  (`kingDecisionGraceS` 1.5, `restartDelayS` 10); 5 tests.
- `core/matchSync.ts` v2 (+ `peekSchemaVersion` for the PWA-autoUpdate
  mismatch log), new `core/resetRelay.ts`; 7 tests.
- `ResetRequested` bus event; `src/matchActivityState.ts` shared flag;
  `systems/activeCourt.ts` (`activeFarBaselineZ()` from the ACTIVE
  preset — `FAR_Z` was hardcoded to the 6 m default); ToppleSystem
  excludes `OutOfPlay`; SimpleRulesSystem stands down while a match is
  active; MenuSystem gets `resettableInPlay` (round-end reset keeps
  sin-binned kubbs), handles `ResetRequested`, locks the game-mode
  button during a match (label suffix, not a styling guess).
- MultiplayerSystem: `KingFelled` deferred by the grace in `update()`;
  guest `Reset{manual}` relayed as `resetRequest`, host emits
  `ResetRequested`; version-mismatch warn.
- New `systems/matchRules.ts`: diff-driven sin-bin placement on both
  clients, `KingProtected` stripped on activation, 10 s auto-restart on
  the host, full reset on room-empty.
- HUD: score `A - B`, separate turn row, end-reason row.

**One real finding during verification**: the score's en dash ("2 – 3",
Erik's chosen format) rendered as "Missing glyph info for character
'–'" ×3 — the UIKit MSDF font's charset has no en dash (same limit as
gh#5's å/ä/ö, which were added to the charset back then; an en dash was
not). Switched to a plain hyphen rather than regenerating the charset
for one character. Spec and README updated to match.

**Emulator verification (solo, MCP)**: `MatchRulesSystem` registered
(index 35, king query 1), `MenuSystem` shows both queries
(`resettable` 17, `resettableInPlay` 17), `ToppleSystem` toppleable 10
(king excluded by `KingProtected`). A REAL physical topple (horizontal
stick sweep through Kubb 5) → `[state] kubb felled {31}` → Kubb 5 at
(3.30, 0.075, −0.30) = sin-bin slot 0 with `OutOfPlay`, via the
untouched solo `SimpleRulesSystem` path (flag inactive); the king stayed
`KingProtected`; the stick settled normally; zero console errors; no
glyph warnings after the hyphen fix. NOT verified in the emulator: the
manual-reset restore (UI-driven through the B-button menu — the reset
code path is unchanged for solo since the new query is only picked while
the flag is true), and everything behind the flag — sin-bin across
rounds, king decision, auto-restart, guest abort — which needs two real
peers. Mechanical pass green: tsc/eslint/prettier, vitest 230 tests
(+13), build (precache still 19 entries), smoke.

**Headset gate for Erik (docs/MILESTONES.md, MP3a)**: felled kubbs stay
in the sin-bin across rounds on both headsets; score `A - B`; king early
= loss on both; king after all kubbs = win; ~10 s later a fresh match
with A starting; "Ny runda" from EITHER headset aborts; game-mode button
label shows "(låst under match)". Filed: gh#15 (host/guest in different
game modes), gh#16 (relayed throws pollute host stats).

## 2026-09-05 — MP3a code review: king-grace/turn-advance race fixed

A fresh reviewer (range: spec commit → HEAD) traced the MP3a
implementation against spec and plan. Mechanical pass reproduced green;
the reducer's same-reference contract, slot-from-index placement, the
disconnect path and the restart timer were all confirmed correct. One
Critical finding — in the grace logic I designed to fix spec review I1:

**Critical — the king decision could be attributed to the wrong
thrower.** `KingFelled` is deferred 1.5 s (`kingDecisionGraceS`) so a
kubb felled by the same stick counts first. But if that stick is the
SIXTH of the round it can settle within a fraction of a second, ending
the round → `Reset{roundEnd}` → `advanceTurnForMatch` flips
`currentTurn` — and 1.5 s later `withKingFelled` reads the flipped
turn: "king early" would crown the player who actually LOST. The
deciding throw of the match, one stick in six, physically common.
**Fix**: `advanceTurnForMatch` applies any pending king decision
(`applyPendingKingDecision()`, now shared with `update()`) BEFORE the
flip — nothing is lost, because the reset that triggered the round end
has already teleported any still-falling kubb home, so nothing the
grace was waiting for can arrive. The headset checklist now says to
test the king specifically with the 6th stick.

Important, fixed: the game-mode button's "(låst under match)" label was
only refreshed by other button presses — `setMenuOpen(true)` now
refreshes labels, so opening the menu mid-match shows the lock; the
grace timestamp now comes from the `KingFelled` event's own `timeS`
(same elics clock, current frame) instead of a frame-stale `nowS`
field. Important, filed as gh#17: a kubb (or the king) still falling
when the 6th stick settles is teleported home by the round-end reset
and never counted — pre-existing solo semantics, but in a match it can
swallow the 5th kubb; belongs in `RoundSystem` (wait for a quiet
court). Important, logged in docs/QUESTIONS.md: the guest's "Ny runda"
double-jumps the sin-bin kubbs for one round trip (local teleport,
pieceSync snap-back, then the host's real reset) — accepted for now
with three options recorded. Minor, taken: `felledKubbIds` arrays
bounded by `KUBB_COUNT` in the zod schema; `kubbId(i)` helper pairs
with `kubbIndexFromId` (three `kubb-${i}` copies collapsed); tests for
`withKubbFelled`'s `kubbsPerSide` and for a wrong-side id in a
snapshot; empty end-reason label documented; spec's stale
"`getSystem(MenuSystem)`" sentence corrected.

Verdict was "ready with fixes"; all fixes landed the same pass. 232
tests, tsc/eslint/prettier, build, smoke green.

## 2026-09-05 — MP3b avatars implemented (autonomous, Erik AFK)

Per `docs/superpowers/specs/2026-09-05-avatars-design.md` /
`docs/superpowers/plans/2026-09-05-avatars.md` (Erik's choices: a
procedural body from what is tracked, player-chosen color from a 6-color
palette cycled by a settings button, `PeerAvatarSystem` + pure core):

- `core/quat.ts` gained `rotateVectorByQuaternion`, `quaternionFromYaw`,
  `yawFromQuaternion`, `quaternionAligningY`; `core/avatarPose.ts`
  `solveAvatarPose()` derives torso (straight below the head — nodding
  must not move the body), shoulders and straight shoulder→hand arm
  segments; dims in `src/data/avatar.json`. 15 new tests.
- Settings `avatarColorIndex` (`.default(0)`), `src/data/avatar-palette.
json` (red/blue/orange/purple/teal/white — no green against grass),
  `avatarPaletteEntry()` clamping, a settings-tab button cycling it.
- Presence v2 carries `colorIndex`; `MultiplayerSystem` no longer owns
  avatars — it emits `PeerPresence`/`PeerLeft` and lost ~90 lines. New
  `PeerAvatarSystem`: per-instance material clone tinted from the
  sender's index, torso yaw low-passed toward head yaw
  (`yawSmoothingS`, wall-clock dt since there is no update loop), unit
  arm cylinders scaled to the solved length. Scene asset rebuilt: head +
  dark visor, torso box, arms, mitten hands, all named parts.
- HUD score digits colored per player (own color from settings, the
  opponent's from its presence).

**Two self-inflicted incidents worth remembering**: (1) I overwrote the
EXISTING `src/core/quat.ts` (fromAxisAngle/angularVelocityBetween, used
by throwRelease/topple) with a new file of the same name — `tsc` caught
it immediately; restored from git and appended the new helpers instead.
Lesson: `Write` on a path I haven't read this session must be preceded
by a check that it doesn't exist. (2) A CSS comment inside a UIKitML
`<style>` block breaks the production build ("Unsupported stylesheet
selector") while tsc/eslint/vitest stay green — and the smoke test
happily ran against the previous `dist/`, so the commit gate missed it.
Gate now includes `npm run build` + smoke on a fresh build. Noted in the
uikitml header for the next author.

**Emulator**: zero console errors after reload; `PeerAvatarSystem`
registered (index 36); the rebuilt asset renders validly via
`scene_render_file` on a scratch scene (7 meshes, 2 materials — the
config import works in the editor realm too); solo HUD unchanged. NOT
verifiable without a peer: the posed body, the color sync, the score
tint — the 2-headset gate. 251 tests, tsc/eslint/prettier, build, smoke
green.

## 2026-09-05 — MP3b code review: shared-geometry dispose, send-side color clamp

A fresh reviewer traced the avatar math by hand (all correct), the event
flow, and IWSDK's instantiate/dispose internals. No Critical; two
Important, both fixed:

1. **`entity.dispose()` released SHARED resources.** `assets.instantiate`
   for an Object3D prototype is a `SkeletonUtils.clone` — meshes copy
   geometry/material REFERENCES — and `Entity.dispose()` defaults to
   disposing every descendant's geometry and material. Every peer leave
   therefore GPU-released the head/torso/arm/hand geometries and the
   shared visor material for the prototype and all other instances (a
   re-upload hiccup on next render, not a crash — but wrong). Fix:
   `entity.dispose({ disposeResources: false })` + an explicit
   `material.dispose()` of the one per-instance clone; same on the ghost
   path. Still `dispose()`, never `destroy()`.
2. **Presence sent the RAW settings color index** while the receiver's
   schema caps it at 15 — a stale/hand-edited index ≥ 16 would have made
   every presence message from that player invalid: no avatar, nothing
   visibly wrong locally. `buildPresenceMessage` now clamps, so the
   invariant lives with the schema; tested.

Minor, taken: the palette JSON now carries its own `nameKey` per color
(CLAUDE.md: mappings in JSON) and `src/avatarPalette.test.ts` asserts
every key exists in sv+en — the earlier `Record` + `?? 'avatarColorRed'`
fallback claimed compile-time safety it did not have; a new
`AvatarColorChanged` bus event re-tints your own HUD digit the moment
you cycle the color (the opponent's side already updated via presence);
`try/finally` around `instantiate()` so a rejection can't leave a peer
stuck in-flight; the arm segment now stops at the hand's surface
(`handSizeM/2` inset) instead of the centre, `armRadiusM` 0.04 → 0.025,
visor narrowed and moved into the sphere — all cosmetic and still
"starting values" for the headset; `close()` test helper asserts length.
Recorded deviation: the spec said arm _capsules_ and _rounded_ boxes;
cylinders and plain boxes were used — a capsule's end caps would squash
under `scale.y`, and rounded boxes buy nothing at this size. Left as a
headset-gate note: `yawFromQuaternion` degenerates when the head looks
straight up/down (forward ≈ ±Y) — the low-pass hides a brief twitch;
switch to the head's projected right axis if it shows in play. Also
noted: the two-span `.score` row has never been RENDERED (hidden in
solo) — on the checklist.
