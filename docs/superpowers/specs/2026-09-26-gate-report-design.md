# Gate report + host/guest sync check — design

Date: 2026-09-26 · Approved by Erik in chat ("ser bra ut, skriv spec och kör").

## Problem

Headset gates (MP3a, MP3b, gh#15/gh#16 checks) need Erik to play, watch
and report at once, alone, with two headsets that fall asleep when taken
off and URLs that are painful to type on the Quest keyboard. The debug
relay (src/debug/debugRelay.ts → `.iwsdk/runtime/logs/kubb-debug.ndjson`)
already ships every log line from both headsets to one file with a
shared server clock (`receivedAt`). What is missing is (a) log lines
that answer the checklist directly and (b) a tool that turns the file
into a verdict.

Goal: **Erik only plays.** The log answers every checklist item it can;
only genuinely visual judgments are left as yes/no questions at the end.

## Parts

### 1. Gate probes (app side, debug mode only)

A new `gate` log channel. Every probe is a no-op unless
`debugContext.enabled` (zero cost in normal play and in production,
where the relay does not exist). Probes live where the fact is known;
most live in one new adapter, `systems/gateProbe.ts` (GateProbeSystem),
which only subscribes to existing events — gameplay systems get at most
a one-line log call.

| Probe (message) | Where | Data |
|---|---|---|
| `mode adopted` | multiplayer.ts (exists as `[net] adopting the host's game mode`; re-tagged `gate`) | hostMode, ownMode |
| `mode released` | settings.ts releaseMatchGameMode | restoredMode |
| `mode button pressed` | menu.ts game-mode button | locked, gameMode |
| `round summary` | GateProbeSystem on RoundEnded | mySide (or solo), matchTurn, byOpponent, statsRecorded, roundsPlayedBefore/After, sticksThrown, kubbsFelled, kingFelled |
| `sin-bin after round` | GateProbeSystem on Reset{roundEnd}, after MatchRules ran | felledKubbIds per side (the client's own MatchState copy) |
| `king decision` | GateProbeSystem on MatchStateChanged when winner goes null→set | winner, endReason, mySide, stickNumberInRound (1–6, counted from Thrown + ThrowRelayed since the last Reset) |
| `match restart` | matchRules.ts auto-restart (exists as `[state] match auto-restart`; add data) | secondsSinceFinished, nextTurn |
| `reset pressed` | menu.ts "Ny runda" button (the line's role says which headset) | — |
| `match state` | GateProbeSystem on every MatchStateChanged | mySide, turn, winner, endReason, felled counts, fresh |
| `avatar color` | settings change (sent) + peerAvatar.ts (received) + hud.ts (digit tinted) | colorIndex/color, side |
| `avatar fit` | peerAvatar.ts, at most 1 Hz per peer | per arm: armEndToHandM; handSizeM; maxTorsoYawRateRadS and maxHeadPitchRad over the last second |

`avatar fit` is computed by a pure `core/avatarFit.ts` (plain data in,
numbers out, TDD) from the solver's existing `AvatarPose` + input +
dims, so no numbers are invented in the adapter.

### 2. Sync snapshot

GateProbeSystem logs `[gate] sync snapshot` once per second on every
client in a match: matchTurn, winner, score {host, guest}, felledKubbIds,
gameMode, and the kubb + king positions rounded to 0.05 m (11 pieces,
read from the Resettable query; one payload per second, debug only —
the relay keeps the object until it flushes, so it cannot be reused). No snapshot in solo play.

### 3. `npm run gate:report` (scripts/gate-report.mjs)

Reads the NDJSON file and prints the checklist. Options:
`--since HH:MM` (default: the whole file), `--watch` (re-render every
2 s so progress can be followed during play). `npm run gate:new`
archives the current file to `kubb-debug.<timestamp>.ndjson` so a test
session starts empty.

Each item is **PASS**, **FAIL** (with the offending line) or **NOT
SEEN** (never exercised), plus **EYES** items printed last as questions
(English output, per the project's language rule):

| Id | Check | Rule |
|---|---|---|
| gh15-adopt | guest plays on the host's court | a `mode adopted` line, or both clients' snapshots show the same gameMode throughout |
| gh15-release | guest's own mode returns | `mode released` after the last peer left |
| gh15-lock | mode button locked in a match | every `mode button pressed` during a match has locked=true |
| gh16-host | opponent turn not in host stats | host `round summary` with byOpponent=true has statsRecorded=false and roundsPlayedAfter = roundsPlayedBefore |
| gh16-guest | guest's own turn in guest stats | guest `round summary` with byOpponent=false has statsRecorded=true |
| mp3a-sinbin | felled kubbs stay across rounds | per client, each `sin-bin after round` list is a superset of the previous one within the same match |
| mp3a-score | score on both | sync check below finds no score disagreement |
| mp3a-king-early | king early = loss | a `king decision` with endReason=kingFelledEarly whose winner is the non-thrower |
| mp3a-king-win | king after all kubbs = win | a `king decision` with endReason=allKubbsAndKing whose winner is the thrower |
| mp3a-king-6th | king decided by the 6th stick | a `king decision` with stickNumberInRound=6 |
| mp3a-restart | auto-restart ~10 s, host starts | `match restart` with secondsSinceFinished in [9, 12] and nextTurn=host |
| mp3a-reset-host / -guest | "Ny runda" from either headset | a `reset` requestedBy=host and one requestedBy=guest, each followed by a fresh match state on both |
| mp3b-avatar | both see a body | `peer avatar created` on both clients |
| mp3b-arms | arm ends at the mitten | every `avatar fit` armEndToHandM ≤ handSizeM / 2 |
| mp3b-torso | no torso twitch on look-up | in `avatar fit` lines with maxHeadPitchRad ≥ 1.0, maxTorsoYawRateRadS ≤ 3.0 |
| mp3b-color | color change reaches the other side + HUD | a `avatar color` sent on one client followed within 3 s by received + digit tinted on the other, and the sender's own digit tinted |
| sync | host and guest agree | see below |
| EYES | proportions look right; visor sits on the head; two-span score row lays out | asked, not checked |

**Sync check.** Snapshots are paired host↔guest by nearest `receivedAt`
(within 1.5 s). A field disagreeing in 3 or more consecutive pairs is
one incident (short network lag is not). Positions disagree when any
piece differs by more than 0.15 m. The report prints the incident count
and, per incident, the field, time span and both values.

The rule logic is pure functions in `scripts/gate/checks.mjs`, unit
tested with vitest on hand-written NDJSON fixtures; the script itself is
only file reading and printing. Thresholds live in one constants block
at the top of `checks.mjs`, next to the rules that use them.

### 4. Short URL

`?room=<id>` and `?debug=1` are remembered in settings (new
`roomId: string | null`, `.default(null)` for migration; `debugRelay`
already exists) — after one visit, `https://<LAN-IP>:8081` alone
rejoins the same room with debug on, so a bookmark is enough.
`?room=kubborama-lobby` returns to the public lobby; the settings-tab
Debug button still turns debug off.

## Out of scope

Automatic headset control (adb: keep-awake, opening URLs) — the Quest 3
exposes no adb interface right now (docs/DECISIONS.md 2026-09-26).
Recording or replaying sessions. Anything in the production build.

## Testing

- TDD: `core/avatarFit.ts`, `scripts/gate/checks.mjs` (every rule: a
  passing, a failing and a not-seen fixture; the sync pairing incl. a
  transient 1–2 pair lag that must NOT be an incident).
- Settings migration test: an old settings JSON without `roomId` still
  decodes with every other value kept.
- Emulator: with `?debug=1`, solo play produces `round summary` lines
  and no sync snapshots; `gate:report` on that file prints the solo
  items as NOT SEEN without crashing; zero console errors. tsc, lint,
  full tests, build + smoke.
