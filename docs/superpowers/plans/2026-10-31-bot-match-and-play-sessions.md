# Bot match and play sessions — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `npm run botmatch` plays scripted kubb scenarios against the
dev game server, with player A as a real browser, player B as a protocol
bot and a spectator filming. A checklist and an improvements log support
my own emulator play sessions.

**Architecture:** One Node orchestrator (TypeScript, run with tsx) under
`tools/botmatch/`. It owns the protocol bot's socket, so it sees every
snapshot and match state, and it decides the throws for BOTH sides with
pure policies. For B it sends throws itself; for A it drives the browser
page through `globalThis.__kubbDev` (the app's own event bus). Aiming is
a pure core function. Results come from the protocol (match state,
notices, room) plus the gate report over the run's debug log.

**Tech stack:** TypeScript, tsx, ws, playwright, vitest, zod (shared
protocol schemas from `src/core/serverProtocol.ts`).

## Global constraints

- Spec: `docs/superpowers/specs/2026-10-31-bot-match-and-play-sessions-design.md`.
- English code, comments and commits (conventional commits); Swedish chat.
- `src/core` stays free of three.js / IWSDK / Havok imports.
- No `Math.random()` in game code. The tools may only use seeded choices.
- Strict TS (`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`),
  no `any`, no non-null assertions (eslint error), prettier.
- The bot match targets `https://localhost:8081/` by default. It never
  targets the production server unless `--url` says so.
- Screenshots and logs from runs go outside the repo.
- Rule bugs and plain graphical faults found are fixed at once. Look-and-feel
  ideas go to `docs/IMPROVEMENTS.md` for Erik's approval.

## File map

| File                                                 | Responsibility                                                                                                      |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `src/core/aim.ts` (+test)                            | `GRAVITY_MPS2`, `aimRelease()` ballistic release velocity                                                           |
| `server/physicsWorld.ts`                             | use `GRAVITY_MPS2` instead of the literal                                                                           |
| `tools/botmatch/policy.ts` (+test)                   | pure: which target a side throws at, where it releases, inkast targets, per scenario                                |
| `tools/botmatch/protocolBot.ts` (+test)              | the guest's WebSocket client: join, presence stream, throw, reset, setGameMode; keeps latest snapshot/match/notices |
| `tools/botmatch/browserPlayer.ts`                    | the host in Playwright: open, wait seated, throw/inkast/room actions via `__kubbDev`                                |
| `tools/botmatch/scenarios.ts`                        | scenario definitions: policy options, success predicate, time box, expected gate checks                             |
| `tools/botmatch/main.ts`                             | CLI, run loop, spectator child, gate report, final report                                                           |
| `scripts/spectate.mjs`                               | `--on-cut`: screenshot at every camera cut                                                                          |
| `tsconfig.json`, `package.json`, `eslint.config.js`  | include `tools/`, `botmatch` script                                                                                 |
| `docs/playtest-checklist.md`, `docs/IMPROVEMENTS.md` | play-session checklist, idea log                                                                                    |
| `README.md`, `docs/DECISIONS.md`                     | user-facing note, decision entry                                                                                    |

---

### Task 1: Pure aim in the core

**Files:**

- Create: `src/core/aim.ts`
- Test: `src/core/aim.test.ts`
- Modify: `server/physicsWorld.ts:147`

**Interfaces:**

- Produces: `export const GRAVITY_MPS2 = 9.81`;
  `export function aimRelease(from: Vec3, target: Vec3, flightTimeS: number, gravityMps2?: number): Vec3`;
  `export function flightTimeFor(from: Vec3, target: Vec3, speedMps: number): number`.

- [ ] **Step 1: Write the failing test**

```ts
// src/core/aim.test.ts
import { describe, expect, it } from 'vitest';
import { aimRelease, flightTimeFor, GRAVITY_MPS2 } from './aim.js';
import type { Vec3 } from './vec3.js';

/** Where a point mass released at `from` with `v` is after `t` s. */
const fly = (from: Vec3, v: Vec3, t: number): Vec3 => [
  from[0] + v[0] * t,
  from[1] + v[1] * t - 0.5 * GRAVITY_MPS2 * t * t,
  from[2] + v[2] * t,
];

describe('aimRelease', () => {
  for (const [from, target] of [
    [
      [0.2, 1, -0.3],
      [0.5, 0.15, -8],
    ],
    [
      [-0.1, 1.1, -7.7],
      [0, 0.15, 0],
    ],
    [
      [0, 1, -0.3],
      [-2, 0.15, -6],
    ],
  ] as Array<[Vec3, Vec3]>) {
    it(`lands on ${target.join(',')} from ${from.join(',')}`, () => {
      const t = 1.1;
      const landed = fly(from, aimRelease(from, target, t), t);
      for (let i = 0; i < 3; i += 1) {
        expect(Math.abs((landed[i] ?? 0) - (target[i] ?? 0))).toBeLessThan(
          1e-9,
        );
      }
    });
  }

  it('takes longer for a longer throw at the same speed', () => {
    const near = flightTimeFor([0, 1, 0], [0, 0.15, -4], 7);
    const far = flightTimeFor([0, 1, 0], [0, 0.15, -8], 7);
    expect(far).toBeGreaterThan(near);
    expect(near).toBeGreaterThan(0.3);
    expect(far).toBeLessThan(2);
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `npx vitest run src/core/aim.test.ts`
Expected: FAIL, `Failed to resolve import "./aim.js"`.

- [ ] **Step 3: Implement**

```ts
// src/core/aim.ts
import type { Vec3 } from './vec3.js';

/** The server's Havok world gravity (server/physicsWorld.ts uses this). */
export const GRAVITY_MPS2 = 9.81;

/**
 * The release velocity that carries a point from `from` to `target` in
 * `flightTimeS` under gravity (no drag): horizontal = distance / t, and
 * vertical solves y(t) = y0 + vy·t − g·t²/2 for vy. A stick is not a
 * point and it tumbles, so this aims its centre — good enough for a
 * test bot, which retries anyway.
 */
export function aimRelease(
  from: Vec3,
  target: Vec3,
  flightTimeS: number,
  gravityMps2: number = GRAVITY_MPS2,
): Vec3 {
  const t = Math.max(0.05, flightTimeS);
  return [
    (target[0] - from[0]) / t,
    (target[1] - from[1] + 0.5 * gravityMps2 * t * t) / t,
    (target[2] - from[2]) / t,
  ];
}

/** A flight time giving roughly `speedMps` along the ground. */
export function flightTimeFor(
  from: Vec3,
  target: Vec3,
  speedMps: number,
): number {
  const groundM = Math.hypot(target[0] - from[0], target[2] - from[2]);
  return Math.max(0.3, groundM / Math.max(0.1, speedMps));
}
```

In `server/physicsWorld.ts` add `import { GRAVITY_MPS2 } from '../src/core/aim.js';`
and replace `hk.HP_World_SetGravity(world, [0, -9.81, 0]);` with
`hk.HP_World_SetGravity(world, [0, -GRAVITY_MPS2, 0]);`.

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/core/aim.test.ts && npx tsc --noEmit`
Expected: PASS, no type errors.

- [ ] **Step 5: Commit**

```bash
git add src/core/aim.ts src/core/aim.test.ts server/physicsWorld.ts
git commit -m "feat: pure ballistic aim and one shared gravity constant"
```

---

### Task 2: Pure scenario policies

**Files:**

- Create: `tools/botmatch/policy.ts`
- Test: `tools/botmatch/policy.test.ts`
- Modify: `tsconfig.json` (`"include": ["src/**/*.ts", "server/**/*.ts", "tools/**/*.ts"]`)

**Interfaces:**

- Consumes: `MatchState` (`src/core/match.ts`), `CourtHalves`
  (`src/core/inkast.ts`), `Vec3`.
- Produces:

```ts
export type Intent = 'hit' | 'miss' | 'king' | 'footFault';
export interface PolicyView {
  state: MatchState;
  halves: CourtHalves;
  positions: ReadonlyMap<string, Vec3>; // latest snapshot, by piece id
  racked: readonly string[]; // stick ids still in the rack, this turn
}
export interface ThrowPlan {
  pieceId: string;
  from: Vec3;
  target: Vec3;
  speedMps: number;
}
export function chooseTarget(view: PolicyView, intent: Intent): Vec3;
export function releasePoint(
  view: PolicyView,
  intent: Intent,
  stickIndex: number,
): Vec3;
export function planStick(view: PolicyView, intent: Intent): ThrowPlan | null;
export function planInkast(view: PolicyView, legal: boolean): ThrowPlan | null;
```

Rules the policy encodes (kubb rules as this game implements them):
the thrower aims at field kubbs in the opponent's half first, then the
opponent's baseline kubbs, then the king when none stand. `miss` aims
1.5 m beside the court. `king` aims at the king. `footFault` releases
1.3 m past the thrower's line (the reach is 0.9 m). Releases are at
1.0 m height, 0.3 m inside the thrower's standing line
(`standingLineZ`), x spread by stick index. Inkast: a legal toss lands
in the middle of the opponent's half; an illegal one lands 1.5 m outside
the side line.

- [ ] **Step 1: Write the failing test**

```ts
// tools/botmatch/policy.test.ts
import { describe, expect, it } from 'vitest';
import { courtHalves } from '../../src/core/inkast.js';
import { initialMatchState } from '../../src/core/match.js';
import { chooseTarget, planInkast, planStick, releasePoint } from './policy.js';
import type { PolicyView } from './policy.js';
import type { Vec3 } from '../../src/core/vec3.js';

const halves = courtHalves({ widthM: 5, lengthM: 8 });
const start = initialMatchState();
const positions = new Map<string, Vec3>([
  ...start.baselineKubbs.guest.map((id, i): [string, Vec3] => [
    id,
    [-2 + i, 0.15, -8],
  ]),
  ...start.baselineKubbs.host.map((id, i): [string, Vec3] => [
    id,
    [-2 + i, 0.15, 0],
  ]),
  ['king', [0, 0.15, -4]],
]);
const view = (over: Partial<PolicyView> = {}): PolicyView => ({
  state: initialMatchState(),
  halves,
  positions,
  racked: ['stick-0', 'stick-1'],
  ...over,
});

describe('policy', () => {
  it("hits the opponent's baseline kubbs when no field kubb stands", () => {
    const target = chooseTarget(view(), 'hit');
    expect(target[2]).toBeCloseTo(-8, 5);
  });

  it('misses beside the court', () => {
    expect(Math.abs(chooseTarget(view(), 'miss')[0])).toBeGreaterThan(
      halves.halfWidthM + 1,
    );
  });

  it('aims at the king when asked', () => {
    expect(chooseTarget(view(), 'king')).toEqual([0, 0.15, -4]);
  });

  it('releases behind the line, or past it for a foot fault', () => {
    expect(releasePoint(view(), 'hit', 0)[2]).toBeLessThan(0);
    expect(releasePoint(view(), 'hit', 0)[2]).toBeGreaterThan(-0.9);
    expect(releasePoint(view(), 'footFault', 0)[2]).toBeLessThan(-0.9);
  });

  it('plans the next racked stick, none when the rack is empty', () => {
    expect(planStick(view(), 'hit')?.pieceId).toBe('stick-0');
    expect(planStick(view({ racked: [] }), 'hit')).toBeNull();
  });

  it('tosses inkast into the half, or outside it', () => {
    const state = {
      ...initialMatchState(),
      currentTurn: 'guest' as const,
      phase: 'inkast' as const,
      inkastQueue: [{ kubbId: 'kubb-1', attempt: 1 as const }],
    };
    const legal = planInkast(view({ state }), true);
    const out = planInkast(view({ state }), false);
    expect(legal?.pieceId).toBe('kubb-1');
    // The guest tosses into the HOST half: z between centre and near.
    expect(legal?.target[2]).toBeGreaterThan(halves.centreZ);
    expect(legal?.target[2]).toBeLessThan(halves.nearBaselineZ);
    expect(Math.abs(out?.target[0] ?? 0)).toBeGreaterThan(halves.halfWidthM);
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `npx vitest run tools/botmatch/policy.test.ts`
Expected: FAIL (module missing).

- [ ] **Step 3: Implement**

```ts
// tools/botmatch/policy.ts
import type { CourtHalves } from '../../src/core/inkast.js';
import { standingLineZ } from '../../src/core/match.js';
import type { MatchSide, MatchState } from '../../src/core/match.js';
import type { Vec3 } from '../../src/core/vec3.js';

/**
 * The bot match's brain (docs/superpowers/specs/2026-10-31-bot-match-
 * and-play-sessions-design.md): pure choices from the server's match
 * state and the latest snapshot. No randomness — a scenario plays the
 * same way every run; physics supplies the variation.
 */
export type Intent = 'hit' | 'miss' | 'king' | 'footFault';

export interface PolicyView {
  state: MatchState;
  halves: CourtHalves;
  positions: ReadonlyMap<string, Vec3>;
  racked: readonly string[];
}

export interface ThrowPlan {
  pieceId: string;
  from: Vec3;
  target: Vec3;
  speedMps: number;
}

const RELEASE_HEIGHT_M = 1;
const INSIDE_LINE_M = 0.3;
const FOOT_FAULT_PAST_M = 1.3;
const MISS_BESIDE_M = 1.5;
const STICK_SPEED_MPS = 7;
const INKAST_SPEED_MPS = 5;
const KUBB_HEIGHT_M = 0.15;

const opponent = (side: MatchSide): MatchSide =>
  side === 'host' ? 'guest' : 'host';
/** +1 when this side throws towards −z (the host), −1 for the guest. */
const forward = (side: MatchSide): number => (side === 'host' ? 1 : -1);

function standing(view: PolicyView, ids: readonly string[]): Vec3 | null {
  for (const id of ids) {
    const p = view.positions.get(id);
    if (p) return [p[0], KUBB_HEIGHT_M, p[2]];
  }
  return null;
}

export function chooseTarget(view: PolicyView, intent: Intent): Vec3 {
  const side = view.state.currentTurn;
  const other = opponent(side);
  const king = view.positions.get('king') ?? [
    0,
    KUBB_HEIGHT_M,
    view.halves.centreZ,
  ];
  if (intent === 'king') return [king[0], KUBB_HEIGHT_M, king[2]];
  const fieldIds = view.state.fieldKubbs
    .filter((k) => k.half === other)
    .map((k) => k.kubbId);
  const target =
    standing(view, fieldIds) ??
    standing(view, view.state.baselineKubbs[other]) ??
    ([king[0], KUBB_HEIGHT_M, king[2]] as Vec3);
  if (intent === 'miss') {
    return [view.halves.halfWidthM + MISS_BESIDE_M, KUBB_HEIGHT_M, target[2]];
  }
  return target;
}

export function releasePoint(
  view: PolicyView,
  intent: Intent,
  stickIndex: number,
): Vec3 {
  const side = view.state.currentTurn;
  const lineZ = standingLineZ(view.state, side, view.halves);
  const past = intent === 'footFault' ? FOOT_FAULT_PAST_M : -INSIDE_LINE_M;
  return [
    0.2 - stickIndex * 0.08,
    RELEASE_HEIGHT_M,
    lineZ - past * forward(side),
  ];
}

export function planStick(view: PolicyView, intent: Intent): ThrowPlan | null {
  const pieceId = view.racked[0];
  if (pieceId === undefined) return null;
  const index = Number(pieceId.replace('stick-', '')) || 0;
  return {
    pieceId,
    from: releasePoint(view, intent, index),
    target: chooseTarget(view, intent),
    speedMps: STICK_SPEED_MPS,
  };
}

export function planInkast(view: PolicyView, legal: boolean): ThrowPlan | null {
  const next = view.state.inkastQueue[0];
  if (!next) return null;
  const side = view.state.currentTurn;
  const other = opponent(side);
  const { nearBaselineZ: nearZ, farBaselineZ: farZ, centreZ } = view.halves;
  const ownZ = side === 'host' ? nearZ : farZ;
  const halfMidZ = ((other === 'host' ? nearZ : farZ) + centreZ) / 2;
  return {
    pieceId: next.kubbId,
    from: [0, RELEASE_HEIGHT_M, ownZ - INSIDE_LINE_M * forward(side)],
    target: legal
      ? [0, KUBB_HEIGHT_M, halfMidZ]
      : [view.halves.halfWidthM + MISS_BESIDE_M, KUBB_HEIGHT_M, halfMidZ],
    speedMps: INKAST_SPEED_MPS,
  };
}
```

- [ ] **Step 4: Run tests and typecheck**

Run: `npx vitest run tools/botmatch/policy.test.ts && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add tools/botmatch/policy.ts tools/botmatch/policy.test.ts tsconfig.json
git commit -m "feat: bot match policies — targets, releases and inkast per intent"
```

---

### Task 3: The protocol bot (player B)

**Files:**

- Create: `tools/botmatch/protocolBot.ts`
- Test: `tools/botmatch/protocolBot.test.ts`

**Interfaces:**

- Consumes: `parseServerMessage`, `parseClientMessage`, `ClientMessage`,
  `ServerMessage`, `SERVER_PROTOCOL_VERSION`, `SERVER_PATH`
  (`src/core/serverProtocol.ts`); `buildPresenceMessage`, `standingPose`
  (`src/core/presence.ts`).
- Produces:

```ts
export function joinMessage(clientId: string): ClientMessage;
export function throwMessage(plan: {
  pieceId: string;
  from: Vec3;
  velocity: Vec3;
  spin: Vec3;
}): ClientMessage;
export class ProtocolBot {
  side: MatchSide | null;
  match: MatchState | null; // latest `match`
  positions: Map<string, Vec3>; // latest snapshot
  notices: Array<{ kind: 'footFault'; side: MatchSide }>;
  rooms: GameMode[]; // every `room` message seen
  rounds: number; // `round` messages seen
  static connect(baseUrl: string, clientId: string): Promise<ProtocolBot>;
  send(message: ClientMessage): void;
  close(): void;
}
```

The presence stream (20 Hz) stands B's avatar behind its baseline:
head at 1.7 m, hands at 1.0 m, built with `standingPose` and
`buildPresenceMessage`. Look at `src/core/presence.ts` `standingPose`
for its exact signature before using it, and mirror it to B's baseline
the same way the client does.

- [ ] **Step 1: Write the failing test**

```ts
// tools/botmatch/protocolBot.test.ts
import { describe, expect, it } from 'vitest';
import { parseClientMessage } from '../../src/core/serverProtocol.js';
import { joinMessage, throwMessage } from './protocolBot.js';

describe('protocol bot messages', () => {
  it('builds a join the server accepts', () => {
    expect(parseClientMessage(joinMessage('botmatch-guest-01'))).not.toBeNull();
  });

  it('builds a throw the server accepts', () => {
    const message = throwMessage({
      pieceId: 'stick-0',
      from: [0.2, 1, -7.7],
      velocity: [0, 3.5, 6.5],
      spin: [22, 0, 0],
    });
    expect(parseClientMessage(message)).not.toBeNull();
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `npx vitest run tools/botmatch/protocolBot.test.ts`
Expected: FAIL (module missing).

- [ ] **Step 3: Implement**

```ts
// tools/botmatch/protocolBot.ts
import WebSocket from 'ws';
import type { MatchSide, MatchState } from '../../src/core/match.js';
import { buildPresenceMessage } from '../../src/core/presence.js';
import {
  parseServerMessage,
  SERVER_PATH,
  SERVER_PROTOCOL_VERSION,
} from '../../src/core/serverProtocol.js';
import type { ClientMessage } from '../../src/core/serverProtocol.js';
import type { GameMode } from '../../src/core/settings.js';
import type { Vec3 } from '../../src/core/vec3.js';

/** Player B of the bot match: a headless client speaking protocol v3
 * with the shared zod schemas. It throws only what the orchestrator
 * tells it to, and records what the server says. */
export function joinMessage(clientId: string): ClientMessage {
  return {
    type: 'join',
    protocol: SERVER_PROTOCOL_VERSION,
    gameMode: 'simple',
    clientId,
    colorIndex: 4,
    profileName: null,
  };
}

export function throwMessage(plan: {
  pieceId: string;
  from: Vec3;
  velocity: Vec3;
  spin: Vec3;
}): ClientMessage {
  return {
    type: 'throw',
    pieceId: plan.pieceId,
    position: plan.from,
    quaternion: [0, 0, 0, 1],
    linearVelocity: plan.velocity,
    angularVelocity: plan.spin,
  };
}

const PRESENCE_EVERY_MS = 50;

export class ProtocolBot {
  side: MatchSide | null = null;
  match: MatchState | null = null;
  readonly positions = new Map<string, Vec3>();
  readonly notices: Array<{ kind: 'footFault'; side: MatchSide }> = [];
  readonly rooms: GameMode[] = [];
  rounds = 0;
  private presenceTimer: NodeJS.Timeout | null = null;

  private constructor(private readonly socket: WebSocket) {}

  static connect(baseUrl: string, clientId: string): Promise<ProtocolBot> {
    const url = new URL(SERVER_PATH, baseUrl);
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    const socket = new WebSocket(url, { rejectUnauthorized: false });
    const bot = new ProtocolBot(socket);
    return new Promise((resolve, reject) => {
      socket.once('error', reject);
      socket.on('message', (data) => bot.onMessage(String(data)));
      socket.once('open', () => {
        bot.send(joinMessage(clientId));
        bot.presenceTimer = setInterval(
          () => bot.sendPresence(),
          PRESENCE_EVERY_MS,
        );
        resolve(bot);
      });
    });
  }

  send(message: ClientMessage): void {
    if (this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(message));
    }
  }

  close(): void {
    if (this.presenceTimer) clearInterval(this.presenceTimer);
    this.socket.close();
  }

  private sendPresence(): void {
    if (this.side === null) return;
    // Behind the guest's baseline, facing the court (+z): the server
    // relays it as-is and the host's PeerAvatarSystem draws a body.
    const z = this.side === 'guest' ? -8.4 : 0.4;
    const pose = (y: number, x: number) => ({
      position: [x, y, z] as Vec3,
      quaternion: [
        0,
        this.side === 'guest' ? 1 : 0,
        0,
        this.side === 'guest' ? 0 : 1,
      ] as [number, number, number, number],
    });
    this.send({
      type: 'presence',
      message: buildPresenceMessage({
        head: pose(1.7, 0),
        leftHand: pose(1.0, -0.3),
        rightHand: pose(1.0, 0.3),
        colorIndex: 4,
      }),
    });
  }

  private onMessage(raw: string): void {
    let data: unknown;
    try {
      data = JSON.parse(raw);
    } catch {
      return;
    }
    const message = parseServerMessage(data);
    if (!message) return;
    switch (message.type) {
      case 'welcome':
        this.side = message.side;
        return;
      case 'snapshot':
        for (const p of message.pieces) this.positions.set(p.id, p.position);
        return;
      case 'match':
        this.match = message.state;
        return;
      case 'notice':
        this.notices.push({ kind: message.kind, side: message.side });
        return;
      case 'room':
        this.rooms.push(message.gameMode);
        return;
      case 'round':
        this.rounds += 1;
        return;
      default:
        return;
    }
  }
}
```

Before relying on the presence coordinates, check how the server and
`PeerAvatarSystem` treat a guest's presence (the server may mirror it
with `mirrorPoseToFarBaseline`). If the server mirrors, send the pose in
the guest's OWN frame (near baseline, z = +0.4, facing −z) exactly like
a real guest headset does, and drop the hand-written z/quaternion above.
The spectator screenshot in Task 6 shows whether B's avatar stands
behind the far baseline.

- [ ] **Step 4: Run tests and typecheck**

Run: `npx vitest run tools/botmatch/protocolBot.test.ts && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add tools/botmatch/protocolBot.ts tools/botmatch/protocolBot.test.ts
git commit -m "feat: bot match protocol bot for player B"
```

---

### Task 4: Browser player A, scenarios and the run loop

**Files:**

- Create: `tools/botmatch/browserPlayer.ts`, `tools/botmatch/scenarios.ts`, `tools/botmatch/main.ts`
- Modify: `package.json` (script `"botmatch": "tsx tools/botmatch/main.ts"`), `eslint.config.js` if `tools/` needs Node globals

**Interfaces:**

- Consumes: Task 1 `aimRelease`, `flightTimeFor`; Task 2 `planStick`,
  `planInkast`, `Intent`, `PolicyView`; Task 3 `ProtocolBot`, `throwMessage`.
- Produces: `npm run botmatch -- [--scenario <name>|all] [--url <base>] [--out <dir>]`.

`browserPlayer.ts`:

```ts
import { chromium } from 'playwright';
import type { Browser, Page } from 'playwright';
import type { GameMode } from '../../src/core/settings.js';
import type { Vec3 } from '../../src/core/vec3.js';

/** Player A: the real app in a browser, joined at once (`?player=1`)
 * with the debug relay on, driven through the app's own event bus
 * (`globalThis.__kubbDev`, src/index.ts). A fixed clientId lets a rerun
 * reclaim the seat inside the server's rejoin grace. */
export class BrowserPlayer {
  private constructor(
    private readonly browser: Browser,
    readonly page: Page,
  ) {}

  static async open(baseUrl: string): Promise<BrowserPlayer> {
    const browser = await chromium.launch({
      headless: !process.env['DISPLAY'],
      args: [
        '--ignore-certificate-errors',
        '--use-fake-ui-for-media-stream',
        '--use-fake-device-for-media-stream',
      ],
    });
    const ctx = await browser.newContext({
      ignoreHTTPSErrors: true,
      viewport: { width: 960, height: 540 },
    });
    await ctx.addInitScript(() => {
      localStorage.setItem('kubborama.clientId', 'botmatch-host-0001');
    });
    const page = await ctx.newPage();
    const url = new URL(baseUrl);
    url.searchParams.set('player', '1');
    url.searchParams.set('debug', '1');
    await page.goto(url.href, { waitUntil: 'load', timeout: 60000 });
    await page.waitForFunction(
      () =>
        (
          globalThis as {
            __kubbDev?: {
              debugContext: { pieceIdByEntityIndex: Map<number, string> };
            };
          }
        ).__kubbDev?.debugContext.pieceIdByEntityIndex.size ?? 0 > 0,
      null,
      { timeout: 60000 },
    );
    return new BrowserPlayer(browser, page);
  }

  /** A stick through `Thrown`, as ThrowingSystem emits it on release. */
  throwStick(
    pieceId: string,
    from: Vec3,
    velocity: Vec3,
    spin: Vec3,
  ): Promise<void> {
    return this.page.evaluate(
      ({ pieceId, from, velocity, spin }) => {
        const dev = (
          globalThis as unknown as {
            __kubbDev: {
              gameEvents: { emit: (n: string, e: unknown) => void };
              debugContext: { pieceIdByEntityIndex: Map<number, string> };
            };
          }
        ).__kubbDev;
        const entry = [...dev.debugContext.pieceIdByEntityIndex].find(
          ([, id]) => id === pieceId,
        );
        if (!entry) return;
        dev.gameEvents.emit('Thrown', {
          stickId: String(entry[0]),
          handId: 'right',
          releaseSpeedMps: Math.hypot(...velocity),
          releaseVelocity: velocity,
          angularVelocity: spin,
          releasePosition: from,
          style: 'underhand',
          flipQualityScore: 90,
          presetId: 'A',
          timeS: 0,
        });
      },
      { pieceId, from, velocity, spin },
    );
  }

  /** An inkast kubb straight through the server link, as InkastSystem does. */
  tossKubb(pieceId: string, from: Vec3, velocity: Vec3): Promise<void> {
    return this.page.evaluate(
      ({ pieceId, from, velocity }) => {
        const dev = (
          globalThis as unknown as {
            __kubbDev: {
              serverLink: () => { sendThrow: (...a: unknown[]) => void };
            };
          }
        ).__kubbDev;
        dev
          .serverLink()
          .sendThrow(pieceId, from, [0, 0, 0, 1], velocity, [0, 0, 0]);
      },
      { pieceId, from, velocity },
    );
  }

  /** "Ny runda" / court switch through the same events the menu emits. */
  room(
    action: { kind: 'reset' } | { kind: 'court'; gameMode: GameMode },
  ): Promise<void> {
    return this.page.evaluate((a) => {
      const dev = (
        globalThis as unknown as {
          __kubbDev: { gameEvents: { emit: (n: string, e: unknown) => void } };
        }
      ).__kubbDev;
      if (a.kind === 'reset') dev.gameEvents.emit('ServerResetRequested', {});
      else
        dev.gameEvents.emit('ServerGameModeRequested', {
          gameMode: a.gameMode,
        });
    }, action);
  }

  close(): Promise<void> {
    return this.browser.close();
  }
}
```

Check the payload types of `ServerResetRequested` and
`ServerGameModeRequested` in `src/core/events.ts` and match them.

`scenarios.ts` (each scenario: who plays which intent, a success
predicate over what the bot observed, a time box and the gate checks it
should turn to PASS):

```ts
import type { MatchSide } from '../../src/core/match.js';
import type { Intent } from './policy.js';
import type { ProtocolBot } from './protocolBot.js';

export interface Scenario {
  name: string;
  timeBoxS: number;
  /** The intent for `side`'s next stick, given how many it threw this turn. */
  intent(side: MatchSide, stickInTurn: number, turnIndex: number): Intent;
  /** Inkast tosses: legal unless this returns false for the attempt. */
  legalInkast(side: MatchSide, attempt: 1 | 2): boolean;
  /** Room actions at a given turn index (the `room` scenario only). */
  roomAt?: (
    turnIndex: number,
  ) => Array<
    { by: MatchSide; kind: 'reset' } | { by: MatchSide; kind: 'court' }
  >;
  done(bot: ProtocolBot): boolean;
  expectedChecks: string[];
}

const hitAll = () => 'hit' as const;

export const SCENARIOS: Scenario[] = [
  {
    name: 'win',
    timeBoxS: 900,
    intent: (side) => (side === 'host' ? 'hit' : 'miss'),
    legalInkast: () => true,
    done: (bot) => bot.match?.winner === 'host',
    expectedChecks: ['mp3a-king-win', 'mp3a-restart', 'mp3a-score'],
  },
  {
    name: 'early-king',
    timeBoxS: 120,
    intent: (side, stick) => (side === 'host' && stick === 0 ? 'king' : 'miss'),
    legalInkast: () => true,
    done: (bot) => bot.match?.endReason === 'kingFelledEarly',
    expectedChecks: ['mp3a-king-early'],
  },
  {
    name: 'inkast-miss',
    timeBoxS: 300,
    intent: (side) => (side === 'host' ? 'hit' : 'miss'),
    legalInkast: (side) => side !== 'guest',
    done: (bot) => (bot.match?.fieldKubbs.length ?? 0) > 0,
    expectedChecks: ['mp4-inkast-retry', 'mp4-inkast-clamp'],
  },
  {
    name: 'advantage',
    timeBoxS: 300,
    intent: (side, _stick, turn) =>
      side === 'host' && turn === 0 ? 'hit' : side === 'host' ? 'hit' : 'miss',
    legalInkast: () => true,
    done: (bot) =>
      bot.match?.currentTurn === 'host' &&
      (bot.match?.fieldKubbs.some((k) => k.half === 'host') ?? false),
    expectedChecks: ['mp4-advantage'],
  },
  {
    name: 'foot-fault',
    timeBoxS: 60,
    intent: (side, stick) =>
      side === 'host' && stick === 0 ? 'footFault' : 'miss',
    legalInkast: () => true,
    done: (bot) =>
      bot.notices.some((n) => n.kind === 'footFault' && n.side === 'host'),
    expectedChecks: ['foot-fault'],
  },
  {
    name: 'room',
    timeBoxS: 60,
    intent: hitAll,
    legalInkast: () => true,
    roomAt: (turn) =>
      turn === 0
        ? [
            { by: 'host', kind: 'reset' },
            { by: 'guest', kind: 'reset' },
            { by: 'host', kind: 'court' },
          ]
        : [],
    done: (bot) => bot.rooms.length > 0,
    expectedChecks: ['mp3a-reset-host', 'mp3a-reset-guest', 'room-court'],
  },
];
```

The `king-6th` case from the spec comes out of `win` when the king falls
on a sixth stick; `mp3a-king-6th` is listed as expected only when the
gate report shows a `king decision` with `stickNumberInRound: 6`. Report
it as NOT SEEN otherwise, not as FAIL.

`main.ts` run loop (per scenario):

1. Parse `--scenario` (default `all`), `--url` (default
   `https://localhost:8081/`) and `--out` (default
   `$TMPDIR/kubb-botmatch/<timestamp>`).
2. Move the current debug log aside, as `scripts/server-two-clients.mjs`
   does, so the gate report covers only this run.
3. Start `scripts/spectate.mjs --url <base> --out <out>/spectator --every 20 --on-cut`
   as a child process.
4. Open `BrowserPlayer` (it joins first, so it is the host), then
   `ProtocolBot.connect(base, 'botmatch-guest-0001')`. Wait until
   `bot.match?.currentTurn === 'host'`.
5. For each scenario: A sends `room({kind:'reset'})`, wait 1.5 s (room
   cooldown 1 s). Then loop every 250 ms until `done(bot)` or the time
   box:
   - When `bot.match` is in `throwing` for side S and S has racked
     sticks, wait 0.7 s between sticks, take `planStick(view, intent)`,
     compute `velocity = aimRelease(plan.from, plan.target, flightTimeFor(plan.from, plan.target, plan.speedMps))`
     and spin `[±22, 0, 0]` (the sign follows the throwing direction).
     S = host → `browser.throwStick`; S = guest → `bot.send(throwMessage(...))`.
   - When in `inkast` for S: `planInkast(view, legalInkast(S, attempt))`,
     same aim at the inkast speed, S = host → `browser.tossKubb`, guest →
     `bot.send(throwMessage({... spin: [0,0,0]}))`. Wait 4 s for it to settle.
   - Track racked sticks from the snapshot: a stick counts as racked
     while it is within 0.3 m of the position it had when the turn began.
     Reset that baseline when `currentTurn` or `phase` changes, and bump
     `turnIndex`.
   - Room actions from `roomAt(turnIndex)` run once each, 1.2 s apart:
     host through `browser.room`, guest through `bot.send({type:'reset'})`.
     For `court`, pick the mode the room is not on.
6. After all scenarios, wait 12 s (the win restart), close the bot,
   the browser and the spectator (SIGINT), run `npm run gate:report`,
   and parse lines matching `/^(PASS|FAIL|NOT SEEN|EYES)\s+(\S+)/`.
7. Print one row per scenario: `PASS` when `done` fired and every
   expected check is PASS; `FAIL` when any expected check is FAIL or a
   scenario's own predicate contradicts the rules; `NOT SEEN` when the time
   box ran out. Then the spectator screenshot folder. Exit 1 on any FAIL.

Use `sleep = (ms) => new Promise((r) => setTimeout(r, ms))`. Keep
`main.ts` under ~250 lines; move helpers (racked-stick tracking, gate
report parsing) into small functions in the same file.

- [ ] **Step 1: Write `browserPlayer.ts`, `scenarios.ts`, `main.ts` and the npm script**
- [ ] **Step 2: Typecheck and lint**

Run: `npx tsc --noEmit && npx eslint tools`
Expected: clean.

- [ ] **Step 3: Smoke run one short scenario on the dev server**

Run: `npx iwsdk dev up --no-open` (then `npx iwsdk dev status` shows
`running: true`), then `DISPLAY=:1 npm run botmatch -- --scenario foot-fault`.
Expected: the `foot-fault` row is PASS, the gate report shows `PASS foot-fault`.

- [ ] **Step 4: Commit**

```bash
git add tools/botmatch package.json eslint.config.js
git commit -m "feat: npm run botmatch — browser host, protocol guest, scripted scenarios"
```

---

### Task 5: Spectator screenshots at camera cuts

**Files:**

- Modify: `scripts/spectate.mjs`

- [ ] **Step 1: Add `--on-cut`**

Parse `const onCut = process.argv.includes('--on-cut');`. In `open()`,
extend the console handler:

```js
page.on('console', (m) => {
  if (m.type() === 'error') console.log(`${stamp()} console ${m.text()}`);
  if (onCut && m.text().includes('camera cut')) {
    shot += 1;
    const file = join(
      out,
      `${stamp().replaceAll(':', '')}-${String(shot).padStart(4, '0')}-cut.jpg`,
    );
    // A short delay so the new shot has rendered a frame or two.
    setTimeout(() => {
      page
        ?.screenshot({ path: file, type: 'jpeg', quality: 60 })
        .catch(() => {});
    }, 400);
  }
});
```

Update the header comment's usage line with `[--on-cut]`.

- [ ] **Step 2: Check it**

Run (dev server up): `DISPLAY=:1 timeout -s INT 40 node scripts/spectate.mjs --url https://localhost:8081/ --out <scratchpad>/cut-test --every 60 --on-cut`
while `npm run check:server` runs. Expected: several `*-cut.jpg` files.

- [ ] **Step 3: Commit**

```bash
git add scripts/spectate.mjs
git commit -m "feat: spectate --on-cut saves a screenshot at every camera cut"
```

---

### Task 6: Full run, fixes, play-session docs

**Files:**

- Create: `docs/playtest-checklist.md`, `docs/IMPROVEMENTS.md`
- Modify: `README.md`, `docs/DECISIONS.md`, plus whatever the run finds

- [ ] **Step 1: Run every scenario**

Run: `DISPLAY=:1 npm run botmatch -- --scenario all`
Expected: a report row per scenario. Look at five or six spectator
screenshots (small) for graphical faults.

- [ ] **Step 2: Triage**

For each FAIL: is it the bot (wrong aim, timing) or the game (rules,
client)? Bot problems: fix the policy or the timing. Game rule bugs:
systematic-debugging, a failing core/server test first, then the fix.
NOT SEEN: lengthen the time box or adjust the intent, but don't loop on
physics luck past two tries — record it.

- [ ] **Step 3: Write `docs/playtest-checklist.md`**

The checklist for my emulator sessions, each line a thing to look at,
with the tool that shows it:

```markdown
# Play-session checklist (emulator)

Run with the dev server up and the managed browser open
(`npx iwsdk dev up`), XR session accepted. Screenshots small
(`browser_screenshot`, `screenshotSize` ≤ 512), text tools first.

1. Spawn: view from the near baseline — court, kubbs, king, HUD sign readable.
2. Look around 360°: trees, sky, no holes, no z-fighting, no floating props.
3. Walk to the far side (thumbstick): the walk limit holds at the line.
4. Grab a stick (squeeze) and throw it (iwsdk-grab / xr_animate_to);
   the stick flies, lands, the HUD counts it.
5. Throw all six: sin bin fills beside the court, no overlap.
6. Menu: open every tab (Spel, Alternativ, Statistik); no text overflow,
   both languages.
7. Court switch: lines and kubbs move, no leftovers.
8. Advantage line: shown at the right place when field kubbs remain.
9. Opponent avatar (run with the protocol bot as B): body, hands, colour.
10. Frame time: `scene_get_render_stats` — draw calls and triangles
    compared with the last session.
```

- [ ] **Step 4: Write `docs/IMPROVEMENTS.md`**

```markdown
# Improvement ideas (awaiting Erik's approval)

Look-and-feel ideas from bot matches and play sessions. One line each:
the idea, why, what I saw. Erik marks ✅ (build it) or ~~strikes~~ it.
Bugs never land here — they are fixed at once.

| Date | Idea | Why / what I saw | Status |
| ---- | ---- | ---------------- | ------ |
```

Fill in any ideas from Step 1.

- [ ] **Step 5: Docs**

README, under "Playing at home": a short "Testing without headsets"
paragraph (`npm run botmatch`, dev server needed, what the report means).
DECISIONS: the entry for the bot match and play sessions (hybrid, fixed
client ids reclaim the seats, intents, evidence from protocol + gate report).

- [ ] **Step 6: Full checks and commit**

Run: `npx tsc --noEmit && npx eslint . && npx vitest run --reporter=dot`
Expected: clean, all tests pass.

```bash
git add -A
git commit -m "docs: play-session checklist, improvements log, bot match notes"
```

- [ ] **Step 7: First play session**

Follow `docs/playtest-checklist.md` once with the bot as player B.
Fix plain faults; add ideas to `docs/IMPROVEMENTS.md`; report to Erik.
