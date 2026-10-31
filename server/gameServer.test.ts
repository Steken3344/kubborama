import { describe, expect, it } from 'vitest';
import { SERVER_PROTOCOL_VERSION } from '../src/core/serverProtocol.js';
import type { ServerMessage } from '../src/core/serverProtocol.js';
import { GameServer, REJOIN_GRACE_MS } from './gameServer.js';
import { noServerLog } from './serverLog.js';

const clock = { now: 0 };

function fakeClient() {
  const received: ServerMessage[] = [];
  let closed = false;
  return {
    received,
    get closed() {
      return closed;
    },
    connection: {
      send: (m: ServerMessage) => {
        received.push(m);
      },
      close: () => {
        closed = true;
      },
    },
  };
}

let nextId = 0;
const join = (
  gameMode: 'simple' | 'advanced' = 'simple',
  clientId = `client-${(nextId += 1)}-xxxx`,
) => ({
  type: 'join',
  protocol: SERVER_PROTOCOL_VERSION,
  gameMode,
  clientId,
});

describe('GameServer (MP5)', () => {
  it('assigns side A then B, rejects a third player', async () => {
    const server = new GameServer({ log: noServerLog, nowMs: () => clock.now });
    const a = fakeClient();
    const b = fakeClient();
    const c = fakeClient();
    const ha = server.connect(a.connection);
    const hb = server.connect(b.connection);
    const hc = server.connect(c.connection);
    await ha.receive(join());
    await hb.receive(join('advanced')); // the room keeps A's court
    await hc.receive(join());
    expect(a.received).toContainEqual({
      type: 'welcome',
      protocol: SERVER_PROTOCOL_VERSION,
      side: 'host',
      gameMode: 'simple',
    });
    expect(b.received).toContainEqual({
      type: 'welcome',
      protocol: SERVER_PROTOCOL_VERSION,
      side: 'guest',
      gameMode: 'simple',
    });
    expect(c.received).toContainEqual({ type: 'rejected', reason: 'full' });
    expect(c.closed).toBe(true);
    expect(a.received).toContainEqual({ type: 'peers', count: 2 });
  });

  it('keeps a seat for the rejoin grace, then frees it', async () => {
    const server = new GameServer({ log: noServerLog, nowMs: () => clock.now });
    const a = fakeClient();
    const b = fakeClient();
    const again = fakeClient();
    const ha = server.connect(a.connection);
    await ha.receive(join('simple', 'headset-A-1234'));
    ha.close();
    // Same browser back within the grace → same side.
    const hAgain = server.connect(again.connection);
    await hAgain.receive(join('simple', 'headset-A-1234'));
    expect(again.received).toContainEqual({
      type: 'welcome',
      protocol: SERVER_PROTOCOL_VERSION,
      side: 'host',
      gameMode: 'simple',
    });
    hAgain.close();
    clock.now += REJOIN_GRACE_MS + 1;
    server.tick();
    const hb = server.connect(b.connection);
    await hb.receive(join());
    expect(b.received).toContainEqual({
      type: 'welcome',
      protocol: SERVER_PROTOCOL_VERSION,
      side: 'host',
      gameMode: 'simple',
    });
  });

  it('rejects a wrong protocol and ignores garbage', async () => {
    const server = new GameServer({ log: noServerLog, nowMs: () => clock.now });
    const a = fakeClient();
    const ha = server.connect(a.connection);
    await ha.receive({ type: 'nonsense' });
    await ha.receive({ ...join(), protocol: 999 });
    expect(a.received).toContainEqual({ type: 'rejected', reason: 'protocol' });
  });

  it('sends snapshots at 20 Hz of a 60 Hz simulation, and applies a throw', async () => {
    const server = new GameServer({ log: noServerLog, nowMs: () => clock.now });
    const a = fakeClient();
    const ha = server.connect(a.connection);
    await ha.receive(join());
    for (let i = 0; i < 6; i++) {
      server.tick();
    }
    const snapshots = a.received.filter((m) => m.type === 'snapshot');
    expect(snapshots).toHaveLength(2);
    await ha.receive({
      type: 'throw',
      pieceId: 'stick-0',
      position: [0.2, 1, -0.3],
      quaternion: [0, 0, 0, 1],
      linearVelocity: [0, 3.2, -6],
      angularVelocity: [-22, 0, 0],
    });
    for (let i = 0; i < 30; i++) {
      server.tick();
    }
    const last = a.received.filter((m) => m.type === 'snapshot').at(-1);
    const stick =
      last?.type === 'snapshot'
        ? last.pieces.find((p) => p.id === 'stick-0')
        : undefined;
    // Half a second into a ~6 m underhand throw: well out over the court.
    expect(stick?.position[2]).toBeLessThan(-2);
    expect(stick?.position[1]).toBeGreaterThan(0.5);
  });
});

describe('GameServer — untrusted clients (review)', () => {
  const throwOf = (pieceId: string) => ({
    type: 'throw',
    pieceId,
    position: [0.2, 1, -0.3],
    quaternion: [0, 0, 0, 1],
    linearVelocity: [0, 3.2, -6],
    angularVelocity: [-22, 0, 0],
  });
  const kingZ = (server: GameServer, a: ReturnType<typeof fakeClient>) => {
    for (let i = 0; i < 3; i++) server.tick();
    const last = a.received.filter((m) => m.type === 'snapshot').at(-1);
    return last?.type === 'snapshot'
      ? last.pieces.find((p) => p.id === 'king')?.position[2]
      : undefined;
  };
  it('only sticks can be thrown (no teleporting the king)', async () => {
    const server = new GameServer({ log: noServerLog, nowMs: () => clock.now });
    const a = fakeClient();
    const ha = server.connect(a.connection);
    await ha.receive(join());
    const before = kingZ(server, a);
    await ha.receive(throwOf('king'));
    expect(kingZ(server, a)).toBeCloseTo(before ?? 0, 3);
  });
  it('limits how many throws one client may send per second', async () => {
    const server = new GameServer({ log: noServerLog, nowMs: () => clock.now });
    const a = fakeClient();
    const ha = server.connect(a.connection);
    await ha.receive(join());
    let applied = 0;
    for (let i = 0; i < 50; i++) {
      if (await ha.receive(throwOf('stick-1'))) applied += 1;
    }
    expect(applied).toBeLessThanOrEqual(6);
  });
});

describe('GameServer — presence relay (MP7)', () => {
  it("forwards a player's head + hands to the other player only", async () => {
    const server = new GameServer({ log: noServerLog, nowMs: () => clock.now });
    const a = fakeClient();
    const b = fakeClient();
    const ha = server.connect(a.connection);
    const hb = server.connect(b.connection);
    await ha.receive(join());
    await hb.receive(join());
    const pose = { position: [0, 1.6, 0], quaternion: [0, 0, 0, 1] };
    const message = {
      version: 2,
      head: pose,
      leftHand: pose,
      rightHand: pose,
      colorIndex: 1,
    };
    clock.now += 100;
    const accepted = await ha.receive({ type: 'presence', message });
    const toB = b.received.filter((m) => m.type === 'presence');
    const toA = a.received.filter((m) => m.type === 'presence');
    expect(accepted).toBe(true);
    expect(toB).toHaveLength(1);
    expect(toB[0]?.type === 'presence' && toB[0].side).toBe('host');
    expect(toA).toHaveLength(0);
  });
});

describe('GameServer — voice signaling relay', () => {
  it('relays a signal to the other seat only, and caps a flood', async () => {
    const server = new GameServer({ log: noServerLog, nowMs: () => clock.now });
    const a = fakeClient();
    const b = fakeClient();
    const ha = server.connect(a.connection);
    const hb = server.connect(b.connection);
    await ha.receive(join());
    await hb.receive(join());
    await ha.receive({ type: 'signal', data: { kind: 'offer', sdp: 'v=0' } });
    expect(b.received).toContainEqual({
      type: 'signal',
      side: 'host',
      data: { kind: 'offer', sdp: 'v=0' },
    });
    expect(a.received.some((m) => m.type === 'signal')).toBe(false);
    let accepted = 0;
    for (let i = 0; i < 100; i++) {
      if (
        await hb.receive({
          type: 'signal',
          data: {
            kind: 'ice',
            candidate: `c${i}`,
            sdpMid: '0',
            sdpMLineIndex: 0,
          },
        })
      )
        accepted += 1;
    }
    expect(accepted).toBe(60);
  });
});

describe('GameServer — seat lifecycle (2026-10-31)', () => {
  it('a second tab with the same clientId takes the seat over', async () => {
    const server = new GameServer({ log: noServerLog, nowMs: () => clock.now });
    const tab1 = fakeClient();
    const tab2 = fakeClient();
    const h1 = server.connect(tab1.connection);
    await h1.receive(join('simple', 'same-browser-1'));
    const h2 = server.connect(tab2.connection);
    await h2.receive(join('simple', 'same-browser-1'));
    expect(tab1.closed).toBe(true);
    expect(tab2.received).toContainEqual({
      type: 'welcome',
      protocol: SERVER_PROTOCOL_VERSION,
      side: 'host',
      gameMode: 'simple',
    });
    expect(await h1.receive({ type: 'reset' })).toBe(false); // the old tab no longer acts
    expect(await h2.receive({ type: 'reset' })).toBe(true);
  });

  it('both players reload within the grace and keep their sides and the match', async () => {
    const server = new GameServer({ log: noServerLog, nowMs: () => clock.now });
    const a = fakeClient();
    const b = fakeClient();
    const ha = server.connect(a.connection);
    const hb = server.connect(b.connection);
    await ha.receive(join('simple', 'reload-A-1'));
    await hb.receive(join('simple', 'reload-B-1'));
    ha.close();
    hb.close();
    clock.now += 5_000;
    server.tick();
    const a2 = fakeClient();
    const b2 = fakeClient();
    await server.connect(b2.connection).receive(join('simple', 'reload-B-1'));
    await server.connect(a2.connection).receive(join('simple', 'reload-A-1'));
    expect(a2.received.find((m) => m.type === 'welcome')).toMatchObject({
      side: 'host',
    });
    expect(b2.received.find((m) => m.type === 'welcome')).toMatchObject({
      side: 'guest',
    });
    // The rejoiners get the running match straight away.
    expect(
      b2.received.some((m) => m.type === 'match' && m.state !== null),
    ).toBe(true);
  });

  it('drops the world once every seat has expired; the next join starts fresh', async () => {
    const server = new GameServer({ log: noServerLog, nowMs: () => clock.now });
    const a = fakeClient();
    const ha = server.connect(a.connection);
    await ha.receive(join('advanced', 'lonely-A-1'));
    ha.close();
    clock.now += REJOIN_GRACE_MS + 1;
    server.tick();
    const b = fakeClient();
    await server.connect(b.connection).receive(join('simple', 'fresh-B-1'));
    // A fresh room: B is seat A and the court follows B's mode now.
    expect(b.received.find((m) => m.type === 'welcome')).toMatchObject({
      side: 'host',
      gameMode: 'simple',
    });
  });
});
