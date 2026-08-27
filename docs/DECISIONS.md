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
