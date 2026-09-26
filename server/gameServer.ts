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
/** At most this many throws per client per second — six sticks is a
 * whole turn; anything faster is a flood (review, 2026-09-26). */
const MAX_THROWS_PER_SECOND = 6;

/** What the transport (wsServer.ts, or a test) gives the game server. */
export interface ClientConnection {
  send(message: ServerMessage): void;
  close(): void;
}

/** What the game server gives back for each connection. */
export interface ClientHandle {
  /** One decoded JSON message from the client (untrusted). Resolves to
   * whether it was accepted and acted on. */
  receive(data: unknown): Promise<boolean>;
  /** The connection went away. */
  close(): void;
}

interface Player {
  connection: ClientConnection;
  side: MatchSide;
  /** Times (ms) of this player's recent accepted throws. */
  recentThrowsMs: number[];
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
  constructor(private readonly nowMs: () => number = () => performance.now()) {}

  private players = new Map<ClientConnection, Player>();
  private world: PhysicsWorld | null = null;
  private worldPromise: Promise<PhysicsWorld> | null = null;
  private tickCount = 0;
  private gameMode: Settings['gameMode'] = 'simple';
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
  ): Promise<boolean> {
    const message = parseClientMessage(data);
    if (!message) {
      if (isJoinWithOtherProtocol(data)) {
        connection.send({ type: 'rejected', reason: 'protocol' });
        connection.close();
      }
      return false;
    }
    if (message.type === 'join') {
      return this.onJoin(connection, message);
    }
    const player = this.players.get(connection);
    if (!player || !this.world) {
      return false; // only joined players act
    }
    // MP5: only sticks are thrown (kubb tosses join with MP6's inkast);
    // turn ownership is MP6's match rules.
    if (!message.pieceId.startsWith('stick-') || !this.allowThrow(player)) {
      return false;
    }
    return this.world.applyThrow(message);
  }

  private allowThrow(player: Player): boolean {
    const now = this.nowMs();
    player.recentThrowsMs = player.recentThrowsMs.filter((t) => now - t < 1000);
    if (player.recentThrowsMs.length >= MAX_THROWS_PER_SECOND) {
      return false;
    }
    player.recentThrowsMs.push(now);
    return true;
  }

  private async onJoin(
    connection: ClientConnection,
    message: Extract<ClientMessage, { type: 'join' }>,
  ): Promise<boolean> {
    if (this.players.has(connection)) {
      return false;
    }
    const taken = new Set([...this.players.values()].map((p) => p.side));
    const side = SIDES.find((s) => !taken.has(s));
    if (!side) {
      connection.send({ type: 'rejected', reason: 'full' });
      connection.close();
      return false;
    }
    this.players.set(connection, { connection, side, recentThrowsMs: [] });
    await this.ensureWorld(message.gameMode);
    connection.send({
      type: 'welcome',
      protocol: SERVER_PROTOCOL_VERSION,
      side,
      gameMode: this.gameMode,
    });
    this.broadcast({ type: 'peers', count: this.players.size });
    return true;
  }

  private async ensureWorld(gameMode: Settings['gameMode']): Promise<void> {
    if (!this.worldPromise) {
      this.gameMode = gameMode;
      this.worldPromise = createPhysicsWorld(courtPresetForMode(gameMode));
    }
    const pending = this.worldPromise;
    const world = await pending;
    // The room may have emptied (and a new world been started) while
    // this one was building — only the CURRENT promise may install.
    if (this.worldPromise === pending) {
      this.world = world;
    }
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
