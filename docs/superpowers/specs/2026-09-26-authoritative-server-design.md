# Authoritative game server — design (MP5–MP8)

Date: 2026-09-26 · Approved by Erik in chat ("ja, skriv spec och kör
spiken").

## Why

Today the first headset in the room is the host: it runs the shared
physics and the match. When that headset sleeps (taken off, proximity
sensor), the whole game freezes for everyone — found in the MP4 headset
session (docs/DECISIONS.md 2026-09-26). Erik wants a server that owns
the game state. The serverless Trystero choice (PLAN §12) was made for
zero hosting and zero secrets; this spec deliberately reverses it for
game state, keeping Trystero for voice and presence.

Erik's choices: a **full authoritative server** (own physics, not a
headless browser host, not a state-only server); **run it on the dev
computer first**, cloud later.

## Architecture

- **Server** (`server/`, Node 22, TypeScript, started by `npm run dev`
  alongside Vite): the single authority for
  - physics — Havok WASM (`@babylonjs/havok`, the same engine IWSDK uses
    in the browser), bodies built from `public/scenes/*.iwsdk.scene.json`
    PhysicsShape/PhysicsBody data and the dimensions in `src/data/`;
    fixed timestep;
  - rules — `src/core/*` imported unchanged (reducer v3, inkast, topple,
    rest state, scoring, round end);
  - time — turns, quiet-court round end, restart, and a visible "waiting
    for player X" when a client stops sending.
- **Transport**: WebSocket (`wss`, same origin as the dev server in
  development) for game state: ~20 Hz piece snapshots, match state on
  change, and client → server intents (grab/release with release
  velocities, "Ny runda", game mode). zod-validated both ways (untrusted
  boundary). **Voice and avatar presence stay on Trystero**, peer to
  peer.
- **Clients**: every headset is a player; the server assigns side A/B by
  join order. Local physics only predicts the local player's own throw
  (as the guest does today) and is reconciled by server snapshots. A
  sleeping headset pauses only itself.
- **Solo** stays fully local (no server needed).

## Milestones

1. **Spike** (throwaway, time-boxed): Havok in Node, the court + a stick
   built from the scene data, the same release velocities thrown in the
   browser (IWSDK) and in Node — do landing point and flight time agree
   within the tolerances physics tests use (ranges, never exact)?
   Findings → docs/DECISIONS.md. A "no" stops the plan here.
2. **MP5 — server skeleton**: process, WebSocket protocol, physics world,
   snapshots; headless clients connect and see the same court.
3. **MP6 — authority on the server**: throws, inkast, topple, rounds and
   the full match from the server; clients thin; gate report unchanged
   (same log lines).
4. **MP7 — headset gate** (includes the pending MP4 field-kubb gate).
5. **MP8 — cloud**: hosting, rooms/lobby, no secrets in the repo.

## Out of scope now

Matchmaking beyond a room code, spectators, persistence of stats on the
server, anti-cheat beyond schema validation.
