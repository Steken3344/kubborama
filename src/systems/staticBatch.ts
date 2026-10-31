import {
  BufferAttribute,
  BufferGeometry,
  createSystem,
  Mesh,
  Quaternion,
  Vector3,
} from '@iwsdk/core';
import type { Material, Object3D } from '@iwsdk/core';
import { staticBatchNodePatterns } from '../config.js';
import { log } from '../core/log.js';
import { mergeMeshParts } from '../core/meshMerge.js';
import type { MeshPart } from '../core/meshMerge.js';

/** Give up looking for the props after this long (they load with the level). */
const GIVE_UP_S = 10;
const RETRY_EVERY_S = 0.5;

/**
 * Static batching (Erik approved, 2026-10-31): the garden's trees,
 * bushes, rocks, cliffs, campsite and fence — ~130 draw calls sharing
 * about fifteen materials — are merged into one mesh per material
 * (core/meshMerge.ts) once the level has loaded, and the originals are
 * hidden. Nothing that moves, collides on the client or is UI is
 * touched: only scene nodes matching src/data/static-batch.json.
 * Scene JSON and the editor are unaffected — this is runtime only.
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

  /** Every visible mesh under a matching scene node, ready to merge. */
  private staticMeshes(): Mesh[] {
    const roots: Object3D[] = [];
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
        if (
          object instanceof Mesh &&
          object.visible &&
          this.mergeable(object)
        ) {
          meshes.add(object);
        }
      });
    }
    return [...meshes];
  }

  private mergeable(mesh: Mesh): boolean {
    const g = mesh.geometry;
    if (Array.isArray(mesh.material) || !g.index) return false;
    if (
      !g.attributes['position'] ||
      !g.attributes['normal'] ||
      !g.attributes['uv']
    ) {
      return false;
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
      const color =
        'color' in material &&
        material.color &&
        typeof material.color === 'object' &&
        'getHexString' in material.color
          ? (material.color as { getHexString: () => string }).getHexString()
          : '';
      const key = `${material.type}|${material.name}|${color}|${String(material.transparent)}|${String(material.side)}`;
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
