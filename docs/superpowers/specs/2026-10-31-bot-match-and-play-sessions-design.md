# Bot match and emulator play sessions — design

Date: 2026-10-31. Erik: "vill att vi får till att du gör mer tester och
förbättrar upplevelsen, enligt regelverket men också grafiska buggar och
förbättringar gällande grafik". He chose: both a recurring bot match and
my own emulator play sessions; a hybrid bot match (one browser player,
one protocol bot); rule bugs and plain graphical faults are fixed at
once, look-and-feel ideas wait for his approval.

## Why

Headset tests rarely play a match to the end, so about twenty gate
checks stay "NOT SEEN" (early king, win and restart, missed inkast,
advantage line, foot fault, Ny runda from either side, court switch).
Rules live in the server and can be played by a machine; how it looks
can be checked by me in the emulator. Erik's headset time then goes to
feel, comfort and looks.

## Part 1 — the bot match (`npm run botmatch`)

```
npm run botmatch [-- --scenario <name>|all] [--url https://localhost:8081/]
```

Runs against the Vite dev server by default (its game server), never the
production server unless `--url` points there (only when nobody plays).

- **Player A — a real browser** (headed Chromium when `DISPLAY` is set,
  `?player=1&debug=1`). It throws through the app's own event bus
  (`Thrown` with an aimed release, as `check:server` does), tosses inkast
  kubbs through the server link and presses room actions through the
  same events the menu emits. This exercises the client: HUD, avatars,
  gate probes, notices.
- **Player B — a protocol bot** (`scripts/botmatch/protocolBot.ts`, run
  with tsx). It speaks protocol v3 with the shared zod schemas from
  `src/core/serverProtocol.ts`: join, a scripted presence stream (head and
  hands standing behind its line, so A and the spectator see a body),
  throws, inkast tosses, `reset` and `setGameMode`.
- **Spectator** — `scripts/spectate.mjs` with a new `--on-cut` option
  that also saves a screenshot at every camera cut, so the key moments
  are on file.
- **Aiming** — pure `aimRelease(from, target, flightTimeS)` in
  `src/core/aim.ts` (TDD): the ballistic release velocity to land on a
  point, plus the stick spin the existing throws use. Physics varies, so
  a scenario never assumes one throw does it.
- **Scenarios** (`scripts/botmatch/scenarios.ts`) — each a small policy
  that reads the server's match state and decides the next throw. It
  retries until its target event is seen in the server's gate lines or
  its time box runs out:
  1. `win` — fell all of B's kubbs, then the king: win, auto restart
     after ~10 s with the host starting.
  2. `early-king` — hit the king while kubbs stand: the thrower loses.
  3. `inkast-miss` — B tosses out twice: retry, then the house-rule clamp.
  4. `advantage` — a field kubb left standing: advantage line shown, A
     teleported onto it.
  5. `foot-fault` — a release past the line: stick sin-binned, "Övertramp!"
     notice on A.
  6. `room` — "Ny runda" from host and from guest, and a court switch
     reaching A.
  7. `king-6th` — the king decided by the sixth stick.
- **Report** — per scenario PASS / FAIL / NOT SEEN with the evidence
  line, the gate report over the run, and the list of spectator
  screenshots. Exit code 1 on any FAIL.

## Part 2 — my emulator play sessions

In the managed IWSDK browser with the emulated Quest 3, following
`docs/playtest-checklist.md`: the view from both baselines, HUD
readability, the opponent's avatar, grabbing and throwing several
sticks, every menu tab, court switch, advantage line, sin bin, flicker /
z-fighting / clipping / overflowing text, frame time from render stats.
Done after every visual change and once per larger feature, time-boxed.
Screenshots stay in the scratchpad (small, text-first per the token
rules).

## Findings

- Rule bugs and plain graphical faults (clipping, z-fighting, unreadable
  or overflowing text, wrong colours, missing pieces): fixed at once,
  with a test where the core is involved, logged in DECISIONS.
- Look-and-feel ideas: `docs/IMPROVEMENTS.md` — one line each, why, and
  what I saw. Erik approves; approved items get built, rejected ones are
  struck through.

## Routine

Before a headset test: `npm run botmatch -- --scenario all` on the dev
server. While Erik plays on 8443: the spectator watches (see
`scripts/spectate.mjs`). After the test: one report — server and headset
log, spectator screenshots, bot-match result, proposed fixes.

## Tests first

`aimRelease` (lands within a few cm in vacuum for both sides and court
sizes; flight time bounds), the scenario policies as pure functions of
match state (which target next), and the bot's message building against
the zod schemas. The bot match itself is the integration test.

## Out of scope

Judging throw feel, haptics, comfort or Quest performance (headset
only); a bot playing through the emulator's controllers (too slow and
flaky for a recurring test — my play sessions cover that path); CI runs
of the bot match (needs a GPU-backed browser; local only for now).
