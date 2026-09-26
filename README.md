# KubbOrama

A VR prototype of the traditional Swedish lawn game **kubb**, built for
**Meta Quest 2** with WebXR. Stand on a hilltop court ringed by cliffs
and a cozy campsite, pick up a kastpinne (throwing stick), and throw it
at kubb blocks until they topple — honest release physics, real spin,
no menus in the way.

**Play now:** https://steken3344.github.io/kubborama/ (open in the
Quest browser, tap "Enter XR")

Status: early prototype (M7 — 2-headset multiplayer, confirmed working
live; MP3a — real match rules with sin-bin, score and the king deciding;
MP3b — procedural body avatars in a player-chosen color; both awaiting
the 2-headset gate). See [docs/MILESTONES.md](docs/MILESTONES.md) for
what's built and what's next.

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
