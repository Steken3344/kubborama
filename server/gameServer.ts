import { courtPresetForMode } from '../src/config.js';
import type { MatchSide } from '../src/core/match.js';
import { NETWORKED_PIECE_IDS } from '../src/core/pieceSync.js';
import {
  parseClientMessage,
  SERVER_PROTOCOL_VERSION,
} from '../src/core/serverProtocol.js';
import type {
  ClientMessage,
  ServerMessage,
} from '../src/core/serverProtocol.js';
import type { Settings } from '../src/core/settings.js';
import { MatchHost } from './matchHost.js';
import { createPhysicsWorld } from './physicsWorld.js';
import type { PhysicsWorld } from './physicsWorld.js';
import { appendServerLog } from './serverLog.js';
import type { ServerLog } from './serverLog.js';

/** Fixed simulation rate and the snapshot rate derived from it. */
export const TICK_HZ = 60;
export const SNAPSHOT_EVERY_TICKS = 3; // → 20 Hz, like the Trystero pieceSync
/** At most this many throws per client per second — six sticks is a
 * whole turn; anything faster is a flood (review, 2026-09-26). */
const MAX_THROWS_PER_SECOND = 6;
/** A dropped player keeps its side this long: a reloading headset
 * rejoins with the same clientId and the match simply continues
 * (docs/QUESTIONS.md, option 1 — decided 2026-09-27). */
export const REJOIN_GRACE_MS = 60_000;

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

interface Seat {
  side: MatchSide;
  clientId: string;
  connection: ClientConnection | null;
  /** Set while the player is away; the seat is freed after the grace. */
  leftAtMs: number | null;
  recentThrowsMs: number[];
}

const SIDES: readonly MatchSide[] = ['host', 'guest'];

export interface GameServerOptions {
  nowMs?: () => number;
  log?: ServerLog;
}

/**
 * MP5/MP6 (docs/superpowers/specs/2026-09-26-authoritative-server-design.md):
 * one room, two seats (side A = 'host', side B = 'guest' — the side, not
 * the authority; this server is always the authority). The first
 * player's game mode picks the court; the physics world and its
 * MatchHost (the rules) are built on the first join and dropped when
 * the room is empty. A seat survives a disconnect for REJOIN_GRACE_MS.
 * `tick()` advances exactly one fixed 1/TICK_HZ step; `start()` drives
 * it from wall-clock time.
 */
export class GameServer {
  private readonly nowMs: () => number;
  private readonly log: ServerLog;
  private seats: Seat[] = [];
  private world: PhysicsWorld | null = null;
  private host: MatchHost | null = null;
  private worldPromise: Promise<PhysicsWorld> | null = null;
  private lastMatch: ServerMessage | null = null;
  private tickCount = 0;
  private gameMode: Settings['gameMode'] = 'simple';
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(options: GameServerOptions = {}) {
    this.nowMs = options.nowMs ?? (() => performance.now());
    this.log = options.log ?? appendServerLog;
  }

  connect(connection: ClientConnection): ClientHandle {
    return {
      receive: (data) => this.onMessage(connection, data),
      close: () => this.onClose(connection),
    };
  }

  /** One fixed physics step, the rules, a snapshot every few ticks. */
  tick(): void {
    this.expireSeats();
    if (!this.world || !this.host) {
      return;
    }
    this.world.step(1 / TICK_HZ);
    this.host.tick(1 / TICK_HZ);
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
    const seat = this.seats.find((s) => s.connection === connection);
    if (!seat || !this.host) {
      return false; // only seated players act
    }
    if (message.type === 'reset') {
      this.log('info', 'gate', 'reset pressed', { side: seat.side });
      this.host.reset();
      return true;
    }
    if (!this.allowThrow(seat)) {
      return false;
    }
    return this.host.onThrow(seat.side, message);
  }

  private allowThrow(seat: Seat): boolean {
    const now = this.nowMs();
    seat.recentThrowsMs = seat.recentThrowsMs.filter((t) => now - t < 1000);
    if (seat.recentThrowsMs.length >= MAX_THROWS_PER_SECOND) {
      return false;
    }
    seat.recentThrowsMs.push(now);
    return true;
  }

  private async onJoin(
    connection: ClientConnection,
    message: Extract<ClientMessage, { type: 'join' }>,
  ): Promise<boolean> {
    if (this.seats.some((s) => s.connection === connection)) {
      return false;
    }
    this.expireSeats();
    let seat = this.seats.find((s) => s.clientId === message.clientId);
    if (seat) {
      seat.connection?.close(); // a second tab of the same browser wins
      seat.connection = connection;
      seat.leftAtMs = null;
    } else {
      const taken = new Set(this.seats.map((s) => s.side));
      const side = SIDES.find((s) => !taken.has(s));
      if (!side) {
        connection.send({ type: 'rejected', reason: 'full' });
        connection.close();
        return false;
      }
      seat = {
        side,
        clientId: message.clientId,
        connection,
        leftAtMs: null,
        recentThrowsMs: [],
      };
      this.seats.push(seat);
    }
    await this.ensureWorld(message.gameMode);
    connection.send({
      type: 'welcome',
      protocol: SERVER_PROTOCOL_VERSION,
      side: seat.side,
      gameMode: this.gameMode,
    });
    this.host?.setPlayers(this.seats.map((s) => s.side));
    if (this.lastMatch) {
      connection.send(this.lastMatch);
    }
    this.broadcastPeers();
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
    if (this.world === world) {
      return;
    }
    if (this.worldPromise !== pending) {
      world.dispose(); // built for a room that emptied meanwhile
      return;
    }
    this.world = world;
    this.host = new MatchHost(world, this.gameMode, {
      matchState: (state) => {
        this.lastMatch = { type: 'match', state };
        this.broadcast(this.lastMatch);
      },
      roundEnded: (report) => {
        this.broadcast({ type: 'round', ...report });
      },
      gate: (gateMessage, data) => {
        this.log('info', 'gate', gateMessage, data);
      },
    });
  }

  private onClose(connection: ClientConnection): void {
    const seat = this.seats.find((s) => s.connection === connection);
    if (!seat) {
      return;
    }
    seat.connection = null;
    seat.leftAtMs = this.nowMs();
    this.broadcastPeers();
  }

  /** Free the seats of players gone longer than the grace; drop the
   * world once nobody is left. */
  private expireSeats(): void {
    const now = this.nowMs();
    const before = this.seats.length;
    this.seats = this.seats.filter(
      (s) => s.leftAtMs === null || now - s.leftAtMs < REJOIN_GRACE_MS,
    );
    if (this.seats.length === before) {
      return;
    }
    if (this.seats.length === 0) {
      this.world?.dispose();
      this.world = null;
      this.host = null;
      this.worldPromise = null;
      this.lastMatch = null;
      this.tickCount = 0;
      return;
    }
    this.host?.setPlayers(this.seats.map((s) => s.side));
    this.broadcastPeers();
  }

  private broadcastPeers(): void {
    this.broadcast({
      type: 'peers',
      count: this.seats.filter((s) => s.connection !== null).length,
    });
  }

  private broadcast(message: ServerMessage): void {
    for (const seat of this.seats) {
      seat.connection?.send(message);
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
