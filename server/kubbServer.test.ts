import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import {
  SERVER_PATH,
  SERVER_PROTOCOL_VERSION,
} from '../src/core/serverProtocol.js';
import type { ServerMessage } from '../src/core/serverProtocol.js';
import { startKubbServer } from './kubbServer.js';
import type { RunningKubbServer } from './kubbServer.js';
import { noServerLog } from './serverLog.js';

const root = mkdtempSync(join(tmpdir(), 'kubb-server-'));
mkdirSync(join(root, 'dist'), { recursive: true });
writeFileSync(
  join(root, 'dist', 'index.html'),
  '<!doctype html><title>kubb</title>',
);
let server: RunningKubbServer;
let http = '';
let wsUrl = '';

// A fresh server per test: seats survive a disconnect for the rejoin
// grace, so players from one test would otherwise fill the next room.
beforeEach(async () => {
  server = await startKubbServer({
    port: 0,
    host: '127.0.0.1',
    staticDir: join(root, 'dist'),
    logPath: join(root, 'kubb.ndjson'),
    room: 'test-room',
    game: { log: noServerLog },
  });
  http = `http://127.0.0.1:${server.port}`;
  wsUrl = `ws://127.0.0.1:${server.port}${SERVER_PATH}`;
});
afterEach(async () => {
  await server.close();
});

/** A WebSocket player that records every server message. */
async function player(
  clientId: string,
  gameMode: 'simple' | 'advanced' = 'simple',
) {
  const ws = new WebSocket(wsUrl);
  const received: ServerMessage[] = [];
  ws.on('message', (raw) =>
    received.push(JSON.parse(String(raw)) as ServerMessage),
  );
  await new Promise((r) => ws.once('open', r));
  ws.send(
    JSON.stringify({
      type: 'join',
      protocol: SERVER_PROTOCOL_VERSION,
      gameMode,
      clientId,
    }),
  );
  const waitFor = async (pred: (m: ServerMessage) => boolean, ms = 3000) => {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) {
      const hit = received.find(pred);
      if (hit) return hit;
      await new Promise((r) => setTimeout(r, 20));
    }
    throw new Error(`timed out waiting (${clientId})`);
  };
  return {
    ws,
    received,
    waitFor,
    send: (m: unknown) => ws.send(JSON.stringify(m)),
  };
}

describe('standalone KubbOrama server (one address)', () => {
  it('serves the game and the client config from the same address', async () => {
    expect((await fetch(`${http}/`)).status).toBe(200);
    const config = await (await fetch(`${http}/__kubb/config.json`)).json();
    expect(config.server).toBe(true);
    expect(config.room).toBe('test-room');
  });

  it('seats two players, starts a match, streams snapshots, relays avatars', async () => {
    const a = await player('player-A-0001');
    const b = await player('player-B-0001', 'advanced');
    const welcomeA = await a.waitFor((m) => m.type === 'welcome');
    const welcomeB = await b.waitFor((m) => m.type === 'welcome');
    expect(welcomeA.type === 'welcome' && welcomeA.side).toBe('host');
    expect(welcomeB.type === 'welcome' && welcomeB.side).toBe('guest');
    expect(welcomeB.type === 'welcome' && welcomeB.gameMode).toBe('simple');
    const match = await b.waitFor(
      (m) => m.type === 'match' && m.state !== null,
    );
    expect(match.type === 'match' && match.state?.currentTurn).toBe('host');
    await a.waitFor((m) => m.type === 'snapshot');
    const pose = { position: [0, 1.6, 0], quaternion: [0, 0, 0, 1] };
    a.send({
      type: 'presence',
      message: {
        version: 2,
        head: pose,
        leftHand: pose,
        rightHand: pose,
        colorIndex: 2,
      },
    });
    const relayed = await b.waitFor((m) => m.type === 'presence');
    expect(relayed.type === 'presence' && relayed.side).toBe('host');
    a.ws.close();
    b.ws.close();
  });

  it('rejects the off-turn throw and accepts the thrower’s', async () => {
    const a = await player('player-A-0002');
    const b = await player('player-B-0002');
    await b.waitFor((m) => m.type === 'match' && m.state !== null);
    const stickBefore = (await a.waitFor(
      (m) => m.type === 'snapshot',
    )) as Extract<ServerMessage, { type: 'snapshot' }>;
    const z0 =
      stickBefore.pieces.find((p) => p.id === 'stick-3')?.position[2] ?? 0;
    const toss = {
      type: 'throw',
      pieceId: 'stick-3',
      position: [0, 1, -0.3],
      quaternion: [0, 0, 0, 1],
      linearVelocity: [0, 3, -6],
      angularVelocity: [-20, 0, 0],
    };
    b.send(toss); // guest, not on turn
    await new Promise((r) => setTimeout(r, 300));
    const afterGuest = a.received
      .filter((m) => m.type === 'snapshot')
      .at(-1) as Extract<ServerMessage, { type: 'snapshot' }>;
    expect(
      afterGuest.pieces.find((p) => p.id === 'stick-3')?.position[2],
    ).toBeCloseTo(z0, 2);
    a.send(toss); // host, on turn
    await new Promise((r) => setTimeout(r, 300));
    const afterHost = a.received
      .filter((m) => m.type === 'snapshot')
      .at(-1) as Extract<ServerMessage, { type: 'snapshot' }>;
    expect(
      afterHost.pieces.find((p) => p.id === 'stick-3')?.position[2],
    ).toBeLessThan(-1);
    a.ws.close();
    b.ws.close();
  });

  it('turns away a third player and garbage', async () => {
    const a = await player('player-A-0003');
    const b = await player('player-B-0003');
    await b.waitFor((m) => m.type === 'welcome');
    const c = await player('player-C-0003');
    await c.waitFor((m) => m.type === 'rejected');
    a.ws.send('not json at all');
    a.ws.send(
      JSON.stringify({ type: 'throw', pieceId: 'king', position: [0, 1e9, 0] }),
    );
    // Still alive and streaming.
    const before = a.received.length;
    await new Promise((r) => setTimeout(r, 200));
    expect(a.received.length).toBeGreaterThan(before);
    a.ws.close();
    b.ws.close();
  });
});

describe('startup errors', () => {
  it('rejects with EADDRINUSE when the port is taken', async () => {
    await expect(
      startKubbServer({
        port: server.port,
        host: '127.0.0.1',
        staticDir: join(root, 'dist'),
        logPath: join(root, 'kubb.ndjson'),
        room: 'x',
        game: { log: noServerLog },
      }),
    ).rejects.toMatchObject({ code: 'EADDRINUSE' });
  });
});
