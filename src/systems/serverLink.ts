import { createSystem, PhysicsSystem, VisibilityState } from '@iwsdk/core';
import type { Entity } from '@iwsdk/core';
import { gameEvents } from '../core/events.js';
import type { GameEvents } from '../core/events.js';
import { log } from '../core/log.js';
import { NETWORKED_PIECE_IDS } from '../core/pieceSync.js';
import { defaultPose, mirrorPoseToFarBaseline } from '../core/presence.js';
import {
  parseServerMessage,
  SERVER_PATH,
  SERVER_PROTOCOL_VERSION,
} from '../core/serverProtocol.js';
import type { ClientMessage, ServerMessage } from '../core/serverProtocol.js';
import type { MatchSide } from '../core/match.js';
import { debugContext } from '../debug/debugContext.js';
import { gateLog } from '../debug/gateLog.js';
import { isServerModeOn } from '../serverMode.js';
import { settingsState } from '../settingsState.js';
import { activeFarBaselineZ } from './activeCourt.js';
import { localPoseOf } from './objectPose.js';
import { applyPieceTransforms } from './pieceApply.js';
import { SettingsSystem } from './settings.js';

/** Server ticks between two `server snapshot` gate lines (60 Hz → 1 Hz).
 * Keyed on the SERVER tick so every client samples the same ones. */
const GATE_SAMPLE_EVERY_TICKS = 60;
const RECONNECT_DELAY_MS = 2000;

/**
 * MP5 (docs/superpowers/specs/2026-09-26-authoritative-server-design.md):
 * this headset's link to the authoritative game server, on when
 * `isServerModeOn()` (default on the dev server). Joins with the local game
 * mode, plays on the room's court (adopted like gh#15), stands at the
 * side the server assigns (B → far baseline), applies every snapshot to
 * the networked pieces (except one held in the local hand) and sends
 * the local player's throws. The server simulates; local physics only
 * predicts until the next snapshot. Reconnects after a drop. Voice and
 * avatars stay on Trystero (MultiplayerSystem).
 */
export class ServerLinkSystem extends createSystem({}) {
  private socket: WebSocket | null = null;
  private physicsSystem!: PhysicsSystem;
  private settingsSystem!: SettingsSystem;
  private pieces = new Map<string, Entity>();
  private pieceIdByIndex = new Map<number, string>();
  private side: MatchSide | null = null;
  private stopped = false;

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
        this.sendThrow(e);
      }),
      () => {
        this.stopped = true;
        this.socket?.close();
      },
    );
    // A client becomes a PLAYER only once it enters XR (Erik's test,
    // 2026-09-27: the managed editor browser loaded the app, joined
    // first and took side A from his headset). A plain browser tab never
    // takes a side. `?player=1` joins at once — for headless tests.
    // Leaving XR (headset asleep) keeps the connection, so the side is
    // kept too.
    const joinNow =
      new URLSearchParams(window.location.search).get('player') === '1';
    if (joinNow) {
      this.connect();
      return;
    }
    this.cleanupFuncs.push(
      this.world.visibilityState.subscribe((state) => {
        if (state !== VisibilityState.NonImmersive && !this.socket) {
          this.connect();
        }
      }),
    );
  }

  private connect(): void {
    const url = `wss://${window.location.host}${SERVER_PATH}`;
    const socket = new WebSocket(url);
    this.socket = socket;
    socket.addEventListener('open', () => {
      log('info', 'net', 'connected to game server', { url });
      this.send({
        type: 'join',
        protocol: SERVER_PROTOCOL_VERSION,
        gameMode: settingsState.current.gameMode,
      });
    });
    socket.addEventListener('message', (event) => {
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
      log('warn', 'net', 'game server connection closed', {});
      this.socket = null;
      this.side = null;
      this.settingsSystem.releaseMatchGameMode();
      if (!this.stopped) {
        setTimeout(() => this.connect(), RECONNECT_DELAY_MS);
      }
    });
  }

  private onMessage(message: ServerMessage): void {
    switch (message.type) {
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
        return;
      case 'snapshot':
        applyPieceTransforms(this.physicsSystem, this.pieces, message.pieces);
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
    const pose =
      side === 'guest'
        ? mirrorPoseToFarBaseline(defaultPose(), activeFarBaselineZ())
        : defaultPose();
    this.player.position.set(...pose.position);
    this.player.quaternion.set(...pose.quaternion);
  }

  private sendThrow(event: GameEvents['Thrown']): void {
    const pieceId = this.pieceIdByIndex.get(Number(event.stickId));
    const object3D = pieceId ? this.pieces.get(pieceId)?.object3D : undefined;
    if (!pieceId || !object3D || this.side === null) {
      return;
    }
    this.send({
      type: 'throw',
      pieceId,
      position: event.releasePosition,
      quaternion: localPoseOf(object3D).quaternion,
      linearVelocity: event.releaseVelocity,
      angularVelocity: event.angularVelocity,
    });
  }

  private send(message: ClientMessage): void {
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(message));
    }
  }
}
