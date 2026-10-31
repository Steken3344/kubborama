# One address: a standalone KubbOrama server — design

Date: 2026-10-31 · Erik: "jag vill alltså bara surfa in på en adress, då
skall headseten få själva spelet och konfigurationen var servern är …
se till att mycket logik ligger i servern … servern styr, vems tur det
är o.s.v., hjälper headseten att hitta varandra … unit tester på servern
så den blir stabil innan vi testar med headset." Headsets are always on
the home network, so no cloud (MP8-cloud parked).

## Goal

`npm start` on the computer prints one address, e.g.
`https://192.168.1.147:8443`. A headset opens it and gets everything
from that one server: the game (the production build), the
configuration (server mode, room, debug), the match (already on the
server since MP6), the other player's avatar and **the voice
connection** — with no Trystero/Nostr dependency in server mode.

## Parts

1. **Standalone server** — `server/main.ts`, bundled with esbuild to
   `dist-server/main.mjs` (`npm run build:server`); `npm start` = build
   the app + the server, then run it. One HTTPS server (port 8443,
   `KUBB_PORT` to change; the self-signed certificate is the one the
   dev server already uses, `.iwsdk/https/`, via `@vitejs/plugin-basic-
   ssl`'s `getCertificate`) serving:
   - the built game from `dist/` (static files, correct MIME types, no
     path traversal, index fallback);
   - `GET /__kubb/config.json` — `{ server: true, protocol, room, debug }`;
   - `POST /__kubb/log` — the debug relay, same NDJSON file as today;
   - the game WebSocket `/__kubb/game` (unchanged GameServer).
   The request handling is one testable module shared with the Vite dev
   plugin (DRY: the dev server serves the same config and log routes).
2. **The client asks the server** — at boot, before the world is built,
   `fetch('/__kubb/config.json')`. Present → server mode, room and debug
   from the server. Absent (GitHub Pages) → the old serverless mode.
   Replaces the `import.meta.env.DEV` guesses, so the production build
   served by `npm start` plays through the server with debug on.
   `?server=0/1` still forces.
3. **The server introduces the headsets (voice)** — WebRTC audio between
   the two headsets with the game server as the signaling channel:
   client → `signal { data }`, server → the other seat `signal { side,
   data }` (offer/answer/ICE, size-capped, only between seated players).
   Side A makes the offer when both are seated. LAN only, so no STUN.
   In server mode MultiplayerSystem no longer joins a Trystero room;
   mic capture and the mute setting are reused.
4. **Server stability first** — unit/integration tests in vitest before
   any headset test: HTTP handler (static, traversal, MIME, config, log),
   the standalone server booted on a random port with real WebSocket
   clients (join, sides, a throw, match messages, signaling relay,
   rejoin), protocol rejection cases, and more MatchHost scenarios (a
   full match to a king win, reset during the inkast, practice → match
   mid-round). Plus the headless `npm run check:server` against the
   standalone server.

## Out of scope

Cloud hosting, TURN/STUN, more than two players per server, the small
bugs gh#25/26/27 (later, by Erik's call).
