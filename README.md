# KubbOrama

A VR prototype of the traditional Swedish lawn game **kubb**, built for
**Meta Quest 2** with WebXR. Stand on a hilltop court ringed by cliffs
and a cozy campsite, pick up a kastpinne (throwing stick), and throw it
at kubb blocks until they topple — honest release physics, real spin,
no menus in the way.

**Play now:** https://steken3344.github.io/kubborama/ (open in the
Quest browser, tap "Enter XR")

Status: early prototype (M7 — 2-headset multiplayer, confirmed working
live; MP3a — real match rules with sin-bin, score and the king deciding,
awaiting the 2-headset gate). See [docs/MILESTONES.md](docs/MILESTONES.md)
for what's built and what's next.

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

## Project layout

See the generated `CLAUDE.md` for IWSDK-specific project conventions
(scene/asset/component modules, the functional-core rule, etc.) and
[docs/PLAN.md](docs/PLAN.md) for the full implementation plan
(geometry, physics parameters, asset sources, module architecture).

## License

No license file yet — all rights reserved by default until one is
chosen.
