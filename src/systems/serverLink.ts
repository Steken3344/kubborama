import {
  createSystem,
  Grabbed,
  PhysicsSystem,
  VisibilityState,
} from '@iwsdk/core';
import type { Entity, Object3D } from '@iwsdk/core';
import { gameEvents } from '../core/events.js';
import type { GameEvents } from '../core/events.js';
import { log } from '../core/log.js';
import { NETWORKED_PIECE_IDS } from '../core/pieceSync.js';
import { standingPose } from '../core/presence.js';
import { placePlayer } from '../playerPlacement.js';
import { serverShownColors } from '../shownColors.js';
import type { PresenceMessage } from '../core/presence.js';
import {
  parseServerMessage,
  SERVER_PATH,
  SERVER_PROTOCOL_VERSION,
  TICK_HZ,
} from '../core/serverProtocol.js';
import { multiplayer } from '../config.js';
import { slerpInto } from '../core/quat.js';
import { InterpolationClock, SnapshotBuffer } from '../core/snapshotBuffer.js';
import {
  advanceHandover,
  noteServerPose,
  startHandover,
} from '../core/throwHandover.js';
import type { Handover } from '../core/throwHandover.js';
import type {
  ClientMessage,
  ServerMessage,
  VoiceSignal,
} from '../core/serverProtocol.js';
import type { MatchSide } from '../core/match.js';
import type { Quat } from '../core/quat.js';
import type { Vec3 } from '../core/vec3.js';
import { debugContext } from '../debug/debugContext.js';
import { gateLog } from '../debug/gateLog.js';
import { isServerModeOn } from '../serverMode.js';
import { roomState } from '../roomState.js';
import { settingsState } from '../settingsState.js';
import { activeFarBaselineZ } from './activeCourt.js';
import { localPoseOf } from './objectPose.js';
import { SettingsSystem } from './settings.js';

/** Server ticks between two `server snapshot` gate lines (60 Hz → 1 Hz).
 * Keyed on the SERVER tick so every client samples the same ones. */
const GATE_SAMPLE_EVERY_TICKS = 60;
const RECONNECT_DELAY_MS = 2000;
const CLIENT_ID_KEY = 'kubborama.clientId';

/** A per-browser id so the server gives a reloading headset its side
 * back (MP6). Falls back to a per-page id when storage is blocked. */
function clientId(): string {
  try {
    const existing = localStorage.getItem(CLIENT_ID_KEY);
    if (existing && existing.length >= 8) {
      return existing;
    }
    const fresh = crypto.randomUUID();
    localStorage.setItem(CLIENT_ID_KEY, fresh);
    return fresh;
  } catch {
    return crypto.randomUUID();
  }
}

/**
 * MP5 (docs/superpowers/specs/2026-09-26-authoritative-server-design.md):
 * this headset's link to the authoritative game server, on when
 * `isServerModeOn()` (default on the dev server). Joins with the local game
 * mode, plays on the room's court (adopted like gh#15), stands at the
 * side the server assigns (B → far baseline), shows the networked
 * pieces (except one held in the local hand) from the server's
 * snapshots, interpolated ~100 ms in the past so motion is smooth at
 * the frame rate (core/snapshotBuffer.ts, 2026-10-31), and sends the
 * local player's throws — whose piece keeps its local prediction until
 * the server has it (core/throwHandover.ts). Reconnects after a drop.
 */
export class ServerLinkSystem extends createSystem({}) {
  private socket: WebSocket | null = null;
  /** Join as a player (in XR, or ?player=1) rather than watch. */
  private wantPlayer = false;
  private spectating = false;
  /** Leaving the spectator connection to rejoin as a player. */
  private switching = false;
  /** The pending reconnect — cleared by any connect(), so a reconnect
   * timer and an XR entry can never open two sockets (review). */
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private physicsSystem!: PhysicsSystem;
  private settingsSystem!: SettingsSystem;
  private pieces = new Map<string, Entity>();
  private pieceIdByIndex = new Map<number, string>();
  private side: MatchSide | null = null;
  private stopped = false;
  /** Whether the last server `match` message carried a match. */
  private inMatch = false;
  /** The other player's avatar id while their presence is arriving. */
  private peerAvatarId: string | null = null;
  private nowS = 0;
  private buffer = new SnapshotBuffer();
  private clock = new InterpolationClock();
  /** Scratch for one sampled pose (no per-frame allocation). */
  private sampled = {
    position: [0, 0, 0] as Vec3,
    quaternion: [0, 0, 0, 1] as Quat,
  };
  private currentQuat: Quat = [0, 0, 0, 1];
  /** The last pose written per piece: unchanged ones are skipped
   * between snapshots. */
  private lastApplied = new Map<string, Float64Array>();
  private freshSnapshot = false;
  /** Pieces the local player just threw (core/throwHandover.ts). */
  private handovers = new Map<string, Handover>();

  init(): void {
    if (!isServerModeOn()) {
      return;
    }
    const physicsSystem = this.world.getSystem(PhysicsSystem);
    const settingsSystem = this.world.getSystem(SettingsSystem);
    if (!physicsSystem || !settingsSystem) {
      throw new Error(
        'ServerLinkSystem requires PhysicsSystem and SettingsSystem',
      );
    }
    this.physicsSystem = physicsSystem;
    this.settingsSystem = settingsSystem;
    for (const id of NETWORKED_PIECE_IDS) {
      const entity = this.world.requireSceneEntity(id);
      this.pieces.set(id, entity);
      this.pieceIdByIndex.set(entity.index, id);
    }
    this.cleanupFuncs.push(
      gameEvents.on('Thrown', (e) => {
        this.sendStickThrow(e);
      }),
      gameEvents.on('ServerResetRequested', () => {
        this.send({ type: 'reset' });
      }),
      gameEvents.on('ServerGameModeRequested', (e) => {
        this.send({ type: 'setGameMode', gameMode: e.gameMode });
      }),
      gameEvents.on('ServerProfileRequested', (e) => {
        this.send({ type: 'setProfile', name: e.name });
      }),
      gameEvents.on('ServerColorRequested', (e) => {
        this.send({ type: 'setColor', colorIndex: e.colorIndex });
      }),
      gameEvents.on('ServerTimeLimitRequested', (e) => {
        this.send({ type: 'setTimeLimit', minutes: e.minutes });
      }),
      gameEvents.on('ServerBotRequested', (e) => {
        this.send({ type: 'setBot', level: e.level });
      }),
      () => {
        this.stopped = true;
        this.socket?.close();
      },
    );
    // A client becomes a PLAYER only once it enters XR (Erik's test,
    // 2026-09-27: the managed editor browser loaded the app, joined
    // first and took side A from his headset). A plain browser tab never
    // takes a side: it WATCHES (the TV view, 2026-10-31) until it enters
    // VR, then rejoins as a player. `?player=1` joins at once — for
    // headless tests.
    // Leaving XR keeps the connection; a SLEEPING headset stops answering
    // the server's 10 s heartbeat and is dropped — its seat then waits out
    // the 60 s rejoin grace, and on waking it reconnects and keeps its side
    // if it is back in time (review, 2026-10-31).
    const joinNow =
      new URLSearchParams(window.location.search).get('player') === '1';
    this.wantPlayer = joinNow;
    // On the Vite dev server the managed IWSDK browser window would turn
    // into a TV view (camera taken over, tools hidden) — there, watching
    // is opt-in with `?watch=1` (review, 2026-10-31). `npm start` watches.
    const watchAllowed =
      !import.meta.env.DEV ||
      new URLSearchParams(window.location.search).get('watch') === '1';
    if (joinNow || watchAllowed) {
      this.connect();
    }
    if (joinNow) {
      return;
    }
    this.cleanupFuncs.push(
      this.world.visibilityState.subscribe((state) => {
        if (state === VisibilityState.NonImmersive || this.wantPlayer) {
          return;
        }
        this.wantPlayer = true;
        if (this.socket) {
          this.switching = true;
          this.socket.close(); // reconnects at once as a player
        } else {
          this.connect();
        }
      }),
    );
  }

  private connect(): void {
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.socket) {
      return; // one socket at a time
    }
    const url = `wss://${window.location.host}${SERVER_PATH}`;
    const socket = new WebSocket(url);
    this.socket = socket;
    socket.addEventListener('open', () => {
      if (this.socket !== socket) {
        return; // a stale socket (review, 2026-10-31)
      }
      log('info', 'net', 'connected to game server', {
        url,
        as: this.wantPlayer ? 'player' : 'spectator',
      });
      if (!this.wantPlayer) {
        this.send({ type: 'watch', protocol: SERVER_PROTOCOL_VERSION });
        return;
      }
      this.send({
        type: 'join',
        protocol: SERVER_PROTOCOL_VERSION,
        gameMode: settingsState.current.gameMode,
        clientId: clientId(),
        // Seeds the profile the first time the server meets this device.
        colorIndex: settingsState.current.avatarColorIndex,
        profileName: settingsState.current.profileName,
      });
    });
    socket.addEventListener('message', (event) => {
      if (this.socket !== socket) {
        return;
      }
      let data: unknown;
      try {
        data = JSON.parse(String(event.data));
      } catch {
        return;
      }
      const message = parseServerMessage(data);
      if (!message) {
        log('warn', 'net', 'dropped malformed server message', {});
        return;
      }
      this.onMessage(message);
    });
    socket.addEventListener('close', () => {
      if (this.socket !== socket) {
        return; // an old socket closing must not tear down the live one
      }
      log('warn', 'net', 'game server connection closed', {});
      this.socket = null;
      serverShownColors.current = null;
      // The next room tells us its own settings on joining.
      roomState.timeLimitMin = 0;
      roomState.bot = null;
      roomState.clock = null;
      this.side = null;
      if (this.spectating) {
        this.spectating = false;
        gameEvents.emit('SpectatorMode', { on: false });
        gameEvents.emit('PeerLeft', { peerId: 'server-host' });
        gameEvents.emit('PeerLeft', { peerId: 'server-guest' });
      }
      this.settingsSystem.releaseMatchGameMode();
      this.leaveMatch();
      this.dropPeerAvatar();
      gameEvents.emit('ServerPeers', {
        count: 0,
        mySide: null,
        generation: -1,
      });
      if (!this.stopped) {
        const delayMs = this.switching ? 0 : RECONNECT_DELAY_MS;
        this.switching = false;
        this.reconnectTimer = setTimeout(() => {
          this.reconnectTimer = null;
          this.connect();
        }, delayMs);
      }
    });
  }

  private onMessage(message: ServerMessage): void {
    switch (message.type) {
      case 'watching':
        this.spectating = true;
        log('info', 'net', 'watching as a spectator', {
          gameMode: message.gameMode,
        });
        gateLog('spectating', { gameMode: message.gameMode });
        this.settingsSystem.adoptMatchGameMode(message.gameMode);
        this.buffer.reset();
        this.clock.reset();
        gameEvents.emit('SpectatorMode', { on: true });
        return;
      case 'players':
        // A spectator shows both avatars; an emptied seat loses its own.
        for (const side of ['host', 'guest'] as const) {
          if (message[side] === null && this.spectating) {
            gameEvents.emit('PeerLeft', { peerId: `server-${side}` });
          }
        }
        gameEvents.emit('BroadcastPlayers', {
          host: message.host,
          guest: message.guest,
        });
        return;
      case 'welcome':
        this.side = message.side;
        debugContext.role = message.side;
        log('info', 'net', 'joined game server', {
          side: message.side,
          gameMode: message.gameMode,
        });
        gateLog('server welcome', {
          side: message.side,
          gameMode: message.gameMode,
        });
        this.settingsSystem.adoptMatchGameMode(message.gameMode);
        this.standAtOwnBaseline(message.side);
        // A new session: its ticks are not comparable with the old one's.
        this.buffer.reset();
        this.clock.reset();
        this.handovers.clear();
        return;
      case 'snapshot':
        this.buffer.push(message.tick, message.pieces);
        this.freshSnapshot = true;
        if (this.handovers.size > 0) {
          for (const piece of message.pieces) {
            const handover = this.handovers.get(piece.id);
            if (handover) {
              noteServerPose(handover, message.tick, piece.position);
            }
          }
        }
        if (message.tick % GATE_SAMPLE_EVERY_TICKS === 0) {
          gateLog('server snapshot', {
            tick: message.tick,
            sticks: message.pieces
              .filter((p) => p.id.startsWith('stick-'))
              .map((p) => ({ id: p.id, position: p.position })),
          });
        }
        return;
      case 'peers':
        log('info', 'net', 'game server players', { count: message.count });
        // A spectator's two avatars follow `players` (per side) instead.
        if (message.count < 2 && !this.spectating) {
          this.dropPeerAvatar();
        }
        gameEvents.emit('ServerPeers', {
          count: message.count,
          mySide: this.side,
          generation: message.generation,
        });
        return;
      case 'signal':
        gameEvents.emit('VoiceSignal', { data: message.data });
        return;
      case 'room':
        // The court changed for the whole room: relay it out locally,
        // then stand at our own baseline of the NEW court.
        gateLog('room court changed', { gameMode: message.gameMode });
        this.settingsSystem.adoptMatchGameMode(message.gameMode);
        if (this.side) {
          this.standAtOwnBaseline(this.side);
        }
        return;
      case 'presence':
        this.peerAvatarId = `server-${message.side}`;
        gameEvents.emit('PeerPresence', {
          peerId: this.peerAvatarId,
          message: message.message,
        });
        return;
      case 'match':
        // No clock outside a running match: a decided or new match must
        // not show the last one's "Sista varvet" (review, 2026-11-01).
        if (message.state === null || message.state.winner !== null) {
          roomState.clock = null;
        } else if (roomState.clock && !message.state.timeUp) {
          roomState.clock = { ...roomState.clock, timeUp: false };
        }
        gameEvents.emit('BroadcastMatchState', { state: message.state });
        if (message.state === null) {
          this.leaveMatch();
          return;
        }
        if (this.side === null) {
          return;
        }
        this.inMatch = true;
        // The same bus event the Trystero host emits: HUD, MatchRules
        // (rack, matchActivity), InkastSystem, AdvantageLine and the gate
        // probes follow the server's match unchanged.
        gameEvents.emit('MatchStateChanged', {
          state: message.state,
          mySide: this.side,
        });
        return;
      case 'round':
        gameEvents.emit('RoundEnded', {
          // gh#16 semantics: the opponent's turn never lands in our stats.
          byOpponent: this.side !== message.side,
          result: message.result,
          sticksThrownThisRound: message.sticksThrownThisRound,
          longestThrowM: message.longestThrowM,
          longestFellingThrowM: message.longestFellingThrowM,
          roundDurationS: message.roundDurationS,
          timeS: this.nowS,
        });
        return;
      case 'profile':
        gameEvents.emit('ServerProfile', {
          name: message.name,
          colorIndex: message.colorIndex,
          stats: message.stats,
          headToHead: message.headToHead,
        });
        return;
      case 'colors':
        serverShownColors.current = {
          host: message.host,
          guest: message.guest,
        };
        gateLog('room colors', { host: message.host, guest: message.guest });
        // HUD digits and the avatar retint on this (they read
        // shownColorsFor, which now follows the server).
        gameEvents.emit('AvatarColorChanged', {
          colorIndex: settingsState.current.avatarColorIndex,
        });
        return;
      case 'roomSettings':
        roomState.timeLimitMin = message.timeLimitMin;
        roomState.bot = message.bot;
        if (message.timeLimitMin === 0) {
          roomState.clock = null;
        }
        gateLog('room settings', {
          timeLimitMin: message.timeLimitMin,
          bot: message.bot,
        });
        gameEvents.emit('RoomSettings', {
          timeLimitMin: message.timeLimitMin,
          bot: message.bot,
        });
        return;
      case 'clock':
        roomState.clock = {
          remainingS: message.remainingS,
          timeUp: message.timeUp,
        };
        gameEvents.emit('MatchClock', {
          remainingS: message.remainingS,
          timeUp: message.timeUp,
        });
        return;
      case 'notice':
        gateLog('foot fault', {
          side: message.side,
          mine: message.side === this.side,
        });
        gameEvents.emit('FootFault', {
          side: message.side,
          mine: message.side === this.side,
        });
        return;
      case 'rejected':
        log('warn', 'net', 'game server rejected us', {
          reason: message.reason,
        });
        this.stopped = true;
        return;
    }
  }

  /** Side B plays from the far baseline — the same mirror as the
   * Trystero guest's own teleport. */
  private standAtOwnBaseline(side: MatchSide): void {
    placePlayer(
      this.world,
      this.player,
      standingPose(side, activeFarBaselineZ()),
    );
  }

  update(delta: number, timeS: number): void {
    this.nowS = timeS;
    this.showPieces(delta);
  }

  /** Every frame: each piece at its interpolated server pose. */
  private showPieces(dtS: number): void {
    const latest = this.buffer.latestTick();
    if (latest === null) {
      return;
    }
    const renderTick = this.clock.advance(
      dtS,
      latest,
      TICK_HZ,
      multiplayer.snapshotInterpolationDelayTicks,
    );
    for (const [id, entity] of this.pieces) {
      if (
        entity.hasComponent(Grabbed) ||
        !this.buffer.sample(id, renderTick, this.sampled)
      ) {
        continue;
      }
      const handover = this.handovers.get(id);
      if (handover) {
        const step = advanceHandover(handover, renderTick, dtS, {
          blendS: multiplayer.ownThrowBlendS,
          timeoutS: multiplayer.ownThrowHandoverTimeoutS,
        });
        if (step.kind === 'local') {
          continue; // local physics keeps predicting the flight
        }
        if (step.kind === 'blend') {
          this.blendFromCurrent(entity, step.t);
        } else {
          this.handovers.delete(id);
        }
      }
      this.applySampled(id, entity);
    }
    this.freshSnapshot = false;
  }

  /** Moves `sampled` back toward the piece's current pose by (1 − t):
   * repeated every frame with t rising to 1, the piece glides from its
   * predicted flight onto the server's. */
  private blendFromCurrent(entity: Entity, t: number): void {
    const object3D = entity.object3D;
    if (!object3D) {
      return;
    }
    const from = object3D.position;
    const p = this.sampled.position;
    p[0] = from.x + (p[0] - from.x) * t;
    p[1] = from.y + (p[1] - from.y) * t;
    p[2] = from.z + (p[2] - from.z) * t;
    const q = object3D.quaternion;
    this.currentQuat[0] = q.x;
    this.currentQuat[1] = q.y;
    this.currentQuat[2] = q.z;
    this.currentQuat[3] = q.w;
    slerpInto(
      this.currentQuat,
      this.sampled.quaternion,
      t,
      this.sampled.quaternion,
    );
  }

  private applySampled(id: string, entity: Entity): void {
    const { position, quaternion } = this.sampled;
    let last = this.lastApplied.get(id);
    if (!last) {
      last = new Float64Array(7).fill(NaN);
      this.lastApplied.set(id, last);
    }
    // While an own throw is predicted locally, every piece is rewritten
    // every frame: the predicted stick then meets kubbs held at their
    // server pose instead of tipping them locally, only for the server
    // to stand them up again (review, 2026-10-31).
    if (
      !this.freshSnapshot &&
      this.handovers.size === 0 &&
      last[0] === position[0] &&
      last[1] === position[1] &&
      last[2] === position[2] &&
      last[3] === quaternion[0] &&
      last[4] === quaternion[1] &&
      last[5] === quaternion[2] &&
      last[6] === quaternion[3]
    ) {
      return; // at rest — nothing to write until the next snapshot
    }
    last[0] = position[0];
    last[1] = position[1];
    last[2] = position[2];
    last[3] = quaternion[0];
    last[4] = quaternion[1];
    last[5] = quaternion[2];
    last[6] = quaternion[3];
    this.physicsSystem.setBodyTransform(entity, { position, quaternion });
  }

  private dropPeerAvatar(): void {
    if (this.peerAvatarId !== null) {
      gameEvents.emit('PeerLeft', { peerId: this.peerAvatarId });
      this.peerAvatarId = null;
    }
  }

  /** A networked piece's scene object (the spectator's follow cam). */
  pieceObject(id: string): Object3D | undefined {
    return this.pieces.get(id)?.object3D ?? undefined;
  }

  /** VoiceLinkSystem's WebRTC signaling, via the server. */
  sendSignal(data: VoiceSignal): void {
    this.send({ type: 'signal', data });
  }

  /** MultiplayerSystem's 20 Hz head + hands, routed through the server. */
  sendPresence(message: PresenceMessage): void {
    if (this.spectating) {
      return; // a spectator has no avatar
    }
    this.send({ type: 'presence', message });
  }

  /** The match ended for us (the other player left, or we dropped). */
  private leaveMatch(): void {
    if (!this.inMatch) {
      return;
    }
    this.inMatch = false;
    gameEvents.emit('MultiplayerPeerDisconnected', {});
  }

  private sendStickThrow(event: GameEvents['Thrown']): void {
    const pieceId = this.pieceIdByIndex.get(Number(event.stickId));
    const object3D = pieceId ? this.pieces.get(pieceId)?.object3D : undefined;
    if (!pieceId || !object3D) {
      return;
    }
    this.sendThrow(
      pieceId,
      event.releasePosition,
      localPoseOf(object3D).quaternion,
      event.releaseVelocity,
      event.angularVelocity,
    );
  }

  /** A release — a stick (ThrowingSystem's Thrown) or an inkast kubb
   * (InkastSystem calls this directly). The server decides if it counts. */
  sendThrow(
    pieceId: string,
    position: Vec3,
    quaternion: Quat,
    linearVelocity: Vec3,
    angularVelocity: Vec3,
  ): void {
    if (this.side === null) {
      return;
    }
    this.handovers.set(
      pieceId,
      startHandover(this.buffer.latestPosition(pieceId) ?? position),
    );
    // Its next server pose must be written even if it equals the last
    // one (a refused throw returns to the rack pose it left).
    this.lastApplied.delete(pieceId);
    this.send({
      type: 'throw',
      pieceId,
      position,
      quaternion,
      linearVelocity,
      angularVelocity,
    });
  }

  private send(message: ClientMessage): void {
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(message));
    }
  }
}
