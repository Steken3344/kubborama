/**
 * Static batching (bot-match play session, 2026-10-31: 200 draw calls,
 * ~130 of them garden props sharing about fifteen materials). Pure:
 * indexed triangle meshes in, one merged mesh out, each part moved into
 * world space by its column-major 4×4 matrix (three.js
 * `Matrix4.elements` order).
 *
 * Normals are turned by the matrix's upper 3×3 and renormalised — exact
 * for rotation plus UNIFORM scale, which is all the scene authors (the
 * caller skips anything else).
 */
export interface MeshPart {
  position: ArrayLike<number>;
  normal: ArrayLike<number>;
  uv: ArrayLike<number>;
  index: ArrayLike<number>;
  matrix: ArrayLike<number>;
}

export interface MergedMesh {
  position: Float32Array;
  normal: Float32Array;
  uv: Float32Array;
  index: Uint32Array;
}

export function mergeMeshParts(parts: readonly MeshPart[]): MergedMesh {
  let vertices = 0;
  let indices = 0;
  for (const p of parts) {
    vertices += p.position.length / 3;
    indices += p.index.length;
  }
  const position = new Float32Array(vertices * 3);
  const normal = new Float32Array(vertices * 3);
  const uv = new Float32Array(vertices * 2);
  const index = new Uint32Array(indices);
  let v = 0;
  let i = 0;
  for (const p of parts) {
    const m = (k: number) => p.matrix[k] ?? 0;
    const count = p.position.length / 3;
    for (let k = 0; k < count; k += 1) {
      const x = p.position[k * 3] ?? 0;
      const y = p.position[k * 3 + 1] ?? 0;
      const z = p.position[k * 3 + 2] ?? 0;
      const o = (v + k) * 3;
      position[o] = m(0) * x + m(4) * y + m(8) * z + m(12);
      position[o + 1] = m(1) * x + m(5) * y + m(9) * z + m(13);
      position[o + 2] = m(2) * x + m(6) * y + m(10) * z + m(14);
      const nx = p.normal[k * 3] ?? 0;
      const ny = p.normal[k * 3 + 1] ?? 0;
      const nz = p.normal[k * 3 + 2] ?? 0;
      const tx = m(0) * nx + m(4) * ny + m(8) * nz;
      const ty = m(1) * nx + m(5) * ny + m(9) * nz;
      const tz = m(2) * nx + m(6) * ny + m(10) * nz;
      const length = Math.hypot(tx, ty, tz) || 1;
      normal[o] = tx / length;
      normal[o + 1] = ty / length;
      normal[o + 2] = tz / length;
      uv[(v + k) * 2] = p.uv[k * 2] ?? 0;
      uv[(v + k) * 2 + 1] = p.uv[k * 2 + 1] ?? 0;
    }
    for (let k = 0; k < p.index.length; k += 1) {
      index[i + k] = (p.index[k] ?? 0) + v;
    }
    v += count;
    i += p.index.length;
  }
  return { position, normal, uv, index };
}

/** What makes two materials render the same, as plain fields. The
 * static batch draws a group with its FIRST member's material, so
 * everything visible belongs in the key (review, 2026-10-31). */
export interface MaterialLook {
  type: string;
  name: string;
  colorHex: string;
  emissiveHex: string;
  /** The texture's identity, '' for none. */
  mapId: string;
  vertexColors: boolean;
  flatShading: boolean;
  transparent: boolean;
  opacity: number;
  alphaTest: number;
  side: number;
}

export function materialLookKey(look: MaterialLook): string {
  return [
    look.type,
    look.name,
    look.colorHex,
    look.emissiveHex,
    look.mapId,
    look.vertexColors,
    look.flatShading,
    look.transparent,
    look.opacity,
    look.alphaTest,
    look.side,
  ].join('|');
}
