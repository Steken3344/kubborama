# Server-owned player profiles and foot faults — design

Date: 2026-10-31. Erik: "finns det fler saker som servern skulle äga?
… färgen på headsetet borde kunna komma ihåg … Upplever att man kan gå
förbi baslinjen någon meter, känns som man kan göra övertramp." He
chose: **the server judges foot faults**, and **the server keeps colour,
name and statistics** per player.

## 1. Foot faults

Today the walk limit lets the HEAD lean 0.5 m past the throwing line,
and the arm reaches ~0.6 m further — a stick can leave the hand about a
metre over the line.

- `lineLeanAllowanceM` 0.5 → **0.2** (walking and leaning stop sooner).
- The **server** checks every stick release: the thrower's line is
  `standingLineZ` (baseline, or advantage line while throwing from it).
  A release more than `footFaultReachM` (**0.9 m**: 0.2 m lean + an
  arm) past it is a **foot fault** (pure `isFootFault` in
  `core/walkArea.ts`, tunables in `src/data/locomotion.json`).
- Effect (as in kubb rules: the stick counts, it does nothing): the
  stick is counted as thrown, never simulated, and laid straight in the
  sin bin beside the court; a gate line `foot fault` is logged.
- Both headsets are told (`notice { kind: 'footFault', side }`): the HUD
  shows "Övertramp!" for two seconds and the thrower gets a haptic buzz.

## 2. Player profiles on the server

A browser cannot read a headset's hardware id; each headset already
sends a random `clientId` kept in its local storage — which is lost when
the address changes (why both headsets were red again on port 8443).

- **Profile = a name** from the menu's list (Erik, Gäst, …; no free
  text). Choosing a name claims that profile: the server remembers
  `clientId → name`, so the headset gets it back on every join. Without
  a name a headset has an anonymous profile keyed by its `clientId`.
  If the browser storage is ever lost, picking your name again brings
  everything back.
- **Stored on the server** in `.kubb-server/profiles.json` (git-ignored,
  never committed — names only from the fixed list, no other personal
  data): per profile `colorIndex`, lifetime `stats` (the existing
  `core/stats.ts` schema) and head-to-head results
  (`{ opponentName: { won, lost } }`).
- **Colours**: the server stores each player's choice and hands out the
  shown colours for the room (`colors { host, guest }`, the existing
  clash rule in `core/avatarColors.ts`), so avatar and HUD follow the
  server.
- **Statistics**: the server folds each finished round into the
  thrower's profile (`recordRound`, gh#16 semantics) and a finished
  match into both players' head-to-head; it sends the updated profile to
  that headset (`profile { name, colorIndex, stats, headToHead }`). In
  server mode the headset no longer writes stats itself; the Statistik
  tab shows the server's numbers plus a row "Mot <namn>: 3–2".
- Protocol v3: client `setProfile { name | null }`, `setColor
{ colorIndex }`; server `profile`, `colors`, `notice`.
- The serverless mode (GitHub Pages) keeps local colour and stats.

## Tests first (server and core)

Profile store (load/save, corrupt file → fresh store, claim by name,
anonymous by clientId), round and match recording into profiles, colour
assignment with a clash, foot-fault judging (both sides, advantage
line, practice), protocol validation, and a GameServer integration test
(join → `profile` + `colors`; foot-faulted throw → `notice` and the
stick counted). Then the headless two-player check and the headset.

## Out of scope

Free-text names, accounts or passwords, more than two players, moving
existing local stats into the server (they start from zero on the
server; the local numbers stay visible in serverless mode).
