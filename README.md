# KubbOrama

A VR prototype of the traditional Swedish lawn game **kubb**, built for
**Meta Quest 2** with WebXR. Stand on a hilltop court ringed by cliffs
and a cozy campsite, pick up a kastpinne (throwing stick), and throw it
at kubb blocks until they topple — honest release physics, real spin,
no menus in the way.

**Play now:** https://steken3344.github.io/kubborama/ (open in the
Quest browser, tap "Enter XR")

Status: prototype (v0.8-mp7, 2026-09-27) — two-headset matches with
real kubb rules (field kubbs: inkast, raising, field kubbs first,
advantage line; the king decides) run on an authoritative game server
that starts with the dev server; avatars and voice between headsets.
The public GitHub Pages build still uses the headset-hosted multiplayer
until the server moves to the cloud (MP8). See
[docs/MILESTONES.md](docs/MILESTONES.md) for what's built and what's next.

## Tech stack

[Meta's Immersive Web SDK](https://iwsdk.dev) (`@iwsdk/core`) — Three.js

- an ECS, Havok physics in a web worker, built-in grab/throw
  interactions, WebXR locomotion and spatial UI. TypeScript, Vite. No
  game-engine editor — everything is code.

## Development

```sh
npm install
npm run dev
```

This runs `iwsdk dev up --open --foreground`, which starts the dev
server and opens a managed browser with the emulator scene (desktop
keyboard/mouse stand in for the headset — click "Enter XR" to try VR
mode in-browser). The dev server picks its port dynamically — trust
`npm run dev:status` for the real URL, not any number written down
here.

Other scripts:

```sh
npm run typecheck    # tsc --noEmit
npm run lint         # eslint
npm run format       # prettier --write
npm run format:check # prettier --check
npm run test         # vitest
npm run build        # production build to dist/
```

## Testing on a real Quest 2

The dev server already serves HTTPS out of the box (WebXR requires a
secure context) — no extra setup needed for options 1 and 2 below.

1. **Simplest — the deployed build.** Open
   https://steken3344.github.io/kubborama/ directly in the Quest
   browser. Always available, no dev server required.
2. **Same Wi-Fi, live dev server.** Run `npm run dev`, then
   `npm run dev:status` to get the real port. On the Quest, open
   `https://<this-computer's-LAN-IP>:<port>` and accept the self-signed
   certificate warning. Useful for iterating without redeploying.
3. **USB.** `adb reverse tcp:<port> tcp:<port>` (port from
   `npm run dev:status`), then open `https://localhost:<port>` in the
   Quest browser and accept the self-signed certificate warning — the
   dev server only ever speaks HTTPS, even on localhost, so `http://`
   gets an empty response rather than falling back. Fastest route for
   iteration since it skips Wi-Fi entirely. Requires developer mode
   enabled on the headset and "Allow USB debugging" accepted in-headset
   when first plugged in.

### Install as an app (M6)

The deployed build is an installable PWA. In the Quest browser, open
https://steken3344.github.io/kubborama/, then use the browser menu's
"Install app" / "Add to library" option (wording varies by browser
version). Once installed, KubbOrama gets its own icon in the Quest app
library and launches fullscreen, without browser chrome or the address
bar — the same experience as a native app. Updates to the deployed site
are picked up automatically the next time it's launched, no
reinstalling needed.

## Playing at home — one address (2026-10-31)

```bash
npm start
```

builds the game and starts the KubbOrama server, then prints the address
to open on both headsets, e.g. `https://192.168.1.147:8443` (accept the
self-signed certificate once). Everything comes from that one server:
the game, its configuration, the match (turns, rules, field kubbs), the
other player's avatar and the voice connection — no URL parameters, no
internet. The first headset to **enter VR** is player A. `KUBB_PORT`
changes the port. For development, `npm run dev` does the same on the
Vite dev server (port 8081) with hot reload.

**Moving around:** the left thumbstick slides you across the garden
(kept inside the trees, and during a match never past your own
throwing line), the right thumbstick snap-turns 45°. The stick and
kubb tables always stand at your baseline; when you may throw from the
advantage line it is shown in yellow, and you walk or slide up to it
yourself if you want to.

**Profiles and foot faults:** pick your name in the menu (Alternativ →
Namn) and the server remembers your colour, statistics and results
against the other player, even if the headset's browser storage is
cleared — just pick the name again. A stick released more than about
an arm's length past your throwing line is a foot fault ("Övertramp!"):
it counts as thrown and does nothing. Profiles are stored on the server
machine in `.kubb-server/profiles.json` (not committed).

**Playing alone against a bot, and time limits:** in the menu (the Match tab),
"Motståndare" puts a bot in the empty seat — easy, medium or hard (how
far its aim strays) — and it plays the other end of the court with an
avatar of its own. Someone entering VR takes the seat back from the
bot. Results against the bot are kept per level under Statistik (not in
head-to-head); if you drop out, the bot and the clock wait for you. "Tidsgräns"
(off, 20, 30 or 45 min, set before the match gets going) limits a
match: the HUD shows the time left;
when it runs out the pair of turns is finished, and whoever has fewer
kubbs left to knock down wins (level: one more pair at a time).
"Regler: Förenklade" (simplified rules, also set before the match gets
going) takes a felled field kubb — one that was tossed over — out of
play: it is laid on the grass beside the court instead of being tossed
back, so only felled baseline kubbs travel. All three are room
settings, kept until the room empties. Whoever starts a match throws
only two sticks on the opening turn (the other four wait on the other
table); every turn after that has six. "Kasthjälp" (Av / Lite / Mycket,
per headset) bends a near miss part of the way towards a kubb you may
aim at. On the backyard court
the half you toss your inkast into is outlined on the grass while it is
your inkast.

**Watching on a TV or computer:** open the same address in an ordinary
browser (no headset). You get a live broadcast: a camera tour while
nobody plays, then an automatic director cutting between angles and a
scoreboard. "Fri kamera" (or dragging) lets you look around yourself. "Helskärm" (or the F key) fills the screen.
Spectators never take a seat.

**Testing without headsets:** with the dev server up
(`npx iwsdk dev up --no-open`), `npm run botmatch` plays scripted rule
cases against its game server: player A is the real app in a browser,
player B a protocol bot, and a spectator films (screenshots at every
camera cut). Scenarios: `foot-fault`, `early-king`, `inkast-miss`,
`advantage`, `win`, `room` (`-- --scenario <name>`, default all).
`npm run botmatch:series` plays 20 whole matches with different skill
levels, courts and languages and writes a summary table. Each
row is PASS (it happened and the server's and player A's logs prove
it), FAIL (it happened but a proof is missing) or NOT SEEN (physics
didn't get there in the time box).

**Which build is running:** the loading screen and the top-right corner
of the page show the build, e.g. `#193 · 2026-10-31 20:40 · 0226a37`
(build number = commit count, `+` for uncommitted changes, then build
time and commit). The settings menu in VR shows the same.

## Debug mode (live logs from a headset)

The Quest browser's console is unreachable from outside, so the app can
ship its structured logs to the dev server instead. Dev server only —
the production build has no relay.

1. Start the dev server (`npm run dev`), note the port from
   `npm run dev:status`.
2. On the headset, open the app with `?debug=1` appended to the URL
   (e.g. `https://localhost:<port>/?debug=1` over USB, or the LAN URL over
   Wi-Fi), **or** toggle "Debug: På" in the settings tab of the in-game
   menu — it persists.
3. On the computer: `npm run debug:tail` (optionally filter:
   `npm run debug:tail -- net`, `-- guest`). Raw NDJSON lives in
   `.iwsdk/runtime/logs/kubb-debug.ndjson` (gitignored).

Every line carries the client id and its host/guest role, so two headsets
posting to the same server interleave into one timeline. Debug mode also
turns on a below-ground stick watchdog and per-second network counters.

**From the dev server, no parameters are needed** (2026-09-27): debug
mode is always on, the game server is used automatically (`?server=0`
to fall back to the headset-hosted Trystero game, `?server=1` to force
the server), and the default room is the private `kubborama-dev` — so
the bare LAN URL `https://<LAN-IP>:<port>` is the whole setup.

`?room=<name>` and `?debug=1` are **remembered** after one visit, so a
bookmark of the bare LAN URL (`https://<LAN-IP>:<port>`) rejoins the same
room with debug on. Use a room name without punctuation (the Quest
keyboard turns `-` into `—`); `?room=kubborama-lobby` returns to the
public lobby.

### Gate report (headset tests without watching)

1. `npm run gate:new` — archive the old log so the session starts empty.
2. Both headsets open the bookmark and just play.
3. `npm run gate:report -- --watch` — the gate checklist (MP3a, MP3b,
   gh#15/#16) as PASS / FAIL / NOT SEEN, updated live, with the log line
   that proves each verdict and a host/guest sync check. Only the EYES
   items at the bottom need a human answer. `--since HH:MM` limits it to
   part of the file.

## Project layout

See the generated `CLAUDE.md` for IWSDK-specific project conventions
(scene/asset/component modules, the functional-core rule, etc.) and
[docs/PLAN.md](docs/PLAN.md) for the full implementation plan
(geometry, physics parameters, asset sources, module architecture).

## License

No license file yet — all rights reserved by default until one is
chosen.
