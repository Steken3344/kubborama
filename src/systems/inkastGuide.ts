import {
  createSystem,
  Group,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
} from '@iwsdk/core';
import { inkastGuide } from '../config.js';
import { gameEvents } from '../core/events.js';
import { inkastGuideRect } from '../core/inkastGuide.js';
import type { GuideRect } from '../core/inkastGuide.js';
import type { MatchSide, MatchState } from '../core/match.js';
import { gateLog } from '../debug/gateLog.js';
import { settingsState } from '../settingsState.js';
import { activeCourtHalves } from './activeCourt.js';

/**
 * Backyard inkast aid (core/inkastGuide.ts): a faint fill and a bright
 * outline over the half the local player must toss into, shown only
 * during their own inkast. Built once in init from unit planes that are
 * scaled to the court on each change — nothing is allocated per frame,
 * and it only reacts to match / court events.
 */
export class InkastGuideSystem extends createSystem({}) {
  private group!: Group;
  private fill!: Mesh;
  /** near, far, left, right */
  private edges: Mesh[] = [];
  private state: MatchState | null = null;
  private mySide: MatchSide | null = null;
  private shown = false;

  init(): void {
    const plane = new PlaneGeometry(1, 1);
    plane.rotateX(-Math.PI / 2); // lie flat on the grass
    const look = (opacity: number) =>
      new MeshBasicMaterial({
        color: inkastGuide.color,
        transparent: true,
        opacity,
        depthWrite: false,
      });
    this.group = new Group();
    this.group.name = 'inkast-guide';
    this.group.position.y = inkastGuide.heightM;
    this.group.visible = false;
    this.fill = new Mesh(plane, look(inkastGuide.fillOpacity));
    this.group.add(this.fill);
    const edgeLook = look(inkastGuide.lineOpacity);
    for (let i = 0; i < 4; i++) {
      const edge = new Mesh(plane, edgeLook);
      this.edges.push(edge);
      this.group.add(edge);
    }
    const entity = this.world.createTransformEntity(this.group);
    this.cleanupFuncs.push(
      gameEvents.on('MatchStateChanged', (e) => {
        this.state = e.state;
        this.mySide = e.mySide;
        this.refresh();
      }),
      gameEvents.on('GameModeChanged', () => {
        this.refresh();
      }),
      gameEvents.on('MultiplayerPeerDisconnected', () => {
        this.state = null;
        this.refresh();
      }),
      () => {
        entity.dispose();
      },
    );
  }

  private refresh(): void {
    const rect = inkastGuideRect(
      this.state,
      this.mySide,
      settingsState.current.gameMode,
      activeCourtHalves(),
      inkastGuide.gameModes,
    );
    if (rect) this.place(rect);
    this.group.visible = rect !== null;
    if ((rect !== null) !== this.shown) {
      this.shown = rect !== null;
      gateLog('inkast guide', { shown: this.shown });
    }
  }

  private place(r: GuideRect): void {
    const w = r.maxX - r.minX;
    const d = r.maxZ - r.minZ;
    const cx = (r.minX + r.maxX) / 2;
    const cz = (r.minZ + r.maxZ) / 2;
    const lw = inkastGuide.lineWidthM;
    this.fill.position.set(cx, 0, cz);
    this.fill.scale.set(w, 1, d);
    const [near, far, left, right] = this.edges;
    near?.position.set(cx, 0.001, r.maxZ);
    near?.scale.set(w + lw, 1, lw);
    far?.position.set(cx, 0.001, r.minZ);
    far?.scale.set(w + lw, 1, lw);
    left?.position.set(r.minX, 0.001, cz);
    left?.scale.set(lw, 1, d + lw);
    right?.position.set(r.maxX, 0.001, cz);
    right?.scale.set(lw, 1, d + lw);
  }
}
