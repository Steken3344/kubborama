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
