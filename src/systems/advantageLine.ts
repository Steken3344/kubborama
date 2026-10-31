import { createSystem, Visibility } from '@iwsdk/core';
import type { Entity, Mesh, MeshStandardMaterial } from '@iwsdk/core';
import { gameEvents } from '../core/events.js';
import { advantageLineZ, isFinished, standingLineZ } from '../core/match.js';
import type { MatchSide, MatchState } from '../core/match.js';
import { standingPose } from '../core/presence.js';
import { gateLog } from '../debug/gateLog.js';
import { activeCourtHalves, activeFarBaselineZ } from './activeCourt.js';

/** Distinct from the white court lines, so the line reads as "you may
 * stand here" rather than as part of the court. */
const ADVANTAGE_LINE_COLOR = '#f2c14e';
/** Rig z within this of a line counts as standing on it. */
const ON_LINE_EPSILON_M = 0.001;

/**
 * MP4 rule 8 (docs/superpowers/specs/2026-09-26-field-kubbs-design.md):
 * when field kubbs stand on the current thrower's own half, a line
 * across the court at the one closest to the centre shows where they
 * may throw from. Shown, not enforced. A clone of the centre court line
 * (created at init, so no scene JSON is involved), placed on every
 * MatchStateChanged; hidden outside a match. MultiplayerSystem moves the
 * thrower's sticks onto the same line.
 *
 * Erik, 2026-10-31: the thrower is also TELEPORTED onto its advantage
 * line when its throwing phase starts (a small room may not allow
 * walking up to it), and back to its baseline when the turn ends
 * (core/match.ts standingLineZ). Baseline placement itself stays with
 * ServerLinkSystem / MultiplayerSystem — this only moves the rig onto
 * a line and back, so a side not yet resolved can never be misplaced.
 */
export class AdvantageLineSystem extends createSystem({}) {
  private source!: Mesh;
  private line!: Entity;
  private shownZ: number | null = null;
  /** The advantage line the rig was teleported onto, if any. */
  private onLineZ: number | null = null;
  private mySide: MatchSide | null = null;

  init(): void {
    this.source = this.world.requireSceneEntity('court-line-center')
      .object3D as Mesh;
    const mesh = this.source.clone();
    const material = (this.source.material as MeshStandardMaterial).clone();
    material.color.set(ADVANTAGE_LINE_COLOR);
    mesh.material = material;
    this.line = this.world.createTransformEntity(mesh);
    this.line.addComponent(Visibility, { isVisible: false });
    this.cleanupFuncs.push(
      gameEvents.on('MatchStateChanged', (e) => {
        const z = isFinished(e.state)
          ? null
          : advantageLineZ(e.state, e.state.currentTurn, activeCourtHalves());
        this.show(z, e.state.currentTurn);
        this.stand(e.state, e.mySide);
      }),
      gameEvents.on('MultiplayerPeerDisconnected', () => {
        this.show(null, null);
        this.leaveLine();
        this.mySide = null;
      }),
    );
  }

  /** Onto my advantage line while I throw at field kubbs on my half;
   * back to my baseline otherwise. */
  private stand(state: MatchState, side: MatchSide): void {
    this.mySide = side;
    const halves = activeCourtHalves();
    const baselineZ =
      side === 'host' ? halves.nearBaselineZ : halves.farBaselineZ;
    const targetZ = standingLineZ(state, side, halves);
    if (targetZ === baselineZ) {
      this.leaveLine();
      return;
    }
    // Also re-placed when something else (a rejoin's baseline
    // placement) moved the rig off the line meanwhile.
    if (Math.abs(this.player.position.z - targetZ) > ON_LINE_EPSILON_M) {
      this.teleport(side, targetZ);
    }
    this.onLineZ = targetZ;
  }

  /** Back to my baseline — unless the rig was already moved elsewhere
   * (a court switch or the room emptying places it at a baseline). */
  private leaveLine(): void {
    const lineZ = this.onLineZ;
    this.onLineZ = null;
    if (
      lineZ === null ||
      this.mySide === null ||
      Math.abs(this.player.position.z - lineZ) > ON_LINE_EPSILON_M
    ) {
      return;
    }
    this.teleport(this.mySide, null);
  }

  private teleport(side: MatchSide, lineZ: number | null): void {
    const pose =
      lineZ === null
        ? standingPose(side, activeFarBaselineZ())
        : standingPose(side, activeFarBaselineZ(), lineZ);
    this.player.position.set(...pose.position);
    this.player.quaternion.set(...pose.quaternion);
    gateLog('stand line', {
      side,
      z: pose.position[2],
      onAdvantageLine: lineZ !== null,
    });
  }

  private show(z: number | null, side: string | null): void {
    if (z === this.shownZ) {
      return;
    }
    this.shownZ = z;
    this.line.setValue(Visibility, 'isVisible', z !== null);
    const object3D = this.line.object3D;
    if (z !== null && object3D) {
      // The centre line is resized per preset (CourtLayoutSystem) — copy
      // its current width, then slide the clone to the line's z.
      object3D.position.copy(this.source.position);
      object3D.scale.copy(this.source.scale);
      object3D.quaternion.copy(this.source.quaternion);
      object3D.position.z = z;
    }
    gateLog('advantage line', { side, z });
  }
}
