# KubbOrama

A VR prototype of the traditional Swedish lawn game **kubb**, built for
**Meta Quest 2** with WebXR. Stand in a garden, pick up a kastpinne
(throwing stick), and throw it at kubb blocks until they topple —
honest release physics, real spin, no menus in the way.

**Play now:** https://steken3344.github.io/kubborama/ (open in the
Quest browser, tap "Enter XR")

Status: early prototype (M4 — wind, game modes, settings panel). See
[docs/MILESTONES.md](docs/MILESTONES.md) for what's built and what's
next.

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
3. **USB (once available).** `adb reverse tcp:<port> tcp:<port>` (port
   from `npm run dev:status`), then open `http://localhost:<port>` in
   the Quest browser — localhost is a secure context on its own, and
   this route is fastest for iteration since it skips Wi-Fi entirely.
   Requires developer mode enabled on the headset.

## Project layout

See the generated `CLAUDE.md` for IWSDK-specific project conventions
(scene/asset/component modules, the functional-core rule, etc.) and
[docs/PLAN.md](docs/PLAN.md) for the full implementation plan
(geometry, physics parameters, asset sources, module architecture).

## License

No license file yet — all rights reserved by default until one is
chosen.
