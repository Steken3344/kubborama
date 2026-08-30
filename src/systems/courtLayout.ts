import { BoxGeometry, createSystem, PhysicsSystem } from '@iwsdk/core';
import type { Mesh } from '@iwsdk/core';
import type { CourtPreset } from '../core/court-layout.js';
import {
  courtLayout,
  courtPresetForMode,
  getCourtPreset,
  pieces,
} from '../config.js';
import { gameEvents } from '../core/events.js';
import type { Settings } from '../core/settings.js';
import type { Vec3 } from '../core/vec3.js';
import type { HomePose } from './menu.js';
import { MenuSystem } from './menu.js';

const STAKE_NODE_IDS = [
  'corner-stake-near-left',
  'corner-stake-near-right',
  'corner-stake-far-left',
  'corner-stake-far-right',
] as const;

const COURT_LINE_IDS = [
  'court-line-left',
  'court-line-right',
  'court-line-near',
  'court-line-far',
  'court-line-center',
] as const;

const IDENTITY_QUATERNION: [number, number, number, number] = [0, 0, 0, 1];

/**
 * Repositions the court to the active game mode's preset (M4's known
 * gap: court size never changed with mode — docs/DECISIONS.md).
 * Subscribes to GameModeChanged (emitted by SettingsSystem.setGameMode)
 * and:
 *  1. recomputes king/kubb/stake positions with the SAME pure
 *     computeCourtLayout() the scene was originally authored from, and
 *     hands king/kubb positions to MenuSystem.applyCourtLayout() —
 *     reusing its existing release/rack/teleport + Reset-event path
 *     instead of duplicating it (switching mode mid-round IS a reset,
 *     just onto a different layout). Sticks are NOT repositioned here
 *     — they live on a fixed physical rack beside the player (Erik's
 *     feedback, 2026-08-30, see core/court-layout.ts's
 *     computeStickRackPositions) that has nothing to do with the
 *     active court preset;
 *  2. moves the 4 corner stakes directly via PhysicsSystem — they're
 *     STATIC bodies with no Resettable tag (real stakes are never
 *     knocked over/reset mid-round), so they sit outside MenuSystem's
 *     Resettable pipeline entirely and need their own transform write;
 *  3. resizes and repositions the 5 court-line meshes directly (they
 *     aren't Resettable/physics pieces either, just static decoration)
 *     by swapping in a new BoxGeometry sized for the new preset — the
 *     FIRST swap never disposes the old geometry (it's the shared
 *     prototype from a placed clone, see
 *     .claude/rules/assets-and-manifest.md — near/far/center all
 *     start out pointing at the SAME object), but every swap after
 *     that replaces a geometry that is by then private to just this
 *     one mesh, so it IS disposed (resizedLineIds tracks which).
 *
 * All 20 scene-entity/object lookups (`requireSceneEntity`, which
 * throws synchronously on a missing node id) happen FIRST, before any
 * live mutation — a missing/renamed id (plausible after a hand-edit
 * to main.iwsdk.scene.json, an established workflow here) fails
 * clean instead of leaving the court half-migrated between the old
 * and new preset (M5 adversarial review gate, docs/DECISIONS.md).
 */
export class CourtLayoutSystem extends createSystem({}) {
  private menuSystem!: MenuSystem;
  private physicsSystem!: PhysicsSystem;
  private unsubscribeGameModeChanged?: () => void;
  private resizedLineIds = new Set<string>();

  init(): void {
    const menuSystem = this.world.getSystem(MenuSystem);
    if (!menuSystem) {
      throw new Error(
        'CourtLayoutSystem requires MenuSystem to be registered first',
      );
    }
    this.menuSystem = menuSystem;
    const physicsSystem = this.world.getSystem(PhysicsSystem);
    if (!physicsSystem) {
      throw new Error(
        'CourtLayoutSystem requires PhysicsSystem — enable the "physics" world feature in iwsdk.config.json',
      );
    }
    this.physicsSystem = physicsSystem;
    this.unsubscribeGameModeChanged = gameEvents.on('GameModeChanged', (e) => {
      this.applyGameMode(e.gameMode);
    });
  }

  destroy(): void {
    this.unsubscribeGameModeChanged?.();
  }

  private applyGameMode(gameMode: Settings['gameMode']): void {
    const presetName = courtPresetForMode(gameMode);
    const preset = getCourtPreset(presetName);
    const layout = courtLayout(presetName);

    // Resolve phase — every lookup that can throw, none of it mutates
    // anything yet.
    const kingEntity = this.world.requireSceneEntity('king');
    const kubbEntities = layout.kubbPositions.map((_, i) =>
      this.world.requireSceneEntity(`kubb-${i}`),
    );
    const stakeEntities = STAKE_NODE_IDS.map((nodeId) =>
      this.world.requireSceneEntity(nodeId),
    );
    const lineMeshes = COURT_LINE_IDS.map(
      (nodeId) => this.world.requireSceneEntity(nodeId).object3D as Mesh,
    );

    // Mutation phase — everything below only writes to already-
    // resolved objects, so nothing here can throw partway through.
    const homePoses = new Map<number, HomePose>();
    homePoses.set(kingEntity.index, {
      position: layout.kingPosition,
      quaternion: IDENTITY_QUATERNION,
    });

    layout.kubbPositions.forEach((position, i) => {
      const entity = kubbEntities[i];
      if (!entity) {
        return;
      }
      homePoses.set(entity.index, {
        position,
        quaternion: IDENTITY_QUATERNION,
      });
    });

    layout.stakePositions.forEach((position, i) => {
      const entity = stakeEntities[i];
      if (!entity) {
        return;
      }
      this.physicsSystem.setBodyTransform(entity, {
        position,
        quaternion: IDENTITY_QUATERNION,
      });
    });

    this.resizeCourtLines(preset, lineMeshes);
    this.menuSystem.applyCourtLayout(homePoses);
  }

  private resizeCourtLines(preset: CourtPreset, lineMeshes: Mesh[]): void {
    const [left, right, near, far, center] = lineMeshes;
    if (!left || !right || !near || !far || !center) {
      return; // unreachable — resolved from COURT_LINE_IDS's fixed 5 ids
    }
    const { thicknessM, heightM, yOffsetM } = pieces.courtLine;
    const halfWidthM = preset.widthM / 2;
    const centerZ = -preset.lengthM / 2;
    const farZ = -preset.lengthM;

    this.setLine('court-line-left', left, thicknessM, heightM, preset.lengthM, [
      -halfWidthM,
      yOffsetM,
      centerZ,
    ]);
    this.setLine(
      'court-line-right',
      right,
      thicknessM,
      heightM,
      preset.lengthM,
      [halfWidthM, yOffsetM, centerZ],
    );
    this.setLine('court-line-near', near, thicknessM, heightM, preset.widthM, [
      0,
      yOffsetM,
      0,
    ]);
    this.setLine('court-line-far', far, thicknessM, heightM, preset.widthM, [
      0,
      yOffsetM,
      farZ,
    ]);
    this.setLine(
      'court-line-center',
      center,
      thicknessM,
      heightM,
      preset.widthM,
      [0, yOffsetM, centerZ],
    );
  }

  private setLine(
    nodeId: string,
    mesh: Mesh,
    thicknessM: number,
    heightM: number,
    lengthM: number,
    position: Vec3,
  ): void {
    if (this.resizedLineIds.has(nodeId)) {
      mesh.geometry.dispose();
    }
    this.resizedLineIds.add(nodeId);
    mesh.geometry = new BoxGeometry(thicknessM, heightM, lengthM);
    mesh.position.set(position[0], position[1], position[2]);
  }
}
