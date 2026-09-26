import { createSystem, Visibility } from '@iwsdk/core';
import type { Entity, Mesh, MeshStandardMaterial } from '@iwsdk/core';
import { gameEvents } from '../core/events.js';
import { advantageLineZ, isFinished } from '../core/match.js';
import { gateLog } from '../debug/gateLog.js';
import { activeCourtHalves } from './activeCourt.js';

/** Distinct from the white court lines, so the line reads as "you may
 * stand here" rather than as part of the court. */
const ADVANTAGE_LINE_COLOR = '#f2c14e';

/**
 * MP4 rule 8 (docs/superpowers/specs/2026-09-26-field-kubbs-design.md):
 * when field kubbs stand on the current thrower's own half, a line
 * across the court at the one closest to the centre shows where they
 * may throw from. Shown, not enforced. A clone of the centre court line
 * (created at init, so no scene JSON is involved), placed on every
 * MatchStateChanged; hidden outside a match. MultiplayerSystem moves the
 * thrower's sticks onto the same line.
 */
export class AdvantageLineSystem extends createSystem({}) {
  private source!: Mesh;
  private line!: Entity;
  private shownZ: number | null = null;

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
      }),
      gameEvents.on('MultiplayerPeerDisconnected', () => {
        this.show(null, null);
      }),
    );
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
