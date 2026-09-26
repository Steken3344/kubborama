# Gate Report Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Headset gates answer themselves from the debug-relay log: probes in the app, a host/guest sync snapshot, and `npm run gate:report` that prints PASS / FAIL / NOT SEEN / EYES per checklist item.

**Architecture:** Probes are `log('info', 'gate', …)` calls, only shipped when the debug relay is on. Most live in one new event-driven adapter (`systems/gateProbe.ts`); the rest are one-liners where the fact is known. All verdict logic is pure JS in `scripts/gate/checks.mjs` (vitest), the CLI only reads the file and prints. Spec: docs/superpowers/specs/2026-09-26-gate-report-design.md.

**Tech Stack:** TypeScript (strict, noUncheckedIndexedAccess, exactOptionalPropertyTypes), IWSDK ECS, zod, vitest, Node 22 ESM scripts.

## Global Constraints

- English for all code, comments, identifiers, log messages and report output (CLAUDE.md). Report statuses: `PASS`, `FAIL`, `NOT SEEN`, `EYES`.
- `src/core/*` imports no three.js/IWSDK.
- Probes are no-ops unless `debugContext.enabled`; no per-frame allocation (the 1 Hz snapshot payload is allocated once per second, only in debug mode — the relay keeps the object until it flushes).
- Thresholds (verbatim from the spec): pairing window 1.5 s; incident = ≥ 3 consecutive disagreeing pairs; position tolerance 0.15 m; positions rounded to 0.05 m; restart window [9, 12] s; torso check applies when maxHeadPitchRad ≥ 1.0 and requires maxTorsoYawRateRadS ≤ 3.0; arm check armEndToHandM ≤ handSizeM / 2; color propagation within 3 s; reset → fresh match state within 3 s.
- Log line shape on disk (vite.config.ts relay): `{level, channel, message, data, timeMs, client, role, receivedAt}`; one JSON per line.
- Verification before "done": `npx tsc --noEmit`, `npx eslint src --quiet`, `npx prettier --check src scripts`, `npx vitest run --reporter=dot`, `npm run build`, `npm run smoke`.

## File map

- Create `src/core/avatarFit.ts` (+ test) — arm-end/hand distance and the 1 Hz fit window.
- Modify `src/core/quat.ts` (+ test) — `pitchFromQuaternion`.
- Modify `src/core/log.ts` — `'gate'` channel.
- Modify `src/core/settings.ts` (+ test) — `roomId`, `urlSettingOverrides`.
- Create `src/systems/gateProbe.ts` — round summary, match state, sin-bin after round, king decision, sync snapshot.
- Modify `src/systems/{settings,menu,multiplayer,matchRules,peerAvatar,hud}.ts`, `src/index.ts`.
- Create `scripts/gate/checks.mjs` (+ `checks.test.mjs`), `scripts/gate-report.mjs`, `scripts/gate-new.mjs`; modify `package.json`.

---

### Task 1: Pure avatar fit + head pitch

**Files:**
- Create: `src/core/avatarFit.ts`, `src/core/avatarFit.test.ts`
- Modify: `src/core/quat.ts`, `src/core/quat.test.ts`

**Interfaces:**
- Produces: `pitchFromQuaternion(q: Quat): number` (rad, + = looking up); `armEndToHandM(shoulder: Vec3, arm: Segment, hand: Vec3): number`; `interface FitWindow`; `emptyFitWindow(): FitWindow`; `addFitSample(w: FitWindow, s: FitSample): void` (mutates); `FIT_WINDOW_MS = 1000`.

- [ ] **Step 1: Failing tests**

Append to `src/core/quat.test.ts` (add `pitchFromQuaternion` to its import from `./quat.js`):

```ts
describe('pitchFromQuaternion', () => {
  it('is 0 looking straight ahead', () => {
    expect(pitchFromQuaternion([0, 0, 0, 1])).toBeCloseTo(0);
  });
  it('is +θ after rotating +θ about X (looking up)', () => {
    expect(pitchFromQuaternion(fromAxisAngle([1, 0, 0], 1.2))).toBeCloseTo(1.2);
  });
  it('ignores yaw', () => {
    expect(pitchFromQuaternion(fromAxisAngle([0, 1, 0], 2))).toBeCloseTo(0);
  });
});
```

Create `src/core/avatarFit.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { addFitSample, armEndToHandM, emptyFitWindow } from './avatarFit.js';
import { solveAvatarPose } from './avatarPose.js';
import type { AvatarDims } from './avatarPose.js';

const dims: AvatarDims = {
  neckM: 0.2, torsoHeightM: 0.5, torsoWidthM: 0.35, torsoDepthM: 0.2,
  shoulderWidthM: 0.4, armRadiusM: 0.03, headRadiusM: 0.1, handSizeM: 0.1,
  yawSmoothingS: 0.2,
};
const id = [0, 0, 0, 1] as const;

describe('armEndToHandM', () => {
  it('equals the mitten inset for a normal reach', () => {
    const pose = solveAvatarPose(
      {
        head: { position: [0, 1.7, 0], quaternion: [...id] },
        leftHand: { position: [-0.4, 1.0, -0.4], quaternion: [...id] },
        rightHand: { position: [0.4, 1.0, -0.4], quaternion: [...id] },
        torsoYawRad: 0,
      },
      dims,
    );
    expect(
      armEndToHandM(pose.leftShoulder, pose.leftArm, [-0.4, 1.0, -0.4]),
    ).toBeCloseTo(dims.handSizeM / 2);
  });
});

describe('addFitSample', () => {
  it('tracks maxima and the torso yaw rate (wrapping at ±π)', () => {
    const w = emptyFitWindow();
    addFitSample(w, { atMs: 0, torsoYawRad: 3.1, headPitchRad: 0.2, leftArmEndToHandM: 0.05, rightArmEndToHandM: 0.04 });
    addFitSample(w, { atMs: 100, torsoYawRad: -3.1, headPitchRad: 1.1, leftArmEndToHandM: 0.03, rightArmEndToHandM: 0.06 });
    expect(w.startMs).toBe(0);
    expect(w.maxHeadPitchRad).toBeCloseTo(1.1);
    expect(w.maxLeftArmEndToHandM).toBeCloseTo(0.05);
    expect(w.maxRightArmEndToHandM).toBeCloseTo(0.06);
    // 3.1 → -3.1 is a 0.083 rad step the short way, over 0.1 s.
    expect(w.maxTorsoYawRateRadS).toBeCloseTo((2 * Math.PI - 6.2) / 0.1, 3);
  });
});
```

- [ ] **Step 2:** `npx vitest run --reporter=dot src/core/quat.test.ts src/core/avatarFit.test.ts` → FAIL (not exported / module missing).

- [ ] **Step 3: Implement**

Append to `src/core/quat.ts`:

```ts
/** Pitch of the view direction (-Z rotated by q), + = looking up. The
 * y of the rotated forward vector is 2(wx − yz); asin gives the angle
 * above the horizon (clamped against float drift past ±1). */
export function pitchFromQuaternion(q: Quat): number {
  const [x, y, z, w] = q;
  return Math.asin(Math.max(-1, Math.min(1, 2 * (w * x - y * z))));
}
```

Create `src/core/avatarFit.ts`:

```ts
import type { Segment } from './avatarPose.js';
import type { Vec3 } from './vec3.js';

/**
 * Gate-report numbers for the MP3b avatar (docs/superpowers/specs/
 * 2026-09-26-gate-report-design.md): measured from the solver's own
 * output so the headset log can answer "does the arm end at the
 * mitten" and "does the torso twitch on a look-up" without anyone
 * watching.
 */
export const FIT_WINDOW_MS = 1000;

/** A segment is centred between its start (the shoulder) and its end,
 * so end = 2·centre − shoulder; returns |end − hand|. */
export function armEndToHandM(shoulder: Vec3, arm: Segment, hand: Vec3): number {
  return Math.hypot(
    2 * arm.position[0] - shoulder[0] - hand[0],
    2 * arm.position[1] - shoulder[1] - hand[1],
    2 * arm.position[2] - shoulder[2] - hand[2],
  );
}

export interface FitSample {
  atMs: number;
  torsoYawRad: number;
  headPitchRad: number;
  leftArmEndToHandM: number;
  rightArmEndToHandM: number;
}

export interface FitWindow {
  startMs: number | null;
  lastAtMs: number | null;
  lastTorsoYawRad: number;
  maxTorsoYawRateRadS: number;
  maxHeadPitchRad: number;
  maxLeftArmEndToHandM: number;
  maxRightArmEndToHandM: number;
}

export function emptyFitWindow(): FitWindow {
  return {
    startMs: null,
    lastAtMs: null,
    lastTorsoYawRad: 0,
    maxTorsoYawRateRadS: 0,
    maxHeadPitchRad: -Infinity,
    maxLeftArmEndToHandM: 0,
    maxRightArmEndToHandM: 0,
  };
}

/** Mutates `w` (called at presence rate — no allocation). The yaw step
 * is taken the short way round (atan2 wrap). */
export function addFitSample(w: FitWindow, s: FitSample): void {
  if (w.lastAtMs !== null && s.atMs > w.lastAtMs) {
    const step = s.torsoYawRad - w.lastTorsoYawRad;
    const wrapped = Math.atan2(Math.sin(step), Math.cos(step));
    const rate = Math.abs(wrapped) / ((s.atMs - w.lastAtMs) / 1000);
    w.maxTorsoYawRateRadS = Math.max(w.maxTorsoYawRateRadS, rate);
  }
  w.startMs ??= s.atMs;
  w.lastAtMs = s.atMs;
  w.lastTorsoYawRad = s.torsoYawRad;
  w.maxHeadPitchRad = Math.max(w.maxHeadPitchRad, s.headPitchRad);
  w.maxLeftArmEndToHandM = Math.max(w.maxLeftArmEndToHandM, s.leftArmEndToHandM);
  w.maxRightArmEndToHandM = Math.max(w.maxRightArmEndToHandM, s.rightArmEndToHandM);
}

/** Starts the next window but keeps the last yaw sample, so the rate
 * across the window boundary is still measured. */
export function restartFitWindow(w: FitWindow): void {
  w.startMs = null;
  w.maxTorsoYawRateRadS = 0;
  w.maxHeadPitchRad = -Infinity;
  w.maxLeftArmEndToHandM = 0;
  w.maxRightArmEndToHandM = 0;
}
```

- [ ] **Step 4:** Same vitest command → PASS. `npx prettier --write src/core`.
- [ ] **Step 5:** Commit `feat(debug): pure avatar-fit metrics for the gate report`.

### Task 2: Settings — gate log channel, remembered room + debug

**Files:**
- Modify: `src/core/log.ts` (add `| 'gate'` to `LogChannel`), `src/core/settings.ts`, `src/core/settings.test.ts`, `src/systems/settings.ts`, `src/systems/multiplayer.ts` (`roomIdFromUrl`)

**Interfaces:**
- Produces: `Settings.roomId: string | null`; `urlSettingOverrides(search: string): { roomId?: string; debugRelay?: true }`; `SettingsSystem.setRoomId(roomId: string | null): void`; log channel `'gate'`.

- [ ] **Step 1: Failing tests** — append to `src/core/settings.test.ts` (import `urlSettingOverrides`, `decodeSettings`, `defaultSettings` from `./settings.js` as needed):

```ts
describe('roomId migration', () => {
  it('decodes a pre-roomId settings JSON, keeping its values', () => {
    const { roomId: _drop, ...old } = { ...defaultSettings(), language: 'en' as const };
    const decoded = decodeSettings(JSON.stringify(old));
    expect(decoded.language).toBe('en');
    expect(decoded.roomId).toBeNull();
  });
});

describe('urlSettingOverrides', () => {
  it('reads room and debug', () => {
    expect(urlSettingOverrides('?room=eriktest&debug=1')).toEqual({
      roomId: 'eriktest',
      debugRelay: true,
    });
  });
  it('ignores an empty or overlong room and debug≠1', () => {
    expect(urlSettingOverrides(`?room=&debug=0`)).toEqual({});
    expect(urlSettingOverrides(`?room=${'x'.repeat(65)}`)).toEqual({});
  });
});
```

- [ ] **Step 2:** `npx vitest run --reporter=dot src/core/settings.test.ts` → FAIL.

- [ ] **Step 3: Implement.** In `src/core/settings.ts`, add to `settingsSchema` (before `debugRelay`):

```ts
  /** Multiplayer room remembered from `?room=` (gate report spec §4):
   * after one visit the bare LAN URL rejoins it. null = the public
   * lobby (config). `.default(null)` for migration. */
  roomId: roomIdSchema.nullable().default(null),
```

above the schema:

```ts
const roomIdSchema = z.string().min(1).max(64);
```

in `defaultSettings()` add `roomId: null,`, and at the end of the file:

```ts
/** `?room=<id>` and `?debug=1` from a URL search string — the values
 * SettingsSystem persists at boot. Invalid values are ignored. */
export function urlSettingOverrides(search: string): {
  roomId?: string;
  debugRelay?: true;
} {
  const params = new URLSearchParams(search);
  const room = roomIdSchema.safeParse(params.get('room') ?? '');
  return {
    ...(room.success ? { roomId: room.data } : {}),
    ...(params.get('debug') === '1' ? { debugRelay: true as const } : {}),
  };
}
```

In `src/systems/settings.ts` import `urlSettingOverrides` and, in `init()` right after `settingsState.current = loadSettings();`:

```ts
    const overrides = urlSettingOverrides(window.location.search);
    if (Object.keys(overrides).length > 0) {
      settingsState.current = { ...settingsState.current, ...overrides };
      this.persist();
    }
```

and add the setter next to the others:

```ts
  setRoomId(roomId: string | null): void {
    settingsState.current = { ...settingsState.current, roomId };
    this.persist();
  }
```

In `src/systems/multiplayer.ts` replace the body of `roomIdFromUrl()` and rename it `roomId()` (update its one call site in `init()`):

```ts
  /** `?room=` is persisted by SettingsSystem at boot (registered first). */
  private roomId(): string {
    return settingsState.current.roomId ?? multiplayer.defaultRoomId;
  }
```

- [ ] **Step 4:** `npx tsc --noEmit && npx vitest run --reporter=dot` → all PASS. (`setRoomId` is unused until a menu needs it — drop it if lint flags it; YAGNI.)
- [ ] **Step 5:** Commit `feat(settings): remember ?room and ?debug so the bare LAN URL works`.

### Task 3: GateProbeSystem

**Files:**
- Create: `src/systems/gateProbe.ts`
- Modify: `src/index.ts` (register after `PeerAvatarSystem`, before `DebugWatchSystem`)

**Interfaces:**
- Consumes: events `RoundEnded`, `Thrown`, `ThrowRelayed`, `Reset`, `MatchStateChanged`, `MultiplayerPeerDisconnected`; `StatsSystem.stats.lifetimeTotals.roundsPlayed`; `debugContext.pieceIdByEntityIndex`; `score()`.
- Produces gate lines: `round summary`, `match state`, `sin-bin after round`, `king decision`, `sync snapshot` (data shapes below — Task 5 parses exactly these).

- [ ] **Step 1: Implement** `src/systems/gateProbe.ts`:

```ts
import { createSystem } from '@iwsdk/core';
import { OutOfPlay } from '../components/out-of-play.js';
import { Resettable } from '../components/resettable.js';
import { StickState } from '../components/stick-state.js';
import { gameEvents } from '../core/events.js';
import { log } from '../core/log.js';
import { score } from '../core/match.js';
import type { MatchSide, MatchState } from '../core/match.js';
import { debugContext } from '../debug/debugContext.js';
import { settingsState } from '../settingsState.js';
import { StatsSystem } from './stats.js';

const SNAPSHOT_INTERVAL_S = 1;

/** 0.05 m grid, two decimals so the JSON stays short. */
function round5cm(value: number): number {
  return Number((Math.round(value / 0.05) * 0.05).toFixed(2));
}

/**
 * Debug mode only: the gate-report probes that are pure consequences of
 * existing events (docs/superpowers/specs/2026-09-26-gate-report-
 * design.md). Every handler returns immediately unless the debug relay
 * is on. Registered after MultiplayerSystem ON PURPOSE: the host's king
 * decision is emitted inside the Reset{roundEnd} cascade, and this
 * system's own Reset handler (which zeroes the stick count) must run
 * after it so `stickNumberInRound` is still the round's count.
 */
export class GateProbeSystem extends createSystem({
  pieces: { required: [Resettable], excluded: [StickState] },
  outOfPlay: { required: [OutOfPlay] },
}) {
  private statsSystem!: StatsSystem;
  private mySide: MatchSide | null = null;
  private lastState: MatchState | null = null;
  private sticksThisRound = 0;
  private roundsPlayedSeen = 0;
  private snapshotTimerS = 0;

  init(): void {
    const statsSystem = this.world.getSystem(StatsSystem);
    if (!statsSystem) {
      throw new Error('GateProbeSystem requires StatsSystem to be registered first');
    }
    this.statsSystem = statsSystem;
    this.roundsPlayedSeen = statsSystem.stats.lifetimeTotals.roundsPlayed;
    this.cleanupFuncs.push(
      gameEvents.on('Thrown', () => {
        this.sticksThisRound += 1;
      }),
      gameEvents.on('ThrowRelayed', () => {
        this.sticksThisRound += 1;
      }),
      gameEvents.on('RoundEnded', (e) => {
        const after = this.statsSystem.stats.lifetimeTotals.roundsPlayed;
        if (debugContext.enabled) {
          log('info', 'gate', 'round summary', {
            mySide: this.mySide ?? 'solo',
            matchTurn: this.lastState?.currentTurn ?? null,
            byOpponent: e.byOpponent,
            statsRecorded: after > this.roundsPlayedSeen,
            roundsPlayedBefore: this.roundsPlayedSeen,
            roundsPlayedAfter: after,
            sticksThrown: e.sticksThrownThisRound,
            kubbsFelled: e.result.kubbsFelled,
            kingFelled: e.result.kingFelled,
          });
        }
        this.roundsPlayedSeen = after;
      }),
      gameEvents.on('Reset', (e) => {
        this.sticksThisRound = 0;
        if (e.cause === 'roundEnd' && this.mySide !== null) {
          this.logSinBin();
        }
      }),
      gameEvents.on('MatchStateChanged', (e) => {
        const prev = this.lastState;
        this.mySide = e.mySide;
        this.lastState = e.state;
        if (!debugContext.enabled) {
          return;
        }
        const { host, guest } = e.state.felledKubbIds;
        log('info', 'gate', 'match state', {
          mySide: e.mySide,
          turn: e.state.currentTurn,
          winner: e.state.winner,
          endReason: e.state.endReason,
          felledHost: host.length,
          felledGuest: guest.length,
          fresh: host.length === 0 && guest.length === 0 && e.state.winner === null,
        });
        if (prev?.winner == null && e.state.winner !== null) {
          log('info', 'gate', 'king decision', {
            mySide: e.mySide,
            thrower: e.state.currentTurn,
            winner: e.state.winner,
            endReason: e.state.endReason,
            stickNumberInRound: this.sticksThisRound,
          });
        }
      }),
      gameEvents.on('MultiplayerPeerDisconnected', () => {
        this.mySide = null;
        this.lastState = null;
      }),
    );
  }

  update(delta: number): void {
    if (!debugContext.enabled || this.mySide === null || !this.lastState) {
      return;
    }
    this.snapshotTimerS += delta;
    if (this.snapshotTimerS < SNAPSHOT_INTERVAL_S) {
      return;
    }
    this.snapshotTimerS = 0;
    const pieces: Record<string, [number, number, number]> = {};
    for (const entity of this.queries.pieces.entities) {
      const p = entity.object3D?.position;
      if (!p) {
        continue;
      }
      const id = debugContext.pieceIdByEntityIndex.get(entity.index) ?? `entity-${entity.index}`;
      pieces[id] = [round5cm(p.x), round5cm(p.y), round5cm(p.z)];
    }
    log('info', 'gate', 'sync snapshot', {
      turn: this.lastState.currentTurn,
      winner: this.lastState.winner,
      score: score(this.lastState),
      felled: this.lastState.felledKubbIds,
      gameMode: settingsState.current.gameMode,
      pieces,
    });
  }

  private logSinBin(): void {
    if (!debugContext.enabled) {
      return;
    }
    const kubbs: Record<string, [number, number, number]> = {};
    for (const entity of this.queries.outOfPlay.entities) {
      const p = entity.object3D?.position;
      if (!p) {
        continue;
      }
      const id = debugContext.pieceIdByEntityIndex.get(entity.index) ?? `entity-${entity.index}`;
      kubbs[id] = [round5cm(p.x), round5cm(p.y), round5cm(p.z)];
    }
    log('info', 'gate', 'sin-bin after round', { kubbs });
  }
}
```

In `src/index.ts`, import it and register right before `DebugWatchSystem`:

```ts
  // Debug mode only: gate-report probes (docs/superpowers/specs/
  // 2026-09-26-gate-report-design.md). Must come after MultiplayerSystem
  // — see the class doc.
  world.registerSystem(GateProbeSystem);
```

- [ ] **Step 2:** `npx tsc --noEmit && npx eslint src --quiet && npx prettier --write src` → clean.
- [ ] **Step 3:** Commit `feat(debug): gate probes for rounds, match state, sin-bin, king and sync`.

### Task 4: In-place probes

**Files:** Modify `src/systems/{settings,menu,multiplayer,matchRules,peerAvatar,hud}.ts`.

**Interfaces:** Produces gate lines `mode adopted`, `mode released`, `mode button pressed {locked, gameMode}`, `reset pressed {}`, `match restart {secondsSinceFinished}`, `avatar color {event: 'sent'|'received'|'tinted', colorIndex, who?: 'mine'|'opponent'}`, `avatar fit {leftArmEndToHandM, rightArmEndToHandM, handSizeM, maxTorsoYawRateRadS, maxHeadPitchRad}`.

- [ ] **Step 1: settings.ts** — `import { log } from '../core/log.js';`; in `releaseMatchGameMode()` after `this.preferredGameMode = null;`:

```ts
    log('info', 'gate', 'mode released', { restoredMode: preferred });
```

- [ ] **Step 2: multiplayer.ts** — in `adoptHostGameModeIfGuest()` change `log('info', 'net', "adopting the host's game mode", {` to `log('info', 'gate', 'mode adopted', {`.

- [ ] **Step 3: menu.ts** — game-mode button handler becomes:

```ts
    this.wireButton('game-mode-button', () => {
      log('info', 'gate', 'mode button pressed', {
        locked: this.isGameModeLocked(),
        gameMode: settingsState.current.gameMode,
      });
      if (this.isGameModeLocked()) {
```

reset button: `this.wireButton('reset-button', () => { log('info', 'gate', 'reset pressed', {}); this.resetAll('manual'); });`; avatar-color button: after `this.settingsSystem.setAvatarColorIndex(…);` add

```ts
      log('info', 'gate', 'avatar color', {
        event: 'sent',
        colorIndex: settingsState.current.avatarColorIndex,
      });
```

(`log` is already imported in menu.ts — check; import from `../core/log.js` if not.)

- [ ] **Step 4: matchRules.ts** — replace `log('info', 'state', 'match auto-restart', {});` (before `this.restartInS = null;`, reorder so the value is read first):

```ts
    log('info', 'gate', 'match restart', {
      // restartInS has just crossed 0, so this is ≥ the configured delay.
      secondsSinceFinished: match.restartDelayS - this.restartInS,
    });
    this.restartInS = null;
```

- [ ] **Step 5: peerAvatar.ts** — imports: `addFitSample, armEndToHandM, emptyFitWindow, FIT_WINDOW_MS, restartFitWindow` + `type FitWindow` from `../core/avatarFit.js`, `pitchFromQuaternion` from `../core/quat.js`, `debugContext` from `../debug/debugContext.js`. Add `fit: FitWindow;` to `AvatarInstance` and `fit: emptyFitWindow(),` to the literal in the creation path. In `applyPresence`, inside the color-change `if`, add `log('info', 'gate', 'avatar color', { event: 'received', colorIndex: message.colorIndex });`. At the end of `applyPresence` (after the `applySegment` calls):

```ts
    if (debugContext.enabled) {
      this.sampleFit(instance, nowMs, solved, message);
    }
```

and the method:

```ts
  /** Gate report (MP3b): 1 Hz maxima of the numbers the checklist asks
   * about — see core/avatarFit.ts. */
  private sampleFit(
    instance: AvatarInstance,
    nowMs: number,
    solved: AvatarPose,
    message: GameEvents['PeerPresence']['message'],
  ): void {
    const w = instance.fit;
    addFitSample(w, {
      atMs: nowMs,
      torsoYawRad: instance.smoothedYawRad,
      headPitchRad: pitchFromQuaternion(message.head.quaternion),
      leftArmEndToHandM: armEndToHandM(solved.leftShoulder, solved.leftArm, message.leftHand.position),
      rightArmEndToHandM: armEndToHandM(solved.rightShoulder, solved.rightArm, message.rightHand.position),
    });
    if (w.startMs === null || nowMs - w.startMs < FIT_WINDOW_MS) {
      return;
    }
    log('info', 'gate', 'avatar fit', {
      leftArmEndToHandM: w.maxLeftArmEndToHandM,
      rightArmEndToHandM: w.maxRightArmEndToHandM,
      handSizeM: avatar.handSizeM,
      maxTorsoYawRateRadS: w.maxTorsoYawRateRadS,
      maxHeadPitchRad: w.maxHeadPitchRad,
    });
    restartFitWindow(w);
  }
```

(`AvatarPose` type import from `../core/avatarPose.js`.)

- [ ] **Step 6: hud.ts** — fields `private loggedMyColor: number | null = null; private loggedTheirColor: number | null = null;`; in `updateMatchRow()` after both `setProperties` score calls:

```ts
    if (debugContext.enabled) {
      const mine = settingsState.current.avatarColorIndex;
      if (mine !== this.loggedMyColor) {
        this.loggedMyColor = mine;
        log('info', 'gate', 'avatar color', { event: 'tinted', who: 'mine', colorIndex: mine });
      }
      if (this.opponentColorIndex !== this.loggedTheirColor) {
        this.loggedTheirColor = this.opponentColorIndex;
        if (this.opponentColorIndex !== null) {
          log('info', 'gate', 'avatar color', { event: 'tinted', who: 'opponent', colorIndex: this.opponentColorIndex });
        }
      }
    }
```

- [ ] **Step 7:** `npx tsc --noEmit && npx eslint src --quiet && npx prettier --write src && npx vitest run --reporter=dot` → clean/PASS.
- [ ] **Step 8:** Commit `feat(debug): gate probes for mode, reset, restart and avatars`.

### Task 5: Pure checks

**Files:** Create `scripts/gate/checks.mjs`, `scripts/gate/checks.test.mjs`.

**Interfaces:**
- Produces: `parseLog(text: string): Entry[]` (drops unparsable lines); `syncPairs(entries): {pairs, incidents}`; `runChecks(entries): Array<{id, label, status: 'PASS'|'FAIL'|'NOT SEEN'|'EYES', evidence: string}>`; constants exported as `THRESHOLDS`.

- [ ] **Step 1: Failing tests** — `scripts/gate/checks.test.mjs`:

```js
import { describe, expect, it } from 'vitest';
import { runChecks, syncPairs } from './checks.mjs';

let t = 0;
const g = (role, message, data, dtMs = 100, client = role) => {
  t += dtMs;
  return { level: 'info', channel: 'gate', message, data, role, client, timeMs: t, receivedAt: t };
};
const status = (entries, id) => runChecks(entries).find((r) => r.id === id).status;
const snap = (role, over = {}) =>
  g(role, 'sync snapshot', {
    turn: 'host', winner: null, score: { host: 0, guest: 0 },
    felled: { host: [], guest: [] }, gameMode: 'simple',
    pieces: { king: [0, 0.15, -3] }, ...over,
  }, 500);

describe('runChecks', () => {
  it('everything is NOT SEEN (or EYES) on an empty log', () => {
    for (const r of runChecks([])) {
      expect(['NOT SEEN', 'EYES']).toContain(r.status);
    }
  });
  it('gh16-host: PASS when the opponent round is not recorded, FAIL when it is', () => {
    const ok = g('host', 'round summary', { byOpponent: true, statsRecorded: false });
    const bad = g('host', 'round summary', { byOpponent: true, statsRecorded: true });
    expect(status([ok], 'gh16-host')).toBe('PASS');
    expect(status([ok, bad], 'gh16-host')).toBe('FAIL');
  });
  it('gh15-lock: an unlocked press while connected FAILs, solo presses do not count', () => {
    expect(status([g('solo', 'mode button pressed', { locked: false })], 'gh15-lock')).toBe('NOT SEEN');
    expect(status([g('guest', 'mode button pressed', { locked: true })], 'gh15-lock')).toBe('PASS');
    expect(status([g('guest', 'mode button pressed', { locked: false })], 'gh15-lock')).toBe('FAIL');
  });
  it('king rules: early loss, win after all, 6th stick', () => {
    const early = g('host', 'king decision', { thrower: 'host', winner: 'guest', endReason: 'kingFelledEarly', stickNumberInRound: 6 });
    const win = g('host', 'king decision', { thrower: 'guest', winner: 'guest', endReason: 'allKubbsAndKing', stickNumberInRound: 3 });
    expect(status([early, win], 'mp3a-king-early')).toBe('PASS');
    expect(status([early, win], 'mp3a-king-win')).toBe('PASS');
    expect(status([early, win], 'mp3a-king-6th')).toBe('PASS');
    expect(status([win], 'mp3a-king-6th')).toBe('NOT SEEN');
  });
  it('mp3a-sinbin: FAILs when a sin-bin kubb moves or vanishes within a match', () => {
    const a = g('host', 'sin-bin after round', { kubbs: { 'kubb-1': [2, 0.15, 1] } });
    const same = g('host', 'sin-bin after round', { kubbs: { 'kubb-1': [2, 0.15, 1], 'kubb-2': [2.3, 0.15, 1] } });
    const gone = g('host', 'sin-bin after round', { kubbs: {} });
    expect(status([a, same], 'mp3a-sinbin')).toBe('PASS');
    expect(status([a, gone], 'mp3a-sinbin')).toBe('FAIL');
    const fresh = g('host', 'match state', { fresh: true });
    expect(status([a, fresh, gone], 'mp3a-sinbin')).toBe('NOT SEEN');
  });
  it('mp3a-restart: PASS in [9, 12] s followed by a fresh host turn', () => {
    const r = g('host', 'match restart', { secondsSinceFinished: 10.02 });
    const fresh = g('host', 'match state', { fresh: true, turn: 'host' });
    expect(status([r, fresh], 'mp3a-restart')).toBe('PASS');
    expect(status([g('host', 'match restart', { secondsSinceFinished: 14 }), fresh], 'mp3a-restart')).toBe('FAIL');
  });
  it('mp3a-reset-guest: needs a fresh state on both sides within 3 s', () => {
    const press = g('guest', 'reset pressed', {});
    const h = g('host', 'match state', { fresh: true });
    const gu = g('guest', 'match state', { fresh: true });
    expect(status([press, h, gu], 'mp3a-reset-guest')).toBe('PASS');
    expect(status([press, h], 'mp3a-reset-guest')).toBe('FAIL');
  });
  it('mp3b-arms and mp3b-torso', () => {
    const fit = (over) => g('guest', 'avatar fit', { leftArmEndToHandM: 0.05, rightArmEndToHandM: 0.05, handSizeM: 0.1, maxTorsoYawRateRadS: 1, maxHeadPitchRad: 1.2, ...over });
    expect(status([fit({})], 'mp3b-arms')).toBe('PASS');
    expect(status([fit({ leftArmEndToHandM: 0.2 })], 'mp3b-arms')).toBe('FAIL');
    expect(status([fit({})], 'mp3b-torso')).toBe('PASS');
    expect(status([fit({ maxTorsoYawRateRadS: 5 })], 'mp3b-torso')).toBe('FAIL');
    expect(status([fit({ maxHeadPitchRad: 0.2, maxTorsoYawRateRadS: 5 })], 'mp3b-torso')).toBe('NOT SEEN');
  });
  it('mp3b-color: sent → received + opponent tint elsewhere, own tint here, within 3 s', () => {
    const sent = g('host', 'avatar color', { event: 'sent', colorIndex: 2 });
    const mine = g('host', 'avatar color', { event: 'tinted', who: 'mine', colorIndex: 2 });
    const rec = g('guest', 'avatar color', { event: 'received', colorIndex: 2 });
    const theirs = g('guest', 'avatar color', { event: 'tinted', who: 'opponent', colorIndex: 2 });
    expect(status([sent, mine, rec, theirs], 'mp3b-color')).toBe('PASS');
    expect(status([sent, mine, rec], 'mp3b-color')).toBe('FAIL');
  });
});

describe('syncPairs', () => {
  it('pairs host/guest snapshots and ignores a 2-pair lag', () => {
    const e = [];
    for (let i = 0; i < 6; i++) {
      const lag = i === 2 || i === 3;
      e.push(snap('host', { score: { host: i, guest: 0 } }));
      e.push(snap('guest', { score: { host: lag ? i - 1 : i, guest: 0 } }));
    }
    const { pairs, incidents } = syncPairs(e);
    expect(pairs).toBe(6);
    expect(incidents).toEqual([]);
  });
  it('reports a sustained disagreement once, and position drift over 0.15 m', () => {
    const e = [];
    for (let i = 0; i < 5; i++) {
      e.push(snap('host', { pieces: { king: [0, 0.15, -3] } }));
      e.push(snap('guest', { pieces: { king: [0.3, 0.15, -3] } }));
    }
    const { incidents } = syncPairs(e);
    expect(incidents).toHaveLength(1);
    expect(incidents[0].field).toBe('pieces');
  });
});
```

- [ ] **Step 2:** `npx vitest run --reporter=dot scripts/gate` → FAIL (module missing).

- [ ] **Step 3: Implement** `scripts/gate/checks.mjs`:

```js
// Pure verdict logic for `npm run gate:report` — see
// docs/superpowers/specs/2026-09-26-gate-report-design.md. Input: the
// debug relay's NDJSON entries; output: one result per checklist item.

export const THRESHOLDS = {
  pairWindowMs: 1500,
  incidentMinPairs: 3,
  positionToleranceM: 0.15,
  sinBinToleranceM: 0.1,
  restartMinS: 9,
  restartMaxS: 12,
  lookUpPitchRad: 1.0,
  maxTorsoYawRateRadS: 3.0,
  followUpMs: 3000,
  armEndSlackM: 0.005,
};

export function parseLog(text) {
  const out = [];
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    try {
      out.push(JSON.parse(line));
    } catch {
      // a half-written last line while the relay appends — skip it
    }
  }
  return out;
}

const gate = (entries, message) =>
  entries.filter((e) => e.channel === 'gate' && e.message === message);
const at = (e) => e.receivedAt ?? e.timeMs;
const fmt = (e) =>
  `${new Date(at(e)).toISOString().slice(11, 19)} ${e.role}/${e.client} ${e.message} ${JSON.stringify(e.data)}`;
const verdict = (id, label, status, evidence = '') => ({ id, label, status, evidence });

/** PASS when `relevant` is non-empty and none is bad; FAIL on the first
 * bad one; NOT SEEN when nothing relevant happened. */
function allOf(id, label, relevant, isBad) {
  if (relevant.length === 0) return verdict(id, label, 'NOT SEEN');
  const bad = relevant.find(isBad);
  return bad ? verdict(id, label, 'FAIL', fmt(bad)) : verdict(id, label, 'PASS', fmt(relevant[0]));
}

function anyOf(id, label, relevant, isGood) {
  const good = relevant.find(isGood);
  if (good) return verdict(id, label, 'PASS', fmt(good));
  return relevant.length === 0
    ? verdict(id, label, 'NOT SEEN')
    : verdict(id, label, 'FAIL', fmt(relevant[0]));
}

function within(entries, from, predicate) {
  return entries.some(
    (e) => at(e) >= at(from) && at(e) - at(from) <= THRESHOLDS.followUpMs && predicate(e),
  );
}

const freshState = (e) => e.channel === 'gate' && e.message === 'match state' && e.data.fresh;

function sinBinCheck(entries) {
  const id = 'mp3a-sinbin';
  const label = 'felled kubbs stay in the sin-bin across rounds';
  const prevByClient = new Map();
  let compared = 0;
  for (const e of entries) {
    if (freshState(e)) {
      prevByClient.delete(e.client);
      continue;
    }
    if (e.channel !== 'gate' || e.message !== 'sin-bin after round') continue;
    const prev = prevByClient.get(e.client);
    prevByClient.set(e.client, e.data.kubbs);
    if (!prev || Object.keys(prev).length === 0) continue;
    compared += 1;
    for (const [kubb, p] of Object.entries(prev)) {
      const q = e.data.kubbs[kubb];
      const moved = !q || Math.hypot(q[0] - p[0], q[1] - p[1], q[2] - p[2]) > THRESHOLDS.sinBinToleranceM;
      if (moved) return verdict(id, label, 'FAIL', `${kubb} ${q ? 'moved' : 'left the sin-bin'}: ${fmt(e)}`);
    }
  }
  return compared === 0 ? verdict(id, label, 'NOT SEEN') : verdict(id, label, 'PASS', `${compared} round transitions`);
}

function resetCheck(entries, side) {
  const id = `mp3a-reset-${side}`;
  const label = `"Ny runda" from the ${side} resets the match on both`;
  const presses = gate(entries, 'reset pressed').filter((e) => e.role === side);
  return allOf(id, label, presses, (p) =>
    !(within(entries, p, (e) => freshState(e) && e.role === 'host') &&
      within(entries, p, (e) => freshState(e) && e.role === 'guest')),
  );
}

function colorCheck(entries) {
  const sent = gate(entries, 'avatar color').filter((e) => e.data.event === 'sent' && e.role !== 'solo');
  const color = (e, ev, who) => e.channel === 'gate' && e.message === 'avatar color' && e.data.event === ev && (who === undefined || e.data.who === who);
  return allOf('mp3b-color', 'color change reaches the other side and both HUDs', sent, (s) => {
    const same = (e) => e.data.colorIndex === s.data.colorIndex;
    const here = (e) => e.client === s.client;
    return !(
      within(entries, s, (e) => color(e, 'tinted', 'mine') && here(e) && same(e)) &&
      within(entries, s, (e) => color(e, 'received') && !here(e) && same(e)) &&
      within(entries, s, (e) => color(e, 'tinted', 'opponent') && !here(e) && same(e))
    );
  });
}

const SYNC_FIELDS = ['turn', 'winner', 'score', 'felled', 'gameMode'];

function piecesDiffer(a, b) {
  for (const [id, p] of Object.entries(a)) {
    const q = b[id];
    if (!q) continue;
    if (Math.hypot(q[0] - p[0], q[1] - p[1], q[2] - p[2]) > THRESHOLDS.positionToleranceM) return true;
  }
  return false;
}

/** Pairs every guest snapshot with the nearest host snapshot (by the
 * relay's receive time) and turns runs of ≥ incidentMinPairs
 * disagreeing pairs into incidents — shorter runs are network lag. */
export function syncPairs(entries) {
  const host = gate(entries, 'sync snapshot').filter((e) => e.role === 'host');
  const guest = gate(entries, 'sync snapshot').filter((e) => e.role === 'guest');
  const pairs = [];
  for (const gs of guest) {
    let best = null;
    for (const hs of host) {
      const d = Math.abs(at(hs) - at(gs));
      if (d <= THRESHOLDS.pairWindowMs && (!best || d < Math.abs(at(best) - at(gs)))) best = hs;
    }
    if (best) pairs.push([best, gs]);
  }
  const incidents = [];
  for (const field of [...SYNC_FIELDS, 'pieces']) {
    let run = [];
    const close = () => {
      if (run.length >= THRESHOLDS.incidentMinPairs) {
        const [h, g] = run[0];
        incidents.push({
          field,
          fromMs: at(g),
          toMs: at(run[run.length - 1][1]),
          host: field === 'pieces' ? '(positions)' : JSON.stringify(h.data[field]),
          guest: field === 'pieces' ? '(positions)' : JSON.stringify(g.data[field]),
        });
      }
      run = [];
    };
    for (const pair of pairs) {
      const [h, g] = pair;
      const differs = field === 'pieces'
        ? piecesDiffer(h.data.pieces, g.data.pieces)
        : JSON.stringify(h.data[field]) !== JSON.stringify(g.data[field]);
      if (differs) run.push(pair);
      else close();
    }
    close();
  }
  return { pairs: pairs.length, incidents };
}

export function runChecks(entries) {
  const summaries = gate(entries, 'round summary');
  const kings = gate(entries, 'king decision').filter((e) => e.role === 'host');
  const fits = gate(entries, 'avatar fit');
  const sync = syncPairs(entries);
  const snapshots = gate(entries, 'sync snapshot');
  const scoreIncidents = sync.incidents.filter((i) => i.field === 'score');
  const created = entries.filter((e) => e.message === 'peer avatar created');
  const modeAdopted = gate(entries, 'mode adopted');

  const results = [
    modeAdopted.length > 0
      ? verdict('gh15-adopt', "guest plays on the host's court", 'PASS', fmt(modeAdopted[0]))
      : sync.pairs === 0
        ? verdict('gh15-adopt', "guest plays on the host's court", 'NOT SEEN')
        : sync.incidents.some((i) => i.field === 'gameMode')
          ? verdict('gh15-adopt', "guest plays on the host's court", 'FAIL', 'gameMode differs in sync snapshots')
          : verdict('gh15-adopt', "guest plays on the host's court", 'PASS', 'same mode on both (nothing to adopt)'),
    anyOf('gh15-release', "guest's own mode returns when the room empties", gate(entries, 'mode released'), () => true),
    allOf('gh15-lock', 'mode button locked while connected',
      gate(entries, 'mode button pressed').filter((e) => e.role !== 'solo'), (e) => !e.data.locked),
    allOf('gh16-host', "opponent's turn stays out of the host's stats",
      summaries.filter((e) => e.role === 'host' && e.data.byOpponent), (e) => e.data.statsRecorded),
    allOf('gh16-guest', "guest's own turn lands in the guest's stats",
      summaries.filter((e) => e.role === 'guest' && !e.data.byOpponent && e.data.sticksThrown > 0), (e) => !e.data.statsRecorded),
    sinBinCheck(entries),
    sync.pairs === 0
      ? verdict('mp3a-score', 'score agrees on both', 'NOT SEEN')
      : scoreIncidents.length > 0
        ? verdict('mp3a-score', 'score agrees on both', 'FAIL', JSON.stringify(scoreIncidents[0]))
        : verdict('mp3a-score', 'score agrees on both', 'PASS', `${sync.pairs} snapshot pairs`),
    anyOf('mp3a-king-early', 'king felled early = loss',
      kings.filter((e) => e.data.endReason === 'kingFelledEarly'), (e) => e.data.winner !== e.data.thrower),
    anyOf('mp3a-king-win', 'king after all kubbs = win',
      kings.filter((e) => e.data.endReason === 'allKubbsAndKing'), (e) => e.data.winner === e.data.thrower),
    kings.some((e) => e.data.stickNumberInRound === 6)
      ? verdict('mp3a-king-6th', 'king decided by the 6th stick', 'PASS', fmt(kings.find((e) => e.data.stickNumberInRound === 6)))
      : verdict('mp3a-king-6th', 'king decided by the 6th stick', 'NOT SEEN'),
    allOf('mp3a-restart', 'auto-restart after ~10 s, host starts',
      gate(entries, 'match restart').filter((e) => e.role === 'host'),
      (r) => r.data.secondsSinceFinished < THRESHOLDS.restartMinS ||
        r.data.secondsSinceFinished > THRESHOLDS.restartMaxS ||
        !within(entries, r, (e) => freshState(e) && e.role === 'host' && e.data.turn === 'host')),
    resetCheck(entries, 'host'),
    resetCheck(entries, 'guest'),
    new Set(created.map((e) => e.role)).size >= 2 && created.some((e) => e.role === 'host') && created.some((e) => e.role === 'guest')
      ? verdict('mp3b-avatar', 'both see a body', 'PASS', `${created.length} avatars created`)
      : verdict('mp3b-avatar', 'both see a body', 'NOT SEEN', created.length ? `only on ${created[0].role}` : ''),
    allOf('mp3b-arms', 'arm ends at the mitten', fits,
      (e) => Math.max(e.data.leftArmEndToHandM, e.data.rightArmEndToHandM) > e.data.handSizeM / 2 + THRESHOLDS.armEndSlackM),
    allOf('mp3b-torso', 'no torso twitch on a full look-up',
      fits.filter((e) => e.data.maxHeadPitchRad >= THRESHOLDS.lookUpPitchRad),
      (e) => e.data.maxTorsoYawRateRadS > THRESHOLDS.maxTorsoYawRateRadS),
    colorCheck(entries),
    sync.pairs === 0
      ? verdict('sync', 'host and guest agree', 'NOT SEEN')
      : sync.incidents.length > 0
        ? verdict('sync', 'host and guest agree', 'FAIL', sync.incidents.map((i) => `${i.field} ${new Date(i.fromMs).toISOString().slice(11, 19)}–${new Date(i.toMs).toISOString().slice(11, 19)} host=${i.host} guest=${i.guest}`).join('; '))
        : verdict('sync', 'host and guest agree', 'PASS', `${sync.pairs} pairs, 0 incidents`),
    verdict('eyes-proportions', 'avatar proportions look right', 'EYES'),
    verdict('eyes-visor', 'the visor sits on the head', 'EYES'),
    verdict('eyes-score-row', 'the two-colored score row lays out', 'EYES'),
  ];
  void snapshots;
  return results;
}
```

(Remove the unused `snapshots` variable and its `void` if lint allows — it is only there to keep the example minimal; prefer deleting both lines.)

- [ ] **Step 4:** `npx vitest run --reporter=dot scripts/gate` → PASS. Fix rules, not tests, if a case fails — the tests encode the spec.
- [ ] **Step 5:** Commit `feat(debug): pure gate-report checks with fixtures`.

### Task 6: CLI + npm scripts

**Files:** Create `scripts/gate-report.mjs`, `scripts/gate-new.mjs`; modify `package.json` scripts.

- [ ] **Step 1:** `scripts/gate-report.mjs`:

```js
// Prints the headset-gate checklist from the debug relay log.
// Usage: npm run gate:report [-- --since HH:MM] [-- --watch]
// See docs/superpowers/specs/2026-09-26-gate-report-design.md.
import { existsSync, readFileSync } from 'node:fs';
import { parseLog, runChecks } from './gate/checks.mjs';

const LOG_PATH = '.iwsdk/runtime/logs/kubb-debug.ndjson';
const args = process.argv.slice(2);
const sinceArg = args.includes('--since') ? args[args.indexOf('--since') + 1] : null;
const watch = args.includes('--watch');

function sinceMs() {
  if (!sinceArg) return 0;
  const [h, m] = sinceArg.split(':').map(Number);
  const d = new Date();
  d.setHours(h ?? 0, m ?? 0, 0, 0);
  return d.getTime();
}

function render() {
  if (!existsSync(LOG_PATH)) {
    console.log(`No ${LOG_PATH} — start the dev server and open the app with ?debug=1.`);
    return;
  }
  const from = sinceMs();
  const entries = parseLog(readFileSync(LOG_PATH, 'utf8')).filter(
    (e) => (e.receivedAt ?? e.timeMs) >= from,
  );
  const clients = new Set(entries.map((e) => `${e.role}/${e.client}`));
  console.log(`gate report — ${entries.length} entries, clients: ${[...clients].join(', ') || 'none'}\n`);
  const results = runChecks(entries);
  const order = { FAIL: 0, 'NOT SEEN': 1, PASS: 2, EYES: 3 };
  for (const r of [...results].sort((a, b) => order[a.status] - order[b.status])) {
    console.log(`${r.status.padEnd(8)} ${r.id.padEnd(18)} ${r.label}${r.evidence ? `\n         ${r.evidence}` : ''}`);
  }
}

if (watch) {
  const tick = () => {
    console.clear();
    render();
  };
  tick();
  setInterval(tick, 2000);
} else {
  render();
}
```

- [ ] **Step 2:** `scripts/gate-new.mjs`:

```js
// Archives the debug relay log so a gate session starts empty.
import { existsSync, renameSync } from 'node:fs';

const LOG_PATH = '.iwsdk/runtime/logs/kubb-debug.ndjson';
if (existsSync(LOG_PATH)) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const archived = LOG_PATH.replace('.ndjson', `.${stamp}.ndjson`);
  renameSync(LOG_PATH, archived);
  console.log(`archived to ${archived}`);
} else {
  console.log('nothing to archive');
}
```

- [ ] **Step 3:** `package.json` scripts: `"gate:report": "node scripts/gate-report.mjs"`, `"gate:new": "node scripts/gate-new.mjs"`.
- [ ] **Step 4:** `npm run gate:report` on the existing log prints the list without crashing (entries from today's session: expect gh15-adopt PASS from the relabelled line only if the new build ran — otherwise NOT SEEN). `npx prettier --write scripts`.
- [ ] **Step 5:** Commit `feat(debug): npm run gate:report / gate:new`.

### Task 7: Verify + docs

- [ ] **Step 1:** Full verification list from Global Constraints → all green.
- [ ] **Step 2:** Emulator: `npx iwsdk dev status` → `browserCommandReady: true`; reload the managed page with `?debug=1&room=gatetest`; play a solo round via the throwing path if cheap, else just load; `npm run gate:report -- --since <now>` → solo items NOT SEEN, no crash; `browser_get_console_logs` (count only) → no new errors.
- [ ] **Step 3:** README "Debug mode" section: bare URL after one visit; `npm run gate:new` before a session, `npm run gate:report -- --watch` during. docs/MILESTONES.md MP3a/MP3b gates: "run with gate:report; only EYES items need Erik". docs/DECISIONS.md: one entry (probe placement, the registration-order constraint, English statuses).
- [ ] **Step 4:** Commit `docs: gate report workflow`, push.
