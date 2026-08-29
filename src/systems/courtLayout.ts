import {
  BoxGeometry,
  createSystem,
  Euler,
  PhysicsSystem,
  Quaternion,
} from '@iwsdk/core';
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

const IDENTITY_QUATERNION: [number, number, number, number] = [0, 0, 0, 1];

/** Sticks lie flat with a fixed 90° tip (see stick.scene-asset.ts) plus
 * their scattered yaw — matches how the authored scene's rotationDeg
 * values were originally produced from computeCourtLayout's yawRad. */
function stickQuaternion(yawRad: number): [number, number, number, number] {
  const q = new Quaternion().setFromEuler(new Euler(0, yawRad, Math.PI / 2));
  return [q.x, q.y, q.z, q.w];
}

/**
 * Repositions the court to the active game mode's preset (M4's known
 * gap: court size never changed with mode — docs/DECISIONS.md).
 * Subscribes to GameModeChanged (emitted by SettingsSystem.setGameMode)
 * and:
 *  1. recomputes king/kubb/stake/stick positions with the SAME pure
 *     computeCourtLayout() the scene was originally authored from, and
 *     hands them to MenuSystem.applyCourtLayout() — reusing its
 *     existing release/rack/teleport + Reset-event path instead of
 *     duplicating it (switching mode mid-round IS a reset, just onto a
 *     different layout);
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

    const homePoses = new Map<number, HomePose>();

    homePoses.set(this.world.requireSceneEntity('king').index, {
      position: layout.kingPosition,
      quaternion: IDENTITY_QUATERNION,
    });

    layout.kubbPositions.forEach((position, i) => {
      homePoses.set(this.world.requireSceneEntity(`kubb-${i}`).index, {
        position,
        quaternion: IDENTITY_QUATERNION,
      });
    });

    STAKE_NODE_IDS.forEach((nodeId, i) => {
      const position = layout.stakePositions[i];
      if (!position) {
        return;
      }
      this.physicsSystem.setBodyTransform(
        this.world.requireSceneEntity(nodeId),
        { position, quaternion: IDENTITY_QUATERNION },
      );
    });

    layout.stickSpawnPositions.forEach((spawn, i) => {
      homePoses.set(this.world.requireSceneEntity(`stick-${i}`).index, {
        position: spawn.position,
        quaternion: stickQuaternion(spawn.yawRad),
      });
    });

    this.resizeCourtLines(preset);
    this.menuSystem.applyCourtLayout(homePoses);
  }

  private resizeCourtLines(preset: CourtPreset): void {
    const { thicknessM, heightM, yOffsetM } = pieces.courtLine;
    const halfWidthM = preset.widthM / 2;
    const centerZ = -preset.lengthM / 2;
    const farZ = -preset.lengthM;

    this.setLine('court-line-left', thicknessM, heightM, preset.lengthM, [
      -halfWidthM,
      yOffsetM,
      centerZ,
    ]);
    this.setLine('court-line-right', thicknessM, heightM, preset.lengthM, [
      halfWidthM,
      yOffsetM,
      centerZ,
    ]);
    this.setLine('court-line-near', thicknessM, heightM, preset.widthM, [
      0,
      yOffsetM,
      0,
    ]);
    this.setLine('court-line-far', thicknessM, heightM, preset.widthM, [
      0,
      yOffsetM,
      farZ,
    ]);
    this.setLine('court-line-center', thicknessM, heightM, preset.widthM, [
      0,
      yOffsetM,
      centerZ,
    ]);
  }

  private setLine(
    nodeId: string,
    thicknessM: number,
    heightM: number,
    lengthM: number,
    position: Vec3,
  ): void {
    const mesh = this.world.requireSceneEntity(nodeId).object3D as Mesh;
    if (this.resizedLineIds.has(nodeId)) {
      mesh.geometry.dispose();
    }
    this.resizedLineIds.add(nodeId);
    mesh.geometry = new BoxGeometry(thicknessM, heightM, lengthM);
    mesh.position.set(position[0], position[1], position[2]);
  }
}
