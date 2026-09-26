import {
  BoxGeometry,
  createSystem,
  PhysicsBody,
  PhysicsSystem,
} from '@iwsdk/core';
import type { Entity, Mesh } from '@iwsdk/core';
import type { CourtPreset } from '../core/court-layout.js';
import {
  courtLayout,
  courtPresetForMode,
  defaultCourtPreset,
  getCourtPreset,
  pieces,
} from '../config.js';
import { settingsState } from '../settingsState.js';
import {
  FAR_RACK_NODE_IDS,
  STAKE_NODE_IDS,
  farBaselineZ,
} from '../core/court-layout.js';
import { gameEvents } from '../core/events.js';
import { log } from '../core/log.js';
import { mirrorPoseToFarBaseline } from '../core/presence.js';
import type { Settings } from '../core/settings.js';
import type { Vec3 } from '../core/vec3.js';
import type { HomePose } from './menu.js';
import { MenuSystem } from './menu.js';
import { localPoseOf } from './objectPose.js';

/** The guest's stick rack is the near rack mirrored around the far
 * baseline (same transform as the guest's own body and the sticks'
 * far-rack poses in MultiplayerSystem). The scene authors it at the
 * DEFAULT court's mirror; every other preset moves the far baseline,
 * so the rack must follow or the sticks get teleported onto bare ground
 * behind player B (Erik, 2026-09-06: "pinnarna spawnar inte på dess
 * bord … de försvann från marken" — Advanced mode, 8 m court, rack still
 * at the 6 m mirror z = −7.09, sticks placed at z = −9.09). */

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
  /** A persisted non-default mode must be laid out at startup too, not
   * only on the next button press (2026-09-06, found while chasing
   * Erik's "sticks vanish behind player B": with Advanced persisted the
   * court stayed the scene's authored 6 m while activeFarBaselineZ(),
   * the guest teleport and the far-rack stick poses all said 8 m).
   * Deferred to update(): PhysicsSystem creates Havok bodies lazily on
   * its first ticks, and setBodyTransform silently no-ops on an entity
   * without an engine body — at init() nothing would move. */
  private pendingStartupMode: Settings['gameMode'] | null = null;
  private startupProbeEntities: Entity[] = [];

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
      this.pendingStartupMode = null;
      this.applyGameMode(e.gameMode);
    });
    const startupMode = settingsState.current.gameMode;
    if (courtPresetForMode(startupMode) !== defaultCourtPreset) {
      // The scene JSON is authored for the default preset; anything
      // else needs the same relayout a button press would trigger.
      this.pendingStartupMode = startupMode;
      this.startupProbeEntities = [
        this.world.requireSceneEntity('king'),
        ...FAR_RACK_NODE_IDS.map(([, farId]) =>
          this.world.requireSceneEntity(farId),
        ),
        ...STAKE_NODE_IDS.map((id) => this.world.requireSceneEntity(id)),
      ].filter((entity) => entity.hasComponent(PhysicsBody));
    }
  }

  destroy(): void {
    this.unsubscribeGameModeChanged?.();
  }

  update(): void {
    if (this.pendingStartupMode === null) {
      return;
    }
    for (const entity of this.startupProbeEntities) {
      if (!entity.getValue(PhysicsBody, '_engineBody')) {
        return; // Havok body not created yet — try again next frame
      }
    }
    const mode = this.pendingStartupMode;
    this.pendingStartupMode = null;
    this.startupProbeEntities = [];
    this.applyGameMode(mode);
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
    this.placeFarRack(farBaselineZ(preset));
    this.menuSystem.applyCourtLayout(homePoses);
    log('info', 'state', 'court laid out', {
      gameMode,
      preset: presetName,
      farBaselineZ: farBaselineZ(preset),
      farRackZ: this.world.requireSceneEntity('stick-rack-2-collider').object3D
        ?.position.z,
    });
  }

  /** Visual rack node + its static collider, both mirrored from the
   * near rack's authored pose. setBodyTransform works for STATIC bodies
   * (the corner stakes above are moved the same way). */
  private placeFarRack(farZ: number): void {
    for (const [nearId, farId] of FAR_RACK_NODE_IDS) {
      const near = this.world.requireSceneEntity(nearId).object3D;
      const far = this.world.requireSceneEntity(farId);
      if (!near || !far.object3D) {
        continue;
      }
      const pose = mirrorPoseToFarBaseline(localPoseOf(near), farZ);
      if (far.hasComponent(PhysicsBody)) {
        this.physicsSystem.setBodyTransform(far, {
          position: pose.position,
          quaternion: pose.quaternion,
        });
      } else {
        far.object3D.position.set(...pose.position);
        far.object3D.quaternion.set(...pose.quaternion);
      }
    }
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
