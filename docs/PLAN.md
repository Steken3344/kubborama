# KubbOrama — Implementation & Asset Plan

# Companion to CLAUDE_CODE_START_PROMPT.txt. Put this file in the repo root

# so Claude Code can reference it while building milestones M0–M6.

# All asset sources below are CC0 (public domain) — verified 2026-08-26.

## 1. Architecture (IWSDK / ECS)

Suggested module layout:

src/
config.ts # ALL tunables (gravity, wind, masses, dimensions)
index.ts # World.create, feature flags, system registration
entities/
court.ts # ground, court lines, corner stakes
pieces.ts # factory functions: createKubb, createKing, createStick
environment.ts # sky/HDRI, trees, fence, stick rack (swappable later)
systems/ # ECS adapters — read engine state, call core, emit
throwing.ts # grab/release adapter -> core/throwRelease.ts
wind.ts # applies wind force to Flying sticks (see note)
topple.ts # adapter: reads transforms -> core/topple.ts
scoring.ts # adapter: feeds events -> core/scoring.ts + stats
reset.ts # restore all pieces to start positions
core/ # PURE CORE — no three.js/IWSDK/Havok imports here; # systems/* below are thin adapters that CALL these
events.ts # the event bus: typed game events (Thrown, # Impact, KubbFelled, KingFelled, RoundEnded...)
throwRelease.ts # frame-averaged release velocity + lever-arm math # (v_com = v_hand + w x r) from controller samples
topple.ts # isToppled(quaternion, threshold) + rest detection
scoring.ts # scoring/round reducer: (state, event) -> state
i18n.ts # typed t(key) over dictionaries; sv + en (pure core)
settings.ts # settings model + zod schema + localStorage persist
log.ts # structured logger: levels + channel tags ([throw], # [physics], [grab]...) — designed for MCP # browser_get_console_logs pattern filtering; ring # buffer feeds the debug report export
stats.ts # stats reducer (events → round stats, personal # bests, lifetime totals); versioned zod schema in # localStorage; matches/wins section reserved for # post-POC game modes
haptics.ts # named haptic patterns as data (grabTick, # releaseClick, impactRumble(force), kubbFelled, # kingFelled, roundCleared, uiTick); adapter pulses # via XRInputSource.gamepad.hapticActuators[0] # (optional-chained — absent in hands mode/emulator)
ui/
hud.ts # spatial UI scoreboard (UIKitML)
settingsPanel.ts # player-facing: music/SFX volume, language, game mode
debugPanel.ts # dev-only sliders: wind strength/direction, gravity
debugOverlay.ts # dev-only in-VR overlay: FPS, stick states, last # throw telemetry, active preset, last log lines + # red error toast (always on, prod too) — errors # must be visible inside the headset

Key implementation notes:

- Use IWSDK's grab components (e.g. OneHandGrabbable) on sticks; on release,
  read the controller/hand velocity + angular velocity and apply them to the
  stick's Havok rigid body. If IWSDK's throw support does this natively,
  prefer the built-in; verify in the installed typings first.
- END-GRIP THROWING (the heart of throw feel): the hand grips the stick at
  one END (anchor in the last ~8 cm) so the end-over-end flip emerges from
  the real swing. On release compute the center-of-mass velocity
  v_com = v_hand + ω_hand × (p_com − p_hand) — never copy raw hand velocity
  to the CoM (classic VR throwing bug; feels subtly wrong on every throw).
  Apply { linearVelocity: v_com, angularVelocity: ω_hand } via
  PhysicsManipulation. Release-velocity smoothing window stays SHORT
  (~3-5 frames, recency-weighted): release timing is the player's skill,
  and over-smoothing makes releases feel late.
- SPIN STYLES: flat/no-spin and heavy-backspin throws must both emerge
  naturally from the physics (no spin assist/normalization). Capsule
  collider with real dims/mass → correct moment of inertia; expose
  angular-damping-in-flight in the tuning lab (engine default is 0);
  Magnus effect consciously omitted (log in DECISIONS.md); tune ground
  friction/restitution against BOTH styles; M2 calibration records both
  and golden tests keep two profiles (flat + backspin).
- Underhand classifier (pure core, unit-tested on recorded pose series):
  last ~0.5 s of hand poses + release velocity → style (underhand /
  overhand / helicopter) + flip-quality 0-100 (spin axis horizontal and
  perpendicular to throw direction). Surfaced as a HUD badge and a tuning-
  lab meter. Informational only in the POC — rule enforcement is a later
  option.
- Topple detection: a kubb counts as felled when the angle between its local
  up axis and world up exceeds config.toppleAngleDeg (default 60) AND its
  linear+angular velocity is below a rest threshold for ~0.5 s. Never count
  a merely wobbling kubb.
- Wind: constant force F = windVector * dragFactor applied each tick ONLY
  to STICKS in the Flying state (state machine — no contact-query API
  exists, see DERISK; kubbs/king are unaffected in the POC). dragFactor
  is a config.ts tunable (default 0.02 N·s/m as a starting guess, tuned
  in the lab). Default windVector = 0 in the POC (Simple mode); Advanced
  mode default 1.5 m/s lateral.
- Reset: teleport bodies back (zero velocities), don't respawn entities.

## 2. Shapes / geometry

Build ALL game pieces as procedural three.js primitives (no modeling tool
needed, trivially tunable from config.ts, minimal vertex count). Use real
kubb dimensions (meters):

Piece Visual mesh Physics collider

---

Throwing stick CylinderGeometry r=0.022, h=0.30, capsule or cylinder
(x6) radialSegments=12 (r 0.022, h 0.30)
Kubb (x5) BoxGeometry 0.07 x 0.15 x 0.07 box (same size)
King (x1) BoxGeometry 0.09 x 0.30 x 0.09 single box (ignore + simple "crown": 4 small wedge cuts the crown for
or a 4-sided ConeGeometry cap on top, physics — keep the
merged into one mesh collider a plain box)
Corner stakes CylinderGeometry r=0.01, h=0.30, none (static, or
(x4, optionally red-tipped (authentic thin static box)
"hompinnar") detail seen in reference photos)
Court lines OPTIONAL (settings toggle, off by none
default — real courts have no lines,
only stakes): faint dotted strips,
5 mm above ground (avoid z-fighting)
Ground PlaneGeometry 30 x 30 m, grass texture static plane/box
tiled ~15x15
(No stick rack in the POC: the six sticks LIE on the grass in front of
the baseline, loosely scattered — real kubb style. A rack can become
environment dressing later.)

Masses (config defaults — COMPUTED from wood density, birch 640 kg/m³,
the classic kubb material; corrected 2026-08-27, earlier values were
~60% too heavy):
stick (baton) 0.29 kg [range pine 0.23 - rubberwood 0.34]
kubb 0.47 kg [range 0.37 - 0.55]
king 1.45 kg [range 1.13 - 1.70; crown cuts ≈ -7% volume]
Expose material presets (pine/birch/rubberwood) in the tuning lab —
they scale all masses together and audibly/physically change the game.
Friction ~0.6 (unfinished/oiled wood on grass — real sets are raw or
oiled, never varnished slick), restitution ~0.15 (wood is not bouncy).
Give the ground slightly higher friction so felled pieces stop sliding.
Real-set build facts (for visual authenticity): kubbs are cut from
~7 cm square stock, the king from ~9 cm stock, batons from Ø44 mm
dowel; the crown is 4 simple V-cuts around the top; edges are lightly
chamfered/sanded — model a subtle edge bevel on kubbs/king so
highlights read as wood, not math boxes.

Player: standard IWSDK XR rig, standing scale, positioned behind one
baseline, facing the court. The app starts DIRECTLY in free-throw mode —
no menu or lobby gates entry (first-run experience: put on headset, sticks
at your feet, kubbs + king across the court, just throw). Stick pickup
works two ways: direct grab (bend down + grip) and distance grab
(point + grip pulls the stick to the hand — DistanceGrabbable, verified
in @iwsdk/core; add PhysicsManipulation or the built-in pull for the
motion). No locomotion needed for the POC (real kubb is played standing).
NO auto-return of thrown sticks: distance grab covers retrieval, and the
round's auto-reset (after the 6th stick settles) restores everything —
an auto-return timer would fight the round logic.

## 2b. Reference images (PICS/ in Erik's KubbOrama folder) — takeaways

Verified against 8 reference photos/diagrams of real kubb sets and play:

- COURT ORIENTATION (the big catch): baselines are the SHORT sides; the
  kubbs line the short edge and the LONG dimension is the throw distance.
  Now stated explicitly in the start prompt — laying kubbs along the long
  side would have been completely wrong.
- No painted lines on real courts — only corner stakes (hompinnar), often
  red-tipped; king's crown is carved zigzag and often painted red. Court
  lines are now an off-by-default settings toggle.
- Sticks lie loosely in a row/scatter behind the baseline in real play —
  matches our spawn design. Mid-flight photo shows end-over-end tumble —
  validates the flip-physics focus.
- Grounding detail: pieces visually sit slightly INTO the grass. Sink
  pieces ~2-3 mm below the visual grass top (collider unchanged) + blob
  shadows, or they'll look like they float on the texture.
- Wood in real sets is pale birch-like — validates ash_veneer/plywood.
- Full set = 10 kubbs (5 per baseline) — POC uses one side; the full
  rules engine later uses all 10.
- Swedish i18n flavor from the diagrams: kastpinnar (throwing sticks),
  hompinnar (corner stakes), kung (king) — use in the sv dictionary.

## 3. Textures (all CC0, verified sources)

Sources:

- Poly Haven (polyhaven.com) — CC0, PBR texture sets + HDRIs, choose 1K.
- ambientCG (ambientcg.com) — CC0, PBR texture sets, choose 1K.
- Kenney (kenney.nl) — CC0 low-poly 3D packs (flat-colored, no textures
  needed, ideal for Quest perf).

Concrete picks (verified via the Poly Haven API 2026-08-26):

- Ground grass: ambientCG "Grass004" (or Grass001/005), 1K JPG set,
  tiled ~15x15 — CORRECTION: Poly Haven's grass_medium_01 turned out to be
  a 3D MODEL (grass clumps), not a tileable ground texture; it can still
  be used as decorative grass tufts around the court later. Tileable
  ground grass comes from ambientCG (download pattern:
  https://ambientcg.com/get?file=Grass004_1K-JPG.zip).
- Stick/kubb wood: "ash_veneer" or "plywood" (pale birch-like wood — real
  kubb sets are birch/rubberwood). Slight per-piece hue variation (±5%
  lightness in the material color) so pieces don't look cloned.
- King wood: "japanese_cedar_planks" or same wood tinted darker +
  a painted red/yellow band or simple crown paint on top
  (kubb kings are often decorated) via vertex colors or a
  second material on the crown cap.
- Stick rack / fence wood: "brown_planks_03".
- Sky + ambient light: ONE Poly Haven outdoor HDRI, 1K-2K equirect:
  "autumn_park", "ballawley_park" or "autumn_field_puresky" (sunny
  park/garden look). Use it for both background and image-based lighting —
  then a single directional light for the sun is enough; NO other lights.

Texture budget & pipeline (Quest 2):

- 1K (1024px) max per set; albedo + normal is enough — skip AO/roughness
  maps for the POC (set constant roughness ~0.8 in the material).
- Compress to KTX2/Basis with glTF Transform (`gltf-transform etc1s` /
  `uastc`, or `gltf-transform optimize`) or load via THREE.KTX2Loader;
  fallback: plain JPG/PNG at 1K is acceptable for the POC.
- Reuse ONE wood material across sticks+kubbs+rack (shared texture =
  fewer texture binds).

## 4. Environment props (garden)

Keep it minimal — the court is the star. From Kenney's CC0 low-poly packs
(flat-shaded, no textures, very cheap to render):

- "Nature Kit" (330 models: trees, rocks, foliage, fences) — 3-5 trees
  around the court edge, a fence line behind the player, a few bushes.
- Convert/merge props into as few GLBs as possible; static, no physics
  (or one big static trimesh only if needed — prefer none).
  Alternative if a more "Swedish garden" look is wanted later: a red
  Falu-style playhouse built from 3 boxes + planks texture. Later versions
  swap environment.ts wholesale (beach, winter, Gotland...) — keep all
  environment assets behind that one module boundary.

## 5. Audio (M5)

- Kenney "Impact Sounds" pack (CC0): wood hits/knocks. Full SFX inventory
  (all triggered from the pure-core impact detector's |Δv| events —
  no collision-event API exists, see DERISK — pitch-randomized ±10%,
  volume scaled by impact speed, 2-3 variants each so repeats don't
  sound identical):
  stick vs kubb ......... the signature dry wooden "klonk" — THE sound
  of kubb; spend extra care picking this one
  stick vs king ......... slightly deeper klonk (bigger piece)
  stick vs ground ....... soft thud on grass
  stick vs stick ........ light wooden clack (hitting the rack/pile)
  kubb toppling over .... tumble/roll on grass (short)
  king felled ........... deeper impact + a small win/lose sting
  grab / release ........ subtle handling foley (very low volume)
  UI ................... soft click for settings panel interactions
  Whoosh for a flying stick is post-POC (Doppler idea in the backlog).
- Trigger from the pure-core IMPACT DETECTOR (no public collision-event
  API exists in IWSDK — verified): per tick, |Δv| of a piece above a
  threshold = impact, magnitude scales volume + haptics. Unit-testable
  with velocity series. Play via AudioUtils.play / one-shot auto-removing
  audio entities (built in).
- Ambience: one quiet looping "birds/garden" track.
- MUSIC: one cozy background loop (calm acoustic/folk/lo-fi). Source:
  Pixabay Music (verified: free commercial use, no attribution required;
  embedded-in-a-game use is fine). NOTE: FreePD — the classic CC0 music
  site — shut down in 2025; do not point to it. Keep music non-spatial
  (plain stereo, low default volume ~25%) so it feels like atmosphere,
  not a sound source in the garden.
- Two volume channels — music and SFX — controlled from the settings
  panel and persisted; ambience follows the SFX channel.
- License log: every audio (and other) asset gets a line in ASSETS.md:
  filename, source URL, license, date fetched.

## 6. Performance budget (Quest 2, 72 Hz)

- Total triangles < 100k (this scene should land far below).
- Draw calls < 100: merge static environment meshes, share materials,
  use InstancedMesh for the 5 kubbs and 6 sticks if convenient.
- Textures: 1K, KTX2-compressed, ≤ 6-8 unique textures total.
- Lighting: HDRI environment + 1 directional light. NO real-time shadows
  from dynamic objects — use cheap blob shadows (dark semi-transparent
  circle quad under each piece) if grounding is needed.
- No post-processing. Verify with the Quest browser's performance HUD /
  Meta's WebXR performance tools before calling M5 done.

## 7. Lessons from prior art: ViKubb (Steam, 2020, PC VR)

ViKubb (store.steampowered.com/app/681790) is the only notable kubb VR game.
It is PC-VR only (SteamVR/Oculus PC) — there is NO standalone Quest kubb
game, so KubbOrama fills a real gap. From its 88%-positive reviews:

What players praised (borrow these):

- Natural, satisfying throwing physics was THE most-praised feature. This
  validates making M2 (throw feel) the quality bar for the whole POC —
  do not move past M2 until a throw genuinely feels like throwing a stick.
- Small scope but polished ("$3.99 with the polish of a $14.99 title").
  A tight, well-tuned POC beats a broad rough one.
- Practice-against-AI available while waiting for a match — a good pattern
  for a later multiplayer version.
- Cohesive stylized/cartoon look — low-poly flat-shaded (our Kenney
  environment) is a feature, not a compromise.
- Environments at different times of day + earned cosmetics — aligns with
  our planned swappable environment module and variable settings.

What players criticized (avoid these):

- Dead multiplayer: tiny player base, ranked servers gone by 2025.
  Lesson: design single-player-first. The future "opponent" priority is
  a decent AI opponent, then local pass-the-headset play, and online
  multiplayer only if the game finds an audience. Never gate core fun
  behind matchmaking.
- Broken throw physics on some controllers (WMR, early Rift S).
  Lesson: velocity transfer on release is fragile — smooth/average the
  last few frames of controller velocity rather than sampling one frame,
  and test in both emulator and headset.
- Only beginner-level AI, thin content. Lesson: when we build AI (post-POC),
  give it tunable accuracy from the start (aim error stddev per difficulty).

Also reviewed — Kubb 3D League (Android, Prelogos, updated Oct 2025):
a flat-screen mobile kubb game (drag to set power/direction). Only 100+
downloads, ad/IAP-funded. Ideas worth borrowing for post-POC versions:

- Pass & Play local mode — confirms pass-the-headset as the natural first
  multiplayer for KubbOrama.
- Multiple AI difficulty levels and several themed arenas — same
  conclusions as from ViKubb.
- Tournament mode with national teams — a fun later meta-layer; a natural
  KubbOrama twist would be a "World Championship on Gotland" arena, since
  the real Kubb World Championship is played on Gotland where the game
  originates.
- Their strategy layer (placement of thrown field kubbs) only matters once
  the full rules engine exists — reinforces keeping it out of the POC.
  Key contrast: drag-to-throw on a phone cannot convey throw feel — embodied
  physical throwing is exactly what VR adds and what no kubb game on any
  flat platform offers. That is KubbOrama's core differentiator.

Genre big brother — CORNHOLE (and ForeVR Games' casual-sport formula):
Cornhole is kubb's closest relative (underhand tossing at targets on a
lawn) and internationally much bigger — a pro league (ACL) with TV
broadcasts, and a proven VR market. ForeVR Games built a whole catalog on
this genre (Bowl, Darts, Cornhole, Pool — Quest/Steam/PSVR2), which
VALIDATES the category commercially. Their formula, worth borrowing in
order of fit:

- Collectible equipment skins (their branded bean bags → our painted/
  engraved kubb sets and sticks; folk-art/dala patterns, tournament sets)
  — strengthens the cosmetics item already in the backlog.
- Venue variety as content strategy (bar, beach, rooftop → our midsommar
  garden, Gotland VM arena, beach, winter) — confirms the swappable
  environment module as a long-term content engine.
- Jukebox-style music selection — cheap extension of our music channel:
  let the player pick among a handful of cozy tracks in settings.
- Social-casual multiplayer with voice as the retention core — exactly
  our MP1-MP3 design; their Discord-community focus suggests a small
  community space matters once there are players.
- AI opponents with difficulty tiers + long-term "play forever"
  engagement loops (stats, unlocks) — matches our backlog priorities.
  What the genre's reviews consistently punish: FLOATY THROW PHYSICS —
  the #1 complaint pattern in casual sport VR. Reinforces (again) that M2
  throw feel is the hill the whole game stands on. Also: cornhole's pro/
  broadcast culture (ESPN) validates the spectator/grandstand view as more
  than a gimmick — watchable casual sports is a real format.

Also noted — Scorched Kubb (itch.io, IGI Community Game Jam 2017, weekend
prototype, Windows + HTC Vive): not a kubb simulation but an artillery-
style twist — turrets shooting at kubbs, weapon modifiers that affect both
players in opposite ways, local 2-player, matches lasting a few minutes.
Takeaways for a distant future "party mode": kubb rules tolerate playful
modifiers well (crazy wind, low gravity, weird projectiles) — which fits
KubbOrama's already-planned tunable gravity/wind config: the debug sliders
of M4 are secretly the seed of an arcade/party mode. Also a reminder that
short match formats (Erik's planned rule options to speed up play) keep
sessions inviting. No lessons for the core sim POC — scope unchanged.

## 8. Spectator / grandstand view (post-POC feature — prepare for it now)

Goal: a third-person side view of the match ("läktarvy" / grandstand view)
that can be shown on external screens — TV, projector, stream — while the
player plays in the headset. Quest's built-in casting only shows the shaky
first-person view; a fixed, calm grandstand camera is far better to watch.

Why WebXR makes this cheap: the spectator client is just the same web app
opened WITHOUT entering VR. The desktop emulation view we already use for
development IS a primitive spectator view — a laptop/TV browser on the same
network opens the game URL with e.g. ?spectator=1 and renders the scene
from a grandstand camera instead of starting an XR session.

Implementation sketch (do NOT build in the POC, but don't block it):

- State sync: headset is authoritative; it broadcasts piece transforms
  (12 bodies: 6 sticks, 5 kubbs, 1 king) at ~20 Hz plus discrete events
  (grab, throw, topple, king felled, reset). Spectator interpolates between
  updates. Transport: Trystero (see section 12) — serverless WebRTC rooms,
  no signaling server to build or host. The payload is tiny — this is
  easy, not a netcode project.
- Cameras: define named camera poses in config.ts from day one, e.g.
  playerSpawn, grandstandSide (elevated, side-on at the middle line),
  grandstandEnd (behind the player, slightly raised), kingCam (low, near
  the king — dramatic for king throws). Spectator can cycle between them;
  a slow subtle dolly on the side camera looks broadcast-quality.
- Replay seed: because synced state is so small, recording each throw
  (transforms per tick) into a ring buffer gives free instant replays —
  from ANY camera — for both spectator screens and an in-VR replay later.
- Bonus: the spectator page is also the marketing tool — record it for
  trailers/GIFs instead of shaky headset captures.

Preparation required in the POC (cheap, do these):

1. Keep simulation state (ECS components: transforms, game events) cleanly
   separated from rendering — no game state living only inside meshes.
2. Put all camera poses in config.ts (see above) even though only the
   player pose is used in the POC.
3. Emit the discrete game events (throw, topple, king-felled, reset)
   through one event bus/emitter — scoring and audio already need them;
   the future network layer just subscribes to the same bus.

## 9. Additional technical decisions (POC-affecting)

a) Deploy to a real HTTPS host from day one. Set up a static deploy
(GitHub Pages via Actions, or Netlify/Vercel) in M0. This gives a
stable https:// URL — the Quest browser opens it with no self-signed
certificate fiddling, the PWA (M6) installs from it, and friends can
playtest by just getting a link. Local Vite stays the dev loop; the
deployed URL is the test/demo loop. CI: typecheck + build on every push.

b) Explicit state machine per stick: Racked → Held → Flying → Settled.
And per game phase later. Even in the POC this makes wind (only Flying),
scoring (only on Settled) and the future rules engine much cleaner
than ad-hoc booleans. (Auto-return was CUT — see §2; rounds handle it.)

c) Court/rule presets in config.ts from the start: tournament 8x5 m,
backyard 6x3 m, kids 5x2 m (real recommended sizes). The POC uses one,
but presets cost nothing now and become the options menu later.

d) Throw telemetry for tuning: on every release, log release speed (m/s),
angular velocity, flight time, landing point, and outcome to the debug
panel/console. Tuning M2 by feel alone is guesswork; numbers make
Claude Code's iterations converge fast. Later this feeds player stats
("personal best throw", accuracy %).

d1b) BALLISTIC TARGET BANDS (computed, physics-correct — use as the
tuning lab's initial green bands until Erik's calibration throws
replace them). Release height ~1.3 m, flat ground:
distance release speed (20-50° launch) flight time
2.5 m ~3.9-4.2 m/s 0.66-0.92 s
4.0 m ~5.4-5.8 m/s 0.74-1.10 s
6.0 m ~6.9-7.7 m/s 0.83-1.30 s
8.0 m ~8.2-9.3 m/s 0.92-1.48 s
Optimal launch angle is ~30-40° (lowest required speed). End-over-end
flip rates: 0.5-1.5 revolutions per flight ≈ 3-13 rad/s spin at
release (8 m throw: ~3-9 rad/s; short 4 m lob: ~4-13 rad/s).
Sanity use: if telemetry shows a "normal" throw at 15 m/s or 25 rad/s,
the velocity transfer is over-tuned — these numbers catch that
immediately.

d2) THROW TUNING LAB (M2, dev tooling behind a debug toggle): every feel
parameter exposed as a normalized 0-100 value with the real unit shown
alongside (mapping defined once in config.ts); live 0-100 meter bars
per throw (release speed, spin, flight time, distance) with a green
target band once Erik's reference throws exist; preset slots A/B/C
switchable in VR for back-to-back feel comparison; JSON export/import
of presets so exact numbers travel through chat between Erik and
Claude; telemetry logs record the active preset. Same state in both
UIs (tweakpane on desktop, spatial panel in VR). 0-100 is the shared
tuning language ("raise spin from 35 to 50").

e) Haptics as part of M2, not polish: light tick on grab, soft click on
release, rumble scaled by impact force on hits (WebXR Gamepad haptic
actuators). Haptics is half of throw feel.

f) Object pooling / GC hygiene: reuse vectors and event objects in the
per-frame loop (no allocations in hot paths) — GC pauses cause dropped
frames on Quest 2 more often than raw load does.

g) Automated feel-regression tests: script a set of "golden throws"
(fixed release velocity/spin) through the physics world headlessly or
via IWSDK's agent input simulation, and assert outcomes (stick lands
in court, kubb topples above threshold force, king stands). Run in CI.
This prevents physics tuning from silently breaking earlier feel.

## 10. Realtime multiplayer with avatars (planned major feature, post-POC)

Vision: two players share the same garden in realtime, each standing at
their own baseline. You SEE your opponent as an avatar — head and hands
move live, so waving, pointing and taunting work naturally — and you hear
each other through spatial voice chat. Each player picks an avatar
character when starting the game.

Avatar design (proven VR pattern — keep it simple):

- Replicate only what is tracked: head + two hands. The avatar is a
  stylized low-poly character rendered as head (with hat/helmet), floating
  hands, and a simple torso that follows the head — NO legs and NO IK
  (full-body avatars with bad leg IK look worse than none; head+hands
  avatars are the standard in social VR for good reason). A name tag above
  the head.
- Waving needs zero extra code: hands are already synced. Add 2-3 optional
  emote buttons later (thumbs up, applause) that trigger a hand animation.
- Avatar selection at start: the start lobby IS the garden — a small podium
  beside the court with 4-6 selectable characters (e.g. viking, gardener,
  summer outfit) plus color variants. Selection is stored in localStorage
  and replicated to the opponent and the spectator view.
- Assets: Quaternius character packs (CC0, verified — commercial use, no
  attribution): "Universal Base Characters" or "Ultimate Modular Men/
  Women" (rigged; ships as .blend/FBX — convert to GLB with Blender CLI).
  Keep each avatar ≤ 5k tris, one shared texture atlas.

Networking architecture (extends the spectator sync in section 8 — same
transport, same event bus; build them as ONE system):

- Rooms: create/join via short code, link or QR ("kubborama.app/r/GLAD-ALG").
  Friend-link-first — NO public matchmaking until there is a player base
  (the ViKubb lesson). Ghost mode (section 11) is the offline fallback.
- Transport: Trystero (see section 12) — WebRTC DataChannels P2P between
  the two headsets with serverless peer discovery (Nostr/BitTorrent/MQTT
  strategies), typed messages via makeAction(), optional E2E encryption.
  No signaling server to build, host or pay for. Note: some NATs require
  a TURN relay fallback — budget a small coturn instance if remote play
  (not just same-LAN) is a goal.
- Voice: Trystero's addStream()/onPeerStream with a microphone audio track,
  played through IWSDK spatial audio so the opponent's voice comes from
  their avatar. Mute button mandatory.
- Authority model (kubb's turn-based nature makes this EASY): the current
  thrower's headset simulates physics authoritatively and broadcasts piece
  transforms; the other player only sends presence (head/hands). Authority
  hands over with the turn. No prediction, no rollback, no conflict
  resolution needed.
- Three sync layers: presence (head/hands/avatar-id, ~20 Hz, unordered
  unreliable), piece transforms from the authority (~20 Hz, unreliable,
  interpolated), game events (reliable ordered, via the existing event bus).

Identity & accounts roadmap (verified against Meta's docs 2026-08-26):

- POC / freely-hosted PWA (now): NO Meta account access exists for plain
  web apps — WebXR provides no user identity by design. Solution: a LOCAL
  PROFILE — the player types a display name at first run (stored with the
  settings, zod-validated); it feeds the HUD, stats and later the avatar
  name tag. No accounts, no servers, no privacy surface.
- PWA installed from the Meta Horizon Store (mid-term): store-installed
  WebXR PWAs DO get platform access via the Digital Goods API:
  getLoggedInUserId() (app-scoped user id — stable per user, but an ID,
  not the display name), getUserAccountAgeCategory(), in-app purchases
  (consumables/durables; no subscriptions) and purchase history.
  Prerequisites: Meta developer org, store submission (Bubblewrap wraps
  the PWA: `bubblewrap init --manifest=[URL] --metaquest`), and a Data Use
  Checkup (DUC) approval — until DUC, identity works only for test users.
  Design consequence NOW: keep the local profile as the display-name
  source and treat the Meta app-scoped id, when it arrives, as a STABLE
  KEY to attach stats/purchases to — the versioned stats schema gets an
  optional userId field reserved from day one.
- Native store app (long-term, the Godot/Unity path): full Platform SDK —
  real Meta username, friends list, leaderboards, Meta Avatars. This is
  the only tier where Meta gives the actual NAME and social graph.
- Open-web multiplayer stays account-free by design (friend links/room
  codes) — do not build own-account infrastructure (Supabase/Firebase
  auth) unless a concrete feature demands it; local profile + Trystero
  room codes cover MP1-MP3.

Rollout phases:

- MP1 Co-presence: shared garden, avatars, voice, waving — no shared match
  yet (both throw at their own pieces). Already a great social demo.
- MP2 Shared match, casual: one court, turn authority handoff, honor-system
  turns (players just take turns like real kubb — no rule enforcement).
- MP3 Refereed match: full rules engine drives turns, throwing line, field
  kubbs — the game becomes a real refereed 1v1.
- POC prep (add to the cheap-preparations list): treat the local player's
  head and hands as ordinary ECS entities with transform components from
  day one — then "replication" is just sending the same component data the
  spectator sync already ships.

## 11. Ideas backlog (post-POC, roughly prioritized)

1. GHOST OPPONENT (async multiplayer) — the offline complement to the
   realtime multiplayer in section 10, and the answer to ViKubb's dead
   matchmaking when no friend is online. Kubb is turn-based, so record a
   friend's throws (release velocity + spin per throw is ~30 bytes) and
   let others play against their "ghost" — no servers, no simultaneous
   players needed. Share a ghost as a link/QR. A weekly seeded challenge
   (same wind + same ghost for everyone) gives a leaderboard without live
   multiplayer. Bonus: render the ghost using the same avatar system.
2. King-cam slow motion: when the king topples (win/loss), replay the
   final throw in slow-mo from the kingCam. Cheap (scale physics timestep
   during replay from the ring buffer) and a massive payoff moment.
3. Tutorial ghost hand: a translucent hand demonstrating the underarm
   end-over-end throw; kubb rules taught one concept per round.
4. Throw-legality option (tournament realism): real rules require
   underarm, vertical throws — detect controller trajectory at release
   and optionally flag "helicopter" throws. Off by default.
5. Progression/training modes: fewest-sticks challenges, moving practice
   targets, daily seed. Personal stats from the telemetry (d) above.
6. Environments: midsommar garden (birdsong, fika table), Gotland World
   Championship arena, beach, winter. Time-of-day variants of each.
7. AI opponent with tunable accuracy (aim error stddev per difficulty) +
   full rules engine (turns, field kubbs, raising, throwing line).
8. Accessibility: seated mode (rig height offset), left-hand default,
   optional throw assist (gentle velocity normalization) for beginners —
   VR throwing has a steep learning curve; assist keeps party guests happy.
9. Audio flourishes: Doppler whoosh on flying sticks, crowd murmur on the
   spectator arena, commentator barks ("Kungen står kvar!").
10. Hand tracking experiment (controller-free throwing) — research toy,
    not a product feature until Quest hand tracking handles fast releases.

## 12. External libraries — don't reinvent these wheels

(All versions/maintenance verified against npm & GitHub, 2026-08-26.)

FIRST RULE: IWSDK already bundles a lot — check its built-ins before adding
anything. Included via @iwsdk/core: three.js, Havok physics, elics (ECS),
@pmndrs/handle (grab/manipulation), @pmndrs/uikit + UIKitML (spatial UI),
@iwsdk/locomotor, @iwsdk/xr-input, three-mesh-bvh (fast raycasts/collision
queries). Never install a second physics engine, grab system or UI kit
alongside these.

Recommended additions (pre-approved — Claude Code may add these without
asking when the milestone needs them):

- vite-plugin-pwa (v1.3.0, active) — M6. Zero-config manifest + service
  worker generation. Replaces hand-writing the whole PWA layer.
- @vitejs/plugin-basic-ssl (v2.3.0) — M0, CONDITIONAL: only if `iwsdk dev`
  does not already serve HTTPS (check first) and LAN headset testing
  against the live dev server is wanted before the USB card arrives.
- tweakpane (v4.0.5) — M2 (the throw tuning lab's desktop panel), reused
  in M4 (debug panel: wind/gravity sliders, live telemetry readouts).
  In-headset controls still use IWSDK's spatial UI; Tweakpane is for the
  flat screen where tuning actually happens during development.
- TRYSTERO (v0.25.3, updated Jul 2026, MIT, 2.6k stars) — THE multiplayer
  find. Serverless WebRTC: rooms via joinRoom(appId, roomId), typed data
  channels via makeAction(), and — crucially — addStream()/onPeerStream for
  VOICE CHAT built in. Peer discovery runs over public infrastructure
  (Nostr relays by default; BitTorrent/MQTT/Firebase/Supabase strategies
  available), so NO signaling server needs to be built, hosted or paid for,
  and app data flows directly P2P with optional E2E encryption. This
  replaces the custom WebSocket signaling server planned in sections 8/10
  AND the manual WebRTC voice plumbing. Sections 8 and 10 should be read
  with "transport = Trystero" — the sync-layer design (presence/transforms/
  events) is unchanged.
- @geckos.io/snapshot-interpolation (v1.1.1) — MP/spectator. A small,
  focused snapshot-buffer + interpolation library for exactly our
  "transforms at 20 Hz, render smoothly" problem. If it feels stale at
  build time, the technique is ~200 lines to implement from its docs.
- nanoid (v6, active) — room codes and entity ids.
- qrcode (v1.5.4) — render room-join QR codes on the spectator screen and
  in-headset panel.
- camera-controls (v3.1.2, active) — smooth cinematic spectator camera
  moves (damped transitions between the named poses in config.ts).
- three.quarks (v0.17.1, active) — GPU-instanced particle system for
  three.js: topple dust, wind-indicator leaves, splashes, victory
  confetti. See section 13 for the VFX ground rules.
- vitest (v4, active) — unit tests: topple math, config presets, state
  machine transitions, event bus. See section 14 for the full strategy.
- zod (v4, active) — runtime validation of untrusted data (peer messages,
  ghosts, persisted config).
- fast-check (v4, active) — property-based tests on the pure core.
- typescript-eslint (v8) + prettier — lint/format; tsx (v4) — CLI sim
  scripts.
- playwright (v1.62, active) — CI harness for the golden-throw regression
  tests in headless Chromium, alongside IWSDK's own agent tooling.
- gltf-transform CLI + meshoptimizer/gltfpack — asset pipeline (section 3):
  GLB optimization, KTX2 texture compression, mesh compression.
- Blender CLI (tool, not npm) — FBX→GLB conversion for Quaternius avatars.

Considered and deliberately NOT chosen:

- howler.js — unmaintained since 2023 and redundant: IWSDK/three spatial
  audio covers our needs.
- PeerJS (v1.5.5) — fine library, but needs their hosted broker or your own
  PeerServer; Trystero does more (voice, serverless) with less.
- Colyseus (v0.18, active) — the right answer ONLY if we later need an
  authoritative server (anti-cheat, ranked ladders). Overkill before that.
- XState v5 — excellent but heavy for the POC's small FSMs; plain TS
  discriminated unions suffice. Reconsider when the full rules engine
  lands (game-phase logic is where statecharts start paying rent).
- @pixiv/three-vrm (v3.5.5, active) / Ready Player Me — alternative avatar
  routes (VRM-standard or user-created avatars). Interesting post-MP1 if
  players want to bring their own avatars; Quaternius CC0 is the right
  start.
- networked-aframe, meta-spatial SDKs etc. — wrong stack (A-Frame/native).

## 13. Physics capabilities & visual effects (what's built in, what isn't)

PHYSICS — built in, nothing to add:
IWSDK bundles the Havok engine (@babylonjs/havok, v1.3.14, actively
maintained) compiled to WebAssembly, running in a web worker. It provides
everything kubb gameplay needs: rigid body dynamics with configurable
gravity (our variable gravity is literally one config value), mass,
friction, restitution, collision detection, trigger volumes, raycasts,
and joints/constraints. (NOTE: no PUBLIC collision-EVENT API is exposed
— impact sounds/haptics come from our pure-core |Δv| detector instead;
see DERISK.) Wind is not a physics-engine feature anywhere — it is, as
already planned, a per-tick force we apply to Flying bodies. Verdict:
100% of the game's physics is covered; never add a second engine.

What Havok-on-web does NOT have: fluid simulation (real water), soft
bodies, cloth, destruction. None are needed — see water below.

VFX — NOT built in, and this is the real difference vs Unity/Godot:
Unity and Godot ship engine-level particle systems and water/fire nodes.
three.js/IWSDK ships none — effects are assembled from small libraries
and shaders. This is fine (our effects needs are modest) but must be
planned, not assumed:

- Particles: use three.quarks (v0.17.1, active 2026, GPU-instanced
  general-purpose particle system for three.js — added to the pre-approved
  list). Alternative: three-nebula (v13, active). Uses: dust puff when a
  kubb topples, grass/leaf flutter, splash, fire, confetti on victory.
- WATER (for a future beach/pond environment): two separate problems.
  Visual: do NOT use three.js's example Water/Reflector classes — they
  re-render the scene for reflections and will kill Quest 2 framerate.
  Use a stylized shader plane instead: scrolling normal maps or gentle
  vertex waves + fresnel tint — cheap, and fits the low-poly art style.
  Gameplay (stick lands in a pond): fake it — a trigger volume + splash
  particles (three.quarks) + "plonk" sound + either scripted sink or a
  simple buoyancy force (upward force proportional to submerged depth,
  ~20 lines against the Havok API). No fluid sim exists or is needed.
- FIRE (torches, midsommar bonfire, evening arena): flipbook/billboard
  sprites or a three.quarks preset + an emissive glow mesh. Do NOT attach
  a real-time point light per flame — fake the light with emissive
  materials and a warm baked tint; at most ONE cheap flickering light in
  a scene.
- Post-processing (bloom, DOF etc.): the `postprocessing` lib exists but
  full-screen post effects are a frame-budget killer on Quest 2 (fill
  rate). Policy: none. Fake glow with additive sprites/emissive.
- Quest 2 VFX ground rules: overdraw/fill rate is the bottleneck — a few
  huge transparent quads hurt more than many tiny ones; keep visible
  particles ≤ ~200; use additive blending sparingly; no soft particles.

POC tie-in: the garden POC needs none of this to ship — but one small
optional flourish earns its place in M4: a handful of drifting leaf
particles as a VISIBLE WIND INDICATOR (direction + strength). It's the
cheapest possible way to make the wind tunable feel real, and it
exercises the particle pipeline early.

## 14. TypeScript & testing strategy (test without the headset)

Goal: most of the game must be testable in plain Node (vitest) with no
browser, no VR, no physics engine running. This speeds up development
enormously — Claude Code gets a red/green signal in seconds instead of a
put-on-the-headset loop — and it's an architecture rule, not a tool:

FUNCTIONAL CORE, IMPERATIVE SHELL (the one rule that makes it possible):
All game logic lives in pure TypeScript modules that import NOTHING from
three.js, IWSDK or Havok — only plain data in, plain data out. The
rendering/XR/physics layers are thin adapters around this core.
Pure-core modules (all unit-testable in Node):

- topple math: isToppled(quaternion, angleThreshold) → boolean
- scoring reducer: (state, event) → state (event-bus events in,
  scoreboard out — trivially testable with event sequences)
- stick & game-phase state machines: (state, input) → state
- court layout: piecePositions(preset) → transforms (assert kubb
  spacing, king centered, mirror symmetry, all presets)
- wind force: windForce(config, bodyState) → vector (zero when not
  Flying, scales with config, correct direction)
- throw release math: frame-averaged velocity from a ring buffer of
  controller samples → release velocity+spin, INCLUDING the lever-arm
  term v_com = v_hand + ω_hand × r (feed recorded sample arrays, assert
  outputs — THE most important unit under test)
- underhand classifier: pose series + release velocity → throw style +
  flip-quality score (property test: rotating the whole throw around
  the vertical axis must not change the classification)
- config presets, room-code generation, replay ring buffer, ghost
  encoding/decoding, network message encode/validate
  Adapters (NOT unit-tested; covered by golden-throw/Playwright + manual):
  scene setup, mesh creation, Havok bindings, XR input, spatial UI, audio.

TypeScript rigor (set in M0, cheap then, expensive later):

- tsconfig: "strict": true + noUncheckedIndexedAccess +
  exactOptionalPropertyTypes. typescript-eslint (v8, active) with
  no-explicit-any as error; prettier for formatting.
- Units discipline: SI everywhere — meters, seconds, radians, kg. Suffix
  ambiguous names (speedMps, angleRad). Most physics bugs are unit bugs.
- No Math.random() in game code: inject a seedable RNG (mulberry32, ~5
  lines). Makes every test and every replay deterministic, and enables
  the seeded daily-challenge feature for free.
- Fixed timestep for game-side simulation logic; render interpolates.
  Note: Havok-in-WASM is deterministic enough per-device but do NOT
  assume cross-device bit-determinism — golden-throw tests assert RANGES
  (landed within court, kubb toppled), never exact positions.
- zod (v4, active) — runtime validation at the untrusted boundaries:
  network messages from peers (multiplayer), loaded ghosts/replays,
  persisted config. Types check compile time; zod checks runtime.
- fast-check (v4, active) — property-based tests where they pay off:
  e.g. "isToppled is rotation-symmetric around the vertical axis",
  "scoring reducer never decreases sticksThrown", "ghost decode(encode(x))
  round-trips". A handful of properties catch whole bug classes.
- tsx (v4) — run simulation scripts from the CLI (e.g. `npm run sim:throw
-- --speed 8 --angle 30`) for quick physics-free math experiments.

Test pyramid for this project:

1. vitest unit tests on the pure core (fast, hundreds, run on every
   save and in CI) ← the bulk
2. golden-throw regression via Playwright/IWSDK agent tooling (slow,
   few, run in CI) ← guards physics feel
3. manual headset checks per milestone ← guards comfort & fun, the two
   things automation can't measure

Definition of done per milestone now includes: pure-core logic of that
milestone covered by unit tests, typecheck + lint + tests green in CI.

## 15. MCP servers & tools for the Claude Code session

(Verified on npm 2026-08-26.)

Priority 1 — IWSDK's OWN MCP servers (ship with the project, no extra
install): the scaffold auto-generates .mcp.json with three servers
(iwsdk-runtime, iwsdk-reference, metavr) — 32 tools in 9 categories:
scene inspection, simulated controller input, screenshots, ECS debugging,
plus an embedded Playwright browser running the app. Two modes in the
vite config:
ai: { mode: 'collaborate' } → visible browser, human + agent share the
session (use while Erik is watching)
ai: { mode: 'agent', screenshotSize: {...} } → headless, for autonomous
runs and CI (golden-throw tests)
Setup task in M0: no manual wiring — restart Claude Code in the project
directory so .mcp.json is picked up, then verify the agent can screenshot
the scene and simulate a controller grab. This closes the loop: Claude Code can SEE
and INTERACT with the running game without a headset — use it to verify
every milestone before asking for a headset test.

Priority 2 — chrome-devtools-mcp (v1.8, Google, active):
claude mcp add chrome-devtools -- npx chrome-devtools-mcp@latest
Console errors, network, and PERFORMANCE TRACES. Extra value on this
project: the Quest browser supports remote DevTools over adb — connect it
to the app running ON THE HEADSET for the M5 performance pass (real frame
timings, not desktop guesses).

Priority 3 — context7 MCP (@upstash/context7-mcp v4, active):
claude mcp add context7 -- npx -y @upstash/context7-mcp
Fetches current, version-correct library docs into context on demand.
Worth having because IWSDK is pre-1.0 and three.js APIs shift — reduces
invented APIs. Complements (not replaces) the standing rule to read
node_modules .d.ts files.

Not needed as MCP:

- @playwright/mcp — redundant here: the IWSDK dev plugin already embeds
  Playwright. Only add if its browser control proves insufficient.
- GitHub MCP (github/github-mcp-server) — exists and is official, but the
  gh CLI via Bash covers everything this project needs, INCLUDING Pages
  configuration (`gh api -X POST repos/{owner}/{repo}/pages -f
build_type=workflow`), workflow files, releases and PR/issue work.
  Reconsider the MCP only if the project grows heavy issue/PR-driven
  workflows.
- blender-mcp — Blender CLI via Bash is enough for FBX→GLB conversion.

Plain CLI tools Claude Code should lean on via Bash: adb (device install-
less testing via `adb reverse`, logcat for headset logs, DevTools port
forward), gltf-transform + gltfpack (asset pipeline), Blender headless
(--background --python for conversions), gh (repo/CI). Document the whole
tool setup in CLAUDE.md during M0 so every future session starts wired.

PREFLIGHT: the start prompt instructs Claude Code to verify all of the
above FIRST (CLI tools via which/--version, MCP servers via `claude mcp
list`), report a pass/fail table, and — for anything missing — give exact
setup commands rather than silently working around it. The verified
versions and setup commands land in CLAUDE.md's "Toolchain & MCP" section
so future sessions re-run the same preflight quickly.

## 16. AI working strategy (how the sessions are run)

- One milestone per Claude Code session; fresh context each time. Durable
  memory lives in files: CLAUDE.md (constitution), this plan (living doc,
  updated when decisions change), GitHub issues (backlog). End-of-session
  ritual: update docs, file issues, tag milestone, write handover.
- Spec before code: each milestone starts with a short approved plan.
- Headset gates after M0/M2/M5 with structured feedback: Erik's words
  (floaty/heavy, early/late release) always paired with telemetry numbers.
- Calibration by demonstration: Erik's real throws (logged telemetry,
  10-15 throws at the M2 gate) are the ground truth for physics tuning
  and become golden regression tests. Demonstrations beat descriptions.
- Spike rule: uncertain IWSDK APIs get a time-boxed throwaway spike before
  any design is built on them; findings recorded in CLAUDE.md.
- Game-design lens check (per milestone/feature, from classic design
  fundamentals): does the player have a GOAL (purpose, a number to beat)?
  meaningful AGENCY? immediate FEEDBACK (visual + audio + haptic)? sane
  BALANCE/difficulty? and does it deepen IMMERSION? The POC's answers:
  round-based micro-goal with personal best (goal), free aiming/throwing
  (agency), klonk + haptics + meters (feedback), Simple/Advanced + tuning
  lab (balance), garden + spatial birdsong (immersion). New features that
  can't answer these questions aren't ready to build.

## 17. Build order (maps to milestones in the start prompt)

M0: scaffold → emulator runs → HTTPS deploy (GitHub Pages/Netlify) + CI.
M1: config.ts (incl. court presets + camera poses) → court.ts
(ground+lines) → pieces.ts (primitives, plain colors first) → verify
layout/scale in emulator → add textures + HDRI.
M2: core/throwRelease.ts + throwing.ts (grab/velocity transfer, stick
state machine) → haptics.ts → throw telemetry → tuning lab
(tweakpane + spatial panel) → underhand classifier + flip meter →
tune masses/friction until a thrown stick flips believably.
M3: core/topple.ts + core/scoring.ts (round loop) + core/stats.ts →
adapters + hud.ts → reset.ts (all via core/events.ts).
M4: wind.ts → settingsPanel.ts (volumes, haptics, language, game mode,
local profile, stats tab) → debugPanel.ts.
M5: audio, blob shadows, GC/pooling pass, perf pass on headset;
optional king-cam slow-mo.
M6: PWA manifest + icons + service worker (installed from the deploy URL).
