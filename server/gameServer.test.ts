import { describe, expect, it } from 'vitest';
import { SERVER_PROTOCOL_VERSION } from '../src/core/serverProtocol.js';
import type { ServerMessage } from '../src/core/serverProtocol.js';
import { GameServer } from './gameServer.js';

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

const join = (gameMode: 'simple' | 'advanced' = 'simple') => ({
  type: 'join',
  protocol: SERVER_PROTOCOL_VERSION,
  gameMode,
});

describe('GameServer (MP5)', () => {
  it('assigns side A then B, rejects a third player', async () => {
    const server = new GameServer();
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

  it('frees a side when a player leaves', async () => {
    const server = new GameServer();
    const a = fakeClient();
    const b = fakeClient();
    const ha = server.connect(a.connection);
    await ha.receive(join());
    ha.close();
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
    const server = new GameServer();
    const a = fakeClient();
    const ha = server.connect(a.connection);
    await ha.receive({ type: 'nonsense' });
    await ha.receive({ ...join(), protocol: 999 });
    expect(a.received).toContainEqual({ type: 'rejected', reason: 'protocol' });
  });

  it('sends snapshots at 20 Hz of a 60 Hz simulation, and applies a throw', async () => {
    const server = new GameServer();
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
