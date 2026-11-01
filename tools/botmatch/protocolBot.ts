import WebSocket from 'ws';
import { courtPresetForMode, getCourtPreset } from '../../src/config.js';
import { courtHalves } from '../../src/core/inkast.js';
import type { CourtHalves } from '../../src/core/inkast.js';
import type { MatchSide, MatchState } from '../../src/core/match.js';
import { botPresence } from '../../src/core/botPolicy.js';
import {
  parseServerMessage,
  SERVER_PATH,
  SERVER_PROTOCOL_VERSION,
} from '../../src/core/serverProtocol.js';
import type { ClientMessage } from '../../src/core/serverProtocol.js';
import type { Settings } from '../../src/core/settings.js';
import type { Vec3 } from '../../src/core/vec3.js';

export type GameMode = Settings['gameMode'];

/**
 * Player B of the bot match: a headless client speaking the game
 * server protocol (SERVER_PROTOCOL_VERSION)
 * with the shared zod schemas. It throws only what the orchestrator
 * (main.ts) tells it to, and records what the server says — the bot
 * match reads the whole game through this socket.
 */
/** Default avatar colour; a series can pick another (even A's, a clash). */
const COLOR_INDEX = 4;
const PRESENCE_EVERY_MS = 50;

export function joinMessage(
  clientId: string,
  colorIndex = COLOR_INDEX,
): ClientMessage {
  return {
    type: 'join',
    protocol: SERVER_PROTOCOL_VERSION,
    gameMode: 'simple',
    clientId,
    colorIndex,
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

export function presenceFor(
  side: MatchSide,
  farZ: number,
  colorIndex = COLOR_INDEX,
): ClientMessage {
  return { type: 'presence', message: botPresence(side, farZ, colorIndex) };
}

export function halvesFor(gameMode: GameMode): CourtHalves {
  return courtHalves(getCourtPreset(courtPresetForMode(gameMode)));
}

export class ProtocolBot {
  side: MatchSide | null = null;
  gameMode: GameMode = 'simple';
  match: MatchState | null = null;
  readonly positions = new Map<string, Vec3>();
  readonly notices: Array<{ kind: 'footFault'; side: MatchSide }> = [];
  readonly rooms: GameMode[] = [];
  rounds = 0;
  /** `match` messages received — a fresh one is newer than a count. */
  matchMessages = 0;
  /** Every turn/phase the match went through (`host/inkast`, …). */
  readonly phases: string[] = [];
  rejected: string | null = null;
  private presenceTimer: NodeJS.Timeout | null = null;

  private constructor(
    private readonly socket: WebSocket,
    private readonly colorIndex: number,
  ) {}

  static connect(
    baseUrl: string,
    clientId: string,
    colorIndex = COLOR_INDEX,
  ): Promise<ProtocolBot> {
    const url = new URL(SERVER_PATH, baseUrl);
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    // The server's certificate is self-signed (LAN / dev).
    const socket = new WebSocket(url, { rejectUnauthorized: false });
    const bot = new ProtocolBot(socket, colorIndex);
    return new Promise((resolve, reject) => {
      socket.once('error', reject);
      socket.on('message', (data: WebSocket.RawData) => {
        bot.onMessage(data.toString());
      });
      socket.once('open', () => {
        bot.send(joinMessage(clientId, colorIndex));
        bot.presenceTimer = setInterval(() => {
          bot.sendPresence();
        }, PRESENCE_EVERY_MS);
        resolve(bot);
      });
    });
  }

  get halves(): CourtHalves {
    return halvesFor(this.gameMode);
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
    if (this.side !== null) {
      this.send(
        presenceFor(this.side, this.halves.farBaselineZ, this.colorIndex),
      );
    }
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
        this.gameMode = message.gameMode;
        return;
      case 'snapshot':
        for (const p of message.pieces) this.positions.set(p.id, p.position);
        return;
      case 'match':
        this.match = message.state;
        this.matchMessages += 1;
        if (message.state) {
          const key = `${message.state.currentTurn}/${message.state.phase}`;
          if (this.phases[this.phases.length - 1] !== key) {
            this.phases.push(key);
          }
        }
        return;
      case 'notice':
        this.notices.push({ kind: message.kind, side: message.side });
        return;
      case 'room':
        this.gameMode = message.gameMode;
        this.rooms.push(message.gameMode);
        return;
      case 'round':
        this.rounds += 1;
        return;
      case 'rejected':
        this.rejected = message.reason;
        return;
      default:
        return;
    }
  }
}
