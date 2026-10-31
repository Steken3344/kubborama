import {
  BufferAttribute,
  BufferGeometry,
  createSystem,
  Matrix4,
  Mesh,
  Quaternion,
  Vector3,
} from '@iwsdk/core';
import type { Material, Object3D } from '@iwsdk/core';
import { staticBatchNodePatterns } from '../config.js';
import { log } from '../core/log.js';
import { materialLookKey, mergeMeshParts } from '../core/meshMerge.js';
import type { MeshPart } from '../core/meshMerge.js';

/** Give up looking for the props after this long (they load with the level). */
const GIVE_UP_S = 10;
const RETRY_EVERY_S = 0.5;

/** The material's visible look as plain fields (core/meshMerge.ts). */
function materialKey(material: Material): string {
  const m = material as Material & {
    color?: { getHexString?: () => string };
    map?: { uuid: string } | null;
    emissive?: { getHexString?: () => string };
    vertexColors?: boolean;
    flatShading?: boolean;
  };
  return materialLookKey({
    type: material.type,
    name: material.name,
    colorHex: m.color?.getHexString?.() ?? '',
    emissiveHex: m.emissive?.getHexString?.() ?? '',
    mapId: m.map?.uuid ?? '',
    vertexColors: m.vertexColors ?? false,
    flatShading: m.flatShading ?? false,
    transparent: material.transparent,
    opacity: material.opacity,
    alphaTest: material.alphaTest,
    side: material.side,
  });
}

/**
 * Static batching (Erik approved, 2026-10-31): the garden's trees,
 * bushes, rocks, cliffs, campsite and fence — ~130 draw calls sharing
 * about fifteen materials — are merged into one mesh per material
 * (core/meshMerge.ts) once the level has loaded, and the originals are
 * hidden. Nothing that moves, collides on the client or is UI is
 * touched: only scene nodes matching src/data/static-batch.json.
 * Scene JSON and the editor are unaffected — this is runtime only.
 *
 * It runs once: a second level load (none exists today) would dispose
 * the batches with the level and not rebuild them.
 */
export class StaticBatchSystem extends createSystem({}) {
  private done = false;
  private elapsedS = 0;
  private nextTryS = 0;
  private readonly scale = new Vector3();
  private readonly position = new Vector3();
  private readonly rotation = new Quaternion();

  update(delta: number): void {
    if (this.done) return;
    this.elapsedS += delta;
    if (this.elapsedS < this.nextTryS) return;
    this.nextTryS = this.elapsedS + RETRY_EVERY_S;
    const meshes = this.staticMeshes();
    if (meshes.length > 0 || this.elapsedS > GIVE_UP_S) {
      this.done = true;
      this.batch(meshes);
    }
  }

  /** Every shown mesh under a matching scene node, safe to merge. */
  private staticMeshes(): Mesh[] {
    const roots: Object3D[] = [];
    // IWSDK tags authored objects with their scene node id; there is no
    // public way to enumerate nodes by pattern.
    this.world.scene.traverse((object) => {
      const id: unknown = object.userData['iwsdkSceneNodeId'];
      if (
        typeof id === 'string' &&
        staticBatchNodePatterns.some((p) => p.test(id))
      ) {
        roots.push(object);
      }
    });
    const meshes = new Set<Mesh>();
    for (const root of roots) {
      root.traverse((object) => {
        if (object instanceof Mesh && this.mergeable(object)) {
          meshes.add(object);
        }
      });
    }
    return [...meshes];
  }

  private mergeable(mesh: Mesh): boolean {
    // Instanced or skinned meshes are Meshes too, but one geometry copy
    // would stand for all their instances / poses.
    const kind = mesh as Mesh & {
      isInstancedMesh?: boolean;
      isSkinnedMesh?: boolean;
    };
    if (kind.isInstancedMesh || kind.isSkinnedMesh) return false;
    // Hidden by itself or by any ancestor: merging would show it.
    for (let o: Object3D | null = mesh; o; o = o.parent) {
      if (!o.visible) return false;
    }
    const g = mesh.geometry;
    if (Array.isArray(mesh.material) || !g.index || g.groups.length > 1) {
      return false;
    }
    if (Object.keys(g.morphAttributes).length > 0) return false;
    // The merge reads raw `.array`s: plain, unnormalised attributes only.
    for (const name of ['position', 'normal', 'uv']) {
      const a = g.attributes[name] as
        | (BufferAttribute & { isInterleavedBufferAttribute?: boolean })
        | undefined;
      if (name !== 'uv' && !a) return false;
      if (a && (a.isInterleavedBufferAttribute || a.normalized)) return false;
    }
    mesh.updateWorldMatrix(true, false);
    mesh.matrixWorld.decompose(this.position, this.rotation, this.scale);
    // Normals are only exact under uniform scale (core/meshMerge.ts).
    return (
      Math.abs(this.scale.x - this.scale.y) < 1e-4 &&
      Math.abs(this.scale.y - this.scale.z) < 1e-4
    );
  }

  private batch(meshes: Mesh[]): void {
    const groups = new Map<string, { material: Material; meshes: Mesh[] }>();
    for (const mesh of meshes) {
      const material = mesh.material as Material;
      const key = materialKey(material);
      const group = groups.get(key) ?? { material, meshes: [] };
      group.meshes.push(mesh);
      groups.set(key, group);
    }
    for (const { material, meshes: members } of groups.values()) {
      const parts: MeshPart[] = members.map((mesh) => {
        const g = mesh.geometry;
        const attr = (name: string) => g.attributes[name]?.array ?? [];
        return {
          position: attr('position'),
          normal: attr('normal'),
          uv: attr('uv'),
          index: g.index?.array ?? [],
          matrix: mesh.matrixWorld.elements,
        };
      });
      const merged = mergeMeshParts(parts);
      const geometry = new BufferGeometry();
      geometry.setAttribute(
        'position',
        new BufferAttribute(merged.position, 3),
      );
      geometry.setAttribute('normal', new BufferAttribute(merged.normal, 3));
      geometry.setAttribute('uv', new BufferAttribute(merged.uv, 2));
      geometry.setIndex(new BufferAttribute(merged.index, 1));
      geometry.computeBoundingSphere();
      const batched = new Mesh(geometry, material);
      batched.name = `static-batch:${material.name}`;
      batched.castShadow = members.some((m) => m.castShadow);
      batched.receiveShadow = members.some((m) => m.receiveShadow);
      this.world.createTransformEntity(batched);
      // The vertices are in WORLD space: cancel whatever the parent (the
      // level root, identity today) adds on top.
      const parent = batched.parent;
      if (parent) {
        parent.updateWorldMatrix(true, false);
        batched.applyMatrix4(new Matrix4().copy(parent.matrixWorld).invert());
      }
      for (const mesh of members) {
        mesh.visible = false;
      }
    }
    log('info', 'debug', 'static batch', {
      meshes: meshes.length,
      batches: groups.size,
    });
  }
}
