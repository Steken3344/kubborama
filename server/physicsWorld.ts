/// <reference types="node" />
import HavokPhysics from '@babylonjs/havok';
import type {
  HP_BodyId,
  HP_WorldId,
  HavokPhysicsWithBindings,
} from '@babylonjs/havok';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { courtLayout, getCourtPreset } from '../src/config.js';
import type { CourtPresetName } from '../src/config.js';
import {
  FAR_RACK_NODE_IDS,
  farBaselineZ,
  STAKE_NODE_IDS,
} from '../src/core/court-layout.js';
import { kubbId } from '../src/core/match.js';
import { mirrorPoseToFarBaseline } from '../src/core/presence.js';
import { fromEulerDegXYZ } from '../src/core/quat.js';
import type { Quat } from '../src/core/quat.js';
import type { ServerPieceTransform } from '../src/core/serverProtocol.js';
import type { Vec3 } from '../src/core/vec3.js';

/**
 * MP5 (docs/superpowers/specs/2026-09-26-authoritative-server-design.md):
 * the server's physics — the same Havok build IWSDK runs in the headsets
 * (@babylonjs/havok), with every collider built from the scene JSON the
 * app loads, using the exact calls IWSDK's PhysicsSystem makes
 * (CreateBox / CreateCylinder, SetMaterial MINIMUM/MAXIMUM friction/
 * restitution combine, BuildMassProperties). The SPIKE of 2026-09-26
 * (docs/DECISIONS.md) showed flight matches the browser; rest points are
 * chaotic, which is exactly why one server owns them. The court preset
 * is applied like CourtLayoutSystem does: kubbs, king and stakes from
 * `courtLayout()`, the far rack mirrored to the far baseline.
 */

interface SceneNode {
  id: string;
  transform?: { position?: number[]; rotationDeg?: number[] };
  components?: {
    PhysicsShape?: {
      shape: string;
      dimensions: number[];
      density?: number;
      friction?: number;
      restitution?: number;
    };
    PhysicsBody?: {
      state?: string;
      linearDamping?: number;
      angularDamping?: number;
      gravityFactor?: number;
    };
  };
}

/** IWSDK's PhysicsBody / PhysicsShape defaults for absent fields. */
const DEFAULTS = {
  density: 1,
  friction: 0.5,
  restitution: 0,
  linearDamping: 0,
  angularDamping: 0,
  gravityFactor: 1,
};

export interface ThrowInput {
  pieceId: string;
  position: Vec3;
  quaternion: Quat;
  linearVelocity: Vec3;
  angularVelocity: Vec3;
}

export interface PhysicsWorld {
  /** Advance by exactly `dtS` (the server runs a fixed timestep). */
  step(dtS: number): void;
  /** Current transforms of the given dynamic pieces, in that order. */
  snapshot(ids: readonly string[]): ServerPieceTransform[];
  /** Teleport a piece and give it a release velocity. False if unknown. */
  applyThrow(input: ThrowInput): boolean;
  /** Linear and angular speed of a piece (rest detection). */
  speeds(id: string): [number, number] | null;
}

const havokPromise: Promise<HavokPhysicsWithBindings> = (async () => {
  const require = createRequire(import.meta.url);
  const wasmPath =
    require.resolve('@babylonjs/havok/lib/esm/HavokPhysics.wasm');
  const bytes = readFileSync(wasmPath);
  // Havok wants a plain ArrayBuffer, not Node's pooled Buffer view.
  const wasmBinary = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
  return HavokPhysics({ wasmBinary });
})();

function loadSceneNodes(): SceneNode[] {
  const path = fileURLToPath(
    new URL('../public/scenes/main.iwsdk.scene.json', import.meta.url),
  );
  const scene = JSON.parse(readFileSync(path, 'utf8')) as {
    nodes: SceneNode[];
  };
  return scene.nodes;
}

/** Where the preset puts the pieces the court layout owns. */
function presetPositions(presetName: CourtPresetName): Map<string, Vec3> {
  const layout = courtLayout(presetName);
  const positions = new Map<string, Vec3>();
  positions.set('king', layout.kingPosition);
  layout.kubbPositions.forEach((p, i) => positions.set(kubbId(i), p));
  layout.stakePositions.forEach((p, i) => {
    const id = STAKE_NODE_IDS[i];
    if (id) {
      positions.set(id, p);
    }
  });
  return positions;
}

export async function createPhysicsWorld(
  presetName: CourtPresetName,
): Promise<PhysicsWorld> {
  const hk = await havokPromise;
  const world: HP_WorldId = hk.HP_World_Create()[1];
  hk.HP_World_SetGravity(world, [0, -9.81, 0]);
  const nodes = loadSceneNodes();
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const positions = presetPositions(presetName);
  const farZ = farBaselineZ(getCourtPreset(presetName));
  const farRackPoses = new Map<string, { position: Vec3; quaternion: Quat }>();
  for (const [nearId, farId] of FAR_RACK_NODE_IDS) {
    const near = byId.get(nearId)?.transform;
    if (near?.position) {
      farRackPoses.set(
        farId,
        mirrorPoseToFarBaseline(
          {
            position: near.position as Vec3,
            quaternion: fromEulerDegXYZ(
              (near.rotationDeg ?? [0, 0, 0]) as Vec3,
            ),
          },
          farZ,
        ),
      );
    }
  }

  const bodies = new Map<string, HP_BodyId>();
  for (const node of nodes) {
    const shapeDef = node.components?.PhysicsShape;
    if (!shapeDef) {
      continue;
    }
    const [d0 = 0, d1 = 0, d2 = 0] = shapeDef.dimensions;
    const shape =
      shapeDef.shape === 'Cylinder'
        ? hk.HP_Shape_CreateCylinder([0, -d1 / 2, 0], [0, d1 / 2, 0], d0)[1]
        : hk.HP_Shape_CreateBox([0, 0, 0], [0, 0, 0, 1], [d0, d1, d2])[1];
    const friction = shapeDef.friction ?? DEFAULTS.friction;
    hk.HP_Shape_SetDensity(shape, shapeDef.density ?? DEFAULTS.density);
    hk.HP_Shape_SetMaterial(shape, [
      friction,
      friction,
      shapeDef.restitution ?? DEFAULTS.restitution,
      hk.MaterialCombine.MINIMUM,
      hk.MaterialCombine.MAXIMUM,
    ]);
    const bodyDef = node.components?.PhysicsBody ?? {};
    const body: HP_BodyId = hk.HP_Body_Create()[1];
    hk.HP_Body_SetShape(body, shape);
    const farPose = farRackPoses.get(node.id);
    const position =
      farPose?.position ??
      positions.get(node.id) ??
      ((node.transform?.position ?? [0, 0, 0]) as Vec3);
    const quaternion =
      farPose?.quaternion ??
      fromEulerDegXYZ((node.transform?.rotationDeg ?? [0, 0, 0]) as Vec3);
    hk.HP_Body_SetQTransform(body, [position, quaternion]);
    hk.HP_Body_SetLinearDamping(
      body,
      bodyDef.linearDamping ?? DEFAULTS.linearDamping,
    );
    hk.HP_Body_SetAngularDamping(
      body,
      bodyDef.angularDamping ?? DEFAULTS.angularDamping,
    );
    hk.HP_Body_SetGravityFactor(
      body,
      bodyDef.gravityFactor ?? DEFAULTS.gravityFactor,
    );
    const mass = hk.HP_Shape_BuildMassProperties(shape);
    hk.HP_Body_SetMassProperties(
      body,
      mass[0] === hk.Result.RESULT_OK
        ? mass[1]
        : [[0, 0, 0], 1, [1, 1, 1], [0, 0, 0, 1]],
    );
    hk.HP_Body_SetMotionType(
      body,
      bodyDef.state === 'DYNAMIC'
        ? hk.MotionType.DYNAMIC
        : bodyDef.state === 'KINEMATIC'
          ? hk.MotionType.KINEMATIC
          : hk.MotionType.STATIC,
    );
    hk.HP_World_AddBody(world, body, false);
    bodies.set(node.id, body);
  }

  return {
    step(dtS) {
      hk.HP_World_SetIdealStepTime(world, dtS);
      hk.HP_World_Step(world, dtS);
    },
    snapshot(ids) {
      const out: ServerPieceTransform[] = [];
      for (const id of ids) {
        const body = bodies.get(id);
        if (!body) {
          continue;
        }
        const [position, quaternion] = hk.HP_Body_GetQTransform(body)[1];
        out.push({ id, position, quaternion });
      }
      return out;
    },
    applyThrow(input) {
      const body = bodies.get(input.pieceId);
      const [qx, qy, qz, qw] = input.quaternion;
      const qLength = Math.hypot(qx, qy, qz, qw);
      if (!body || qLength < 1e-6) {
        return false;
      }
      hk.HP_Body_SetQTransform(body, [
        input.position,
        [qx / qLength, qy / qLength, qz / qLength, qw / qLength],
      ]);
      hk.HP_Body_SetLinearVelocity(body, input.linearVelocity);
      hk.HP_Body_SetAngularVelocity(body, input.angularVelocity);
      return true;
    },
    speeds(id) {
      const body = bodies.get(id);
      if (!body) {
        return null;
      }
      const v = hk.HP_Body_GetLinearVelocity(body)[1];
      const w = hk.HP_Body_GetAngularVelocity(body)[1];
      return [Math.hypot(...v), Math.hypot(...w)];
    },
  };
}
