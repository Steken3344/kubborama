import { BOT_LEVEL_KEYS } from '../botLevelKeys.js';
import { clockText } from '../core/matchClock.js';
import { roomState } from '../roomState.js';
import { createSystem, LocomotionSystem, Vector3 } from '@iwsdk/core';
import type { Object3D } from '@iwsdk/core';
import { avatarPaletteEntry, spectator } from '../config.js';
import {
  directorEvent,
  directorTick,
  initialDirector,
  shotCameraPose,
} from '../core/director.js';
import type { DirectorEvent, DirectorState } from '../core/director.js';
import { gameEvents } from '../core/events.js';
import type { MatchSide, MatchState } from '../core/match.js';
import { scoreboardFor } from '../core/scoreboard.js';
import type { PlayersInfo } from '../core/scoreboard.js';
import type { Vec3 } from '../core/vec3.js';
import { gateLog } from '../debug/gateLog.js';
import { i18nState } from '../i18nState.js';
import { activeCourtHalves } from './activeCourt.js';
import { ServerLinkSystem } from './serverLink.js';
import { WalkAreaSystem } from './walkArea.js';

const STICK_IDS = [
  'stick-0',
  'stick-1',
  'stick-2',
  'stick-3',
  'stick-4',
  'stick-5',
];
/** The player's scoreboard sign in the garden (scene nodes). */
const PLAYER_SIGN_NODES = ['hud-panel', 'hud-frame', 'hud-sign-posts'];

const DIRECTOR_OPTS = {
  minShotS: spectator.minShotS,
  closeUpS: spectator.closeUpS,
  maxShotS: spectator.maxShotS,
};

/**
 * The spectator's TV view (docs/superpowers/specs/2026-10-31-spectator-
 * tv-design.md): a browser that watches instead of playing gets an
 * automatic director (core/director.ts) moving the camera, and an HTML
 * scoreboard on top. Active only while ServerLinkSystem says this
 * browser is spectating; it pauses locomotion and the walk area (the
 * camera roams the whole garden) and hands them back on leaving.
 *
 * Throws are seen from the pieces themselves (a stick moving fast
 * above the grass); falls from ToppleSystem's KubbFelled/KingFelled;
 * turns and wins from the server's match state.
 */
export class SpectatorSystem extends createSystem({}) {
  private active = false;
  private director: DirectorState = initialDirector();
  private nowS = 0;
  private lastState: MatchState | null = null;
  private players: PlayersInfo = { host: null, guest: null };
  private serverLink: ServerLinkSystem | null = null;
  private readonly lastStickPos = new Map<string, Vector3>();
  private followSlowS = 0;
  /** Sticks are re-racked when a turn changes: no "throws" until then. */
  private ignoreThrowsUntilS = 0;
  private readonly tmpPos = new Vector3();
  private readonly tmpTarget = new Vector3();
  private readonly smoothFocus = new Vector3();
  private readonly focus: Vec3 = [0, 0, 0];
  private freeCamera = false;
  private freeYawRad = 0.6;
  private freePitchRad = 0.45;
  private lastInputS = 0;
  private overlay: HTMLDivElement | null = null;
  private bannerUntilS = 0;
  private readonly cleanupOverlay: Array<() => void> = [];

  init(): void {
    this.serverLink = this.world.getSystem(ServerLinkSystem) ?? null;
    for (const id of STICK_IDS) {
      this.lastStickPos.set(id, new Vector3());
    }
    this.cleanupFuncs.push(
      gameEvents.on('SpectatorMode', ({ on }) => {
        if (on) {
          this.activate();
        } else {
          this.deactivate();
        }
      }),
      gameEvents.on('BroadcastMatchState', ({ state }) => {
        this.onMatchState(state);
      }),
      gameEvents.on('BroadcastPlayers', (players) => {
        this.players = players;
        this.renderScoreboard();
      }),
      gameEvents.on('MatchClock', () => {
        this.renderScoreboard();
      }),
      gameEvents.on('RoomSettings', () => {
        this.renderScoreboard();
      }),
      gameEvents.on('KubbFelled', ({ position }) => {
        this.event({ type: 'felled', position });
      }),
      gameEvents.on('KingFelled', ({ position }) => {
        this.event({ type: 'felled', position });
        this.banner(i18nState.t('bannerKingFelled'));
      }),
      gameEvents.on('FootFault', ({ side }) => {
        this.banner(
          i18nState.t('bannerFootFault', { name: this.nameOf(side) }),
        );
      }),
      gameEvents.on('LanguageChanged', () => {
        this.renderScoreboard();
      }),
      () => this.deactivate(),
    );
  }

  private activate(): void {
    if (this.active) {
      return;
    }
    this.active = true;
    this.world.getSystem(LocomotionSystem)?.stop();
    this.world.getSystem(WalkAreaSystem)?.stop();
    this.player.position.set(0, 0, 0);
    this.player.quaternion.set(0, 0, 0, 1);
    this.director = initialDirector();
    // Start from where the sticks are now, or the first frame would see
    // them all "fly" from the origin (review, 2026-10-31).
    for (const id of STICK_IDS) {
      const object3D = this.serverLink?.pieceObject(id);
      if (object3D) {
        this.lastStickPos.get(id)?.copy(object3D.position);
      }
    }
    this.ignoreThrowsUntilS = this.nowS + spectator.ignoreThrowsAfterTurnS;
    this.buildOverlay();
    this.setPlayerSignVisible(false);
    this.onMatchState(this.lastState);
    gateLog('spectator view', { on: true });
  }

  /** The in-world HUD sign shows the PLAYER's own numbers and covered a
   * third of the over-the-shoulder shot (bot match, 2026-10-31); the
   * TV scoreboard replaces it for spectators. */
  private setPlayerSignVisible(visible: boolean): void {
    for (const id of PLAYER_SIGN_NODES) {
      this.world.requireSceneObject(id).visible = visible;
    }
  }

  private deactivate(): void {
    if (!this.active) {
      return;
    }
    this.active = false;
    this.world.getSystem(LocomotionSystem)?.play();
    this.world.getSystem(WalkAreaSystem)?.play();
    for (const cleanup of this.cleanupOverlay.splice(0)) {
      cleanup();
    }
    this.overlay?.remove();
    this.overlay = null;
    this.setPlayerSignVisible(true);
    const camera = this.world.camera;
    camera.position.set(0, 1.7, 0);
    camera.quaternion.set(0, 0, 0, 1);
  }

  private event(e: DirectorEvent): void {
    if (!this.active) {
      return;
    }
    const before = this.director.shot;
    this.director = directorEvent(this.director, e, this.nowS, DIRECTOR_OPTS);
    this.logCut(before);
  }

  private logCut(before: DirectorState['shot']): void {
    if (this.director.shot !== before) {
      gateLog('camera cut', {
        shot: this.director.shot.kind,
        side: this.director.shot.side,
        variant: this.director.shot.variant,
      });
    }
  }

  private onMatchState(state: MatchState | null): void {
    const prev = this.lastState;
    this.lastState = state;
    this.renderScoreboard();
    if (!state) {
      this.event({ type: 'noMatch' });
      return;
    }
    if (state.winner !== null) {
      if (prev?.winner !== state.winner) {
        this.event({ type: 'win', side: state.winner });
        this.banner(
          i18nState.t('bannerWinner', { name: this.nameOf(state.winner) }),
        );
      }
      return;
    }
    if (
      !prev ||
      prev.currentTurn !== state.currentTurn ||
      prev.phase !== state.phase ||
      this.director.turn === null
    ) {
      this.ignoreThrowsUntilS = this.nowS + spectator.ignoreThrowsAfterTurnS;
      this.event({ type: 'turn', side: state.currentTurn, phase: state.phase });
    }
  }

  update(delta: number, timeS: number): void {
    this.nowS = timeS;
    if (!this.active) {
      return;
    }
    this.watchSticks(delta);
    const before = this.director.shot;
    this.director = directorTick(this.director, timeS, DIRECTOR_OPTS);
    this.logCut(before);
    if (
      this.freeCamera &&
      timeS - this.lastInputS > spectator.freeCameraIdleS
    ) {
      this.setFreeCamera(false);
    }
    this.placeCamera(delta);
    if (this.bannerUntilS !== 0 && timeS >= this.bannerUntilS) {
      this.bannerUntilS = 0;
      const banner = this.overlay?.querySelector<HTMLElement>(
        '[data-kubb="banner"]',
      );
      if (banner) {
        banner.style.opacity = '0';
      }
    }
  }

  /** A stick moving fast above the grass is a throw; the one being
   * followed coming to rest is a landing. */
  private watchSticks(delta: number): void {
    if (!this.serverLink || delta <= 0) {
      return;
    }
    const following =
      this.director.shot.kind === 'follow' ? this.director.shot.pieceId : null;
    for (const id of STICK_IDS) {
      const object3D = this.serverLink.pieceObject(id);
      const last = this.lastStickPos.get(id);
      if (!object3D || !last) {
        continue;
      }
      const speed = object3D.position.distanceTo(last) / delta;
      last.copy(object3D.position);
      if (id === following) {
        this.followSlowS =
          speed < spectator.landedSpeedMps ? this.followSlowS + delta : 0;
        if (this.followSlowS >= spectator.landedHoldS) {
          this.followSlowS = 0;
          this.event({ type: 'landed' });
        }
        continue;
      }
      if (
        speed > spectator.throwSpeedMps &&
        speed < spectator.maxThrowSpeedMps && // a teleport is not a throw
        this.nowS >= this.ignoreThrowsUntilS &&
        object3D.position.y > spectator.throwMinHeightM &&
        this.lastState !== null
      ) {
        this.followSlowS = 0;
        this.smoothFocus.copy(object3D.position);
        this.event({ type: 'throw', pieceId: id });
      }
    }
  }

  private placeCamera(delta: number): void {
    const camera = this.world.camera;
    if (this.freeCamera) {
      const halves = activeCourtHalves();
      const r = spectator.freeCameraRadiusM;
      this.tmpTarget.set(0, 0.3, halves.centreZ);
      this.tmpPos.set(
        Math.sin(this.freeYawRad) * Math.cos(this.freePitchRad) * r,
        Math.max(0.5, Math.sin(this.freePitchRad) * r),
        halves.centreZ +
          Math.cos(this.freeYawRad) * Math.cos(this.freePitchRad) * r,
      );
    } else {
      const shot = this.director.shot;
      let current = shot;
      if (shot.kind === 'follow' && shot.pieceId) {
        const object3D = this.serverLink?.pieceObject(shot.pieceId);
        if (object3D) {
          // Ease the framing point so a bouncing stick doesn't shake.
          const k = 1 - Math.exp(-delta / spectator.followSmoothingS);
          this.smoothFocus.lerp(object3D.position, k);
          this.focus[0] = this.smoothFocus.x;
          this.focus[1] = this.smoothFocus.y;
          this.focus[2] = this.smoothFocus.z;
          current = { ...shot, focus: this.focus };
        }
      }
      const pose = shotCameraPose(
        current,
        activeCourtHalves(),
        this.nowS,
        DIRECTOR_OPTS,
      );
      this.tmpPos.set(...pose.position);
      this.tmpTarget.set(...pose.target);
    }
    const parent: Object3D | null = camera.parent;
    if (parent) {
      parent.updateMatrixWorld();
      parent.worldToLocal(this.tmpPos);
    }
    camera.position.copy(this.tmpPos);
    camera.lookAt(this.tmpTarget);
  }

  private setFreeCamera(on: boolean): void {
    this.freeCamera = on;
    this.lastInputS = this.nowS;
    const button = this.overlay?.querySelector<HTMLElement>(
      '[data-kubb="freecam"]',
    );
    if (button) {
      button.textContent = i18nState.t(
        on ? 'spectatorDirector' : 'spectatorFreeCam',
      );
    }
  }

  private nameOf(side: MatchSide): string {
    const bot = this.players[side]?.bot;
    if (bot) {
      return i18nState.t('botName', {
        level: i18nState.t(BOT_LEVEL_KEYS[bot]),
      });
    }
    return (
      this.players[side]?.name ??
      i18nState.t(side === 'host' ? 'rolePlayerA' : 'rolePlayerB')
    );
  }

  private banner(text: string): void {
    const banner = this.overlay?.querySelector<HTMLElement>(
      '[data-kubb="banner"]',
    );
    if (!banner) {
      return;
    }
    banner.textContent = text;
    banner.style.opacity = '1';
    this.bannerUntilS = this.nowS + spectator.bannerS;
  }

  // --- the HTML overlay ----------------------------------------------------

  private buildOverlay(): void {
    const root = document.createElement('div');
    root.setAttribute('data-kubb', 'spectator');
    // A TV picture: no developer panels (the Tweakpane tuning lab).
    const hideDevPanels = document.createElement('style');
    hideDevPanels.textContent = '.tp-dfwv{display:none !important}';
    document.head.appendChild(hideDevPanels);
    this.cleanupOverlay.push(() => hideDevPanels.remove());
    root.style.cssText =
      'position:fixed;inset:0;pointer-events:none;z-index:10;font-family:system-ui,sans-serif;color:#fff;';
    root.innerHTML = `
      <div data-kubb="title" style="position:absolute;top:6vh;left:0;right:0;text-align:center;font-size:clamp(28px,5vw,64px);font-weight:800;letter-spacing:.04em;text-shadow:0 3px 12px rgba(0,0,0,.6)">
        KubbOrama<div data-kubb="waiting" style="font-size:.4em;font-weight:500;opacity:.9"></div>
      </div>
      <div data-kubb="banner" style="position:absolute;top:18vh;left:0;right:0;text-align:center;font-size:clamp(24px,4vw,52px);font-weight:800;opacity:0;transition:opacity .4s;text-shadow:0 3px 12px rgba(0,0,0,.7)"></div>
      <div data-kubb="board" style="position:absolute;left:3vw;bottom:5vh;min-width:min(420px,80vw);background:rgba(10,18,14,.78);border-radius:10px;padding:10px 14px;font-size:clamp(16px,2.2vw,28px);box-shadow:0 4px 20px rgba(0,0,0,.4)"></div>
      <button data-kubb="freecam" style="position:absolute;right:3vw;bottom:5vh;pointer-events:auto;font-size:clamp(14px,1.6vw,20px);padding:8px 14px;border:0;border-radius:8px;background:rgba(10,18,14,.78);color:#fff;cursor:pointer"></button>`;
    document.body.appendChild(root);
    this.overlay = root;
    this.setFreeCamera(false);
    const button = root.querySelector<HTMLButtonElement>(
      '[data-kubb="freecam"]',
    );
    const onButton = () => this.setFreeCamera(!this.freeCamera);
    button?.addEventListener('click', onButton);
    let dragging = false;
    const onDown = (e: PointerEvent) => {
      // A click on the button is a click, not the start of a drag.
      dragging = e.target !== button;
    };
    const onUp = () => {
      dragging = false;
    };
    const onMove = (e: PointerEvent) => {
      if (!dragging) {
        return;
      }
      if (!this.freeCamera) {
        this.setFreeCamera(true);
      }
      this.lastInputS = this.nowS;
      this.freeYawRad -= e.movementX * 0.005;
      this.freePitchRad = Math.min(
        1.3,
        Math.max(0.08, this.freePitchRad + e.movementY * 0.004),
      );
    };
    window.addEventListener('pointerdown', onDown);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointermove', onMove);
    this.cleanupOverlay.push(
      () => button?.removeEventListener('click', onButton),
      () => window.removeEventListener('pointerdown', onDown),
      () => window.removeEventListener('pointerup', onUp),
      () => window.removeEventListener('pointermove', onMove),
    );
    this.renderScoreboard();
  }

  private renderScoreboard(): void {
    const root = this.overlay;
    if (!root) {
      return;
    }
    const t = i18nState.t;
    const board = scoreboardFor(this.lastState, this.players);
    const title = root.querySelector<HTMLElement>('[data-kubb="title"]');
    const waiting = root.querySelector<HTMLElement>('[data-kubb="waiting"]');
    if (title) {
      title.style.display = this.lastState ? 'none' : 'block';
    }
    if (waiting) {
      waiting.textContent = t('spectatorWaiting');
    }
    const row = (side: MatchSide) => {
      const s = board[side];
      const color =
        s.colorIndex === null
          ? '#cccccc'
          : avatarPaletteEntry(s.colorIndex).hex;
      const active = board.turn === side;
      const state = active
        ? ` · ${t(board.phase === 'inkast' ? 'scoreInkast' : 'scoreThrowing')}`
        : '';
      return `<div style="display:flex;align-items:center;gap:10px;padding:4px 0;${active ? 'font-weight:800' : 'opacity:.85'}">
        <span style="width:14px;height:14px;border-radius:50%;background:${color};flex:none"></span>
        <span style="flex:1">${escapeHtml(this.nameOf(side))}${state}</span>
        <span>${s.toFell > 0 ? t('scoreToFell', { value: s.toFell }) : t('scoreKingNext')}</span>
      </div>`;
    };
    const boardEl = root.querySelector<HTMLElement>('[data-kubb="board"]');
    if (boardEl) {
      const clock =
        this.lastState && roomState.timeLimitMin > 0 ? roomState.clock : null;
      const clockLine = clock
        ? `<div style="padding-top:4px;font-size:.8em;opacity:.85">${
            clock.timeUp
              ? t('spectatorTimeUp')
              : t('spectatorClock', { time: clockText(clock.remainingS) })
          }</div>`
        : '';
      boardEl.innerHTML = row('host') + row('guest') + clockLine;
    }
  }
}

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/gu, (c) => `&#${c.charCodeAt(0)};`);
}
