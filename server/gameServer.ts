import { courtPresetForMode } from '../src/config.js';
import { NETWORKED_PIECE_IDS } from '../src/core/pieceSync.js';
import {
  parseClientMessage,
  SERVER_PROTOCOL_VERSION,
} from '../src/core/serverProtocol.js';
import type {
  ClientMessage,
  ServerMessage,
} from '../src/core/serverProtocol.js';
import type { MatchSide } from '../src/core/match.js';
import type { Settings } from '../src/core/settings.js';
import { createPhysicsWorld } from './physicsWorld.js';
import type { PhysicsWorld } from './physicsWorld.js';

/** Fixed simulation rate and the snapshot rate derived from it. */
export const TICK_HZ = 60;
export const SNAPSHOT_EVERY_TICKS = 3; // → 20 Hz, like the Trystero pieceSync

/** What the transport (wsServer.ts, or a test) gives the game server. */
export interface ClientConnection {
  send(message: ServerMessage): void;
  close(): void;
}

/** What the game server gives back for each connection. */
export interface ClientHandle {
  /** One decoded JSON message from the client (untrusted). */
  receive(data: unknown): Promise<void>;
  /** The connection went away. */
  close(): void;
}

interface Player {
  connection: ClientConnection;
  side: MatchSide;
}

const SIDES: readonly MatchSide[] = ['host', 'guest'];

/**
 * MP5 (docs/superpowers/specs/2026-09-26-authoritative-server-design.md):
 * one room, two player slots (side A = 'host', side B = 'guest' — the
 * side, not the authority; this server is always the authority). The
 * first player's game mode picks the court; the physics world is built
 * on the first join and dropped when the room empties, so the next
 * session starts from a fresh court. `tick()` advances exactly one
 * fixed 1/TICK_HZ step; `start()` drives it from wall-clock time.
 * Match rules arrive in MP6.
 */
export class GameServer {
  private players = new Map<ClientConnection, Player>();
  private world: PhysicsWorld | null = null;
  private worldPromise: Promise<PhysicsWorld> | null = null;
  private tickCount = 0;
  private timer: ReturnType<typeof setInterval> | null = null;

  connect(connection: ClientConnection): ClientHandle {
    return {
      receive: (data) => this.onMessage(connection, data),
      close: () => this.onClose(connection),
    };
  }

  /** One fixed physics step, plus a snapshot every SNAPSHOT_EVERY_TICKS. */
  tick(): void {
    if (!this.world) {
      return;
    }
    this.world.step(1 / TICK_HZ);
    this.tickCount += 1;
    if (this.tickCount % SNAPSHOT_EVERY_TICKS === 0) {
      this.broadcast({
        type: 'snapshot',
        tick: this.tickCount,
        pieces: this.world.snapshot(NETWORKED_PIECE_IDS),
      });
    }
  }

  /** Real-time loop: catches up whole ticks from elapsed wall time, so a
   * late timer never changes the simulated dt. */
  start(): void {
    if (this.timer) {
      return;
    }
    let last = performance.now();
    let pendingS = 0;
    this.timer = setInterval(() => {
      const now = performance.now();
      pendingS = Math.min(pendingS + (now - last) / 1000, 0.25);
      last = now;
      while (pendingS >= 1 / TICK_HZ) {
        this.tick();
        pendingS -= 1 / TICK_HZ;
      }
    }, 1000 / TICK_HZ);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private async onMessage(
    connection: ClientConnection,
    data: unknown,
  ): Promise<void> {
    const message = parseClientMessage(data);
    if (!message) {
      if (isJoinWithOtherProtocol(data)) {
        connection.send({ type: 'rejected', reason: 'protocol' });
        connection.close();
      }
      return;
    }
    if (message.type === 'join') {
      await this.onJoin(connection, message);
      return;
    }
    if (!this.players.has(connection) || !this.world) {
      return; // only joined players act
    }
    this.world.applyThrow(message);
  }

  private async onJoin(
    connection: ClientConnection,
    message: Extract<ClientMessage, { type: 'join' }>,
  ): Promise<void> {
    if (this.players.has(connection)) {
      return;
    }
    const taken = new Set([...this.players.values()].map((p) => p.side));
    const side = SIDES.find((s) => !taken.has(s));
    if (!side) {
      connection.send({ type: 'rejected', reason: 'full' });
      connection.close();
      return;
    }
    this.players.set(connection, { connection, side });
    await this.ensureWorld(message.gameMode);
    connection.send({
      type: 'welcome',
      protocol: SERVER_PROTOCOL_VERSION,
      side,
    });
    this.broadcast({ type: 'peers', count: this.players.size });
  }

  private async ensureWorld(gameMode: Settings['gameMode']): Promise<void> {
    this.worldPromise ??= createPhysicsWorld(courtPresetForMode(gameMode));
    this.world = await this.worldPromise;
  }

  private onClose(connection: ClientConnection): void {
    if (!this.players.delete(connection)) {
      return;
    }
    if (this.players.size === 0) {
      this.world = null;
      this.worldPromise = null;
      this.tickCount = 0;
      return;
    }
    this.broadcast({ type: 'peers', count: this.players.size });
  }

  private broadcast(message: ServerMessage): void {
    for (const player of this.players.values()) {
      player.connection.send(message);
    }
  }
}

function isJoinWithOtherProtocol(data: unknown): boolean {
  return (
    typeof data === 'object' &&
    data !== null &&
    (data as { type?: unknown }).type === 'join' &&
    (data as { protocol?: unknown }).protocol !== SERVER_PROTOCOL_VERSION
  );
}
