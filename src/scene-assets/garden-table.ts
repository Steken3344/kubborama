import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  CylinderGeometry,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
} from '@iwsdk/core';
import type { Material } from '@iwsdk/core';
import { mergeMeshParts } from '../core/meshMerge.js';
import type { MeshPart } from '../core/meshMerge.js';
import {
  accentRedMaterial,
  kingWoodMaterial,
  woodMaterial,
} from './materials.js';

/**
 * The garden tables beside each baseline (Erik, 2026-11-01: sticks and
 * felled kubbs always on a table — "slipper böja sig ned" — and "förbättra
 * borden, blir lite roligare"). One builder for both: a top of three dark
 * cedar boards with small gaps and a Falu-red painted edge, an apron,
 * four pale legs with low stretchers, and a little red pennant on a pole
 * at one back corner. The top surface is exactly `topM` above the ground
 * (the static collider in the scene JSON matches it). Local origin is the
 * ground under the table's centre, +X along its width.
 */
export interface GardenTableSpec {
  name: string;
  widthM: number;
  depthM: number;
  topM: number;
  /** The little red pennant at a back corner (kept off the narrow stick
   * table, where the grabbing hand would clip its pole). */
  pennant?: boolean;
}

const BOARD_COUNT = 3;
const BOARD_GAP_M = 0.008;
const TOP_THICKNESS_M = 0.035;
const TRIM_HEIGHT_M = 0.02;
const TRIM_THICKNESS_M = 0.012;
const APRON_HEIGHT_M = 0.07;
const APRON_THICKNESS_M = 0.02;
const LEG_SIZE_M = 0.045;
const LEG_INSET_M = 0.05;
const STRETCHER_HEIGHT_M = 0.18;
const STRETCHER_SIZE_M = 0.03;
const POLE_HEIGHT_M = 0.45;
const PENNANT_LENGTH_M = 0.16;
const PENNANT_HEIGHT_M = 0.09;

/** The pennant is one triangle, seen from both sides. */
const pennantMaterial = new MeshStandardMaterial({
  color: accentRedMaterial.color,
  roughness: accentRedMaterial.roughness,
  side: DoubleSide,
});

/** Parts collected per material, merged into one mesh each at the end:
 * a table is then ~3 draw calls instead of ~20 (review, 2026-11-01). */
class PartsByMaterial {
  private readonly parts = new Map<Material, MeshPart[]>();
  private readonly geometries: BufferGeometry[] = [];

  add(
    geometry: BufferGeometry,
    material: Material,
    x: number,
    y: number,
    z: number,
  ): void {
    const index = geometry.index;
    const uv = geometry.getAttribute('uv');
    if (!index || !uv) {
      throw new Error('garden-table: indexed geometry with UVs expected');
    }
    this.geometries.push(geometry);
    const list = this.parts.get(material) ?? [];
    list.push({
      position: geometry.getAttribute('position').array,
      normal: geometry.getAttribute('normal').array,
      uv: uv.array,
      index: index.array,
      matrix: new Matrix4().makeTranslation(x, y, z).elements,
    });
    this.parts.set(material, list);
  }

  box(
    w: number,
    h: number,
    d: number,
    material: Material,
    x: number,
    y: number,
    z: number,
  ): void {
    this.add(new BoxGeometry(w, h, d), material, x, y, z);
  }

  /** One mesh per material; the source geometries are freed. */
  meshes(): Mesh[] {
    const meshes: Mesh[] = [];
    for (const [material, list] of this.parts) {
      const merged = mergeMeshParts(list);
      const geometry = new BufferGeometry();
      geometry.setAttribute(
        'position',
        new BufferAttribute(merged.position, 3),
      );
      geometry.setAttribute('normal', new BufferAttribute(merged.normal, 3));
      geometry.setAttribute('uv', new BufferAttribute(merged.uv, 2));
      geometry.setIndex(new BufferAttribute(merged.index, 1));
      geometry.computeBoundingSphere();
      const mesh = new Mesh(geometry, material);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      meshes.push(mesh);
    }
    for (const g of this.geometries) g.dispose();
    return meshes;
  }
}

export function buildGardenTable(spec: GardenTableSpec): Group {
  const { widthM: w, depthM: d, topM } = spec;
  const table = new Group();
  table.name = spec.name;
  const parts = new PartsByMaterial();
  const topY = topM - TOP_THICKNESS_M / 2;

  // Three boards along the width, small gaps between them.
  const boardDepth = (d - (BOARD_COUNT - 1) * BOARD_GAP_M) / BOARD_COUNT;
  for (let i = 0; i < BOARD_COUNT; i++) {
    const z = -d / 2 + boardDepth / 2 + i * (boardDepth + BOARD_GAP_M);
    parts.box(w, TOP_THICKNESS_M, boardDepth, kingWoodMaterial, 0, topY, z);
  }
  // A painted edge band around the top, just below its surface.
  const trimY = topM - TRIM_HEIGHT_M / 2 - 0.004;
  const tw = w + 2 * TRIM_THICKNESS_M;
  const tz = d / 2 + TRIM_THICKNESS_M / 2;
  const tx = w / 2 + TRIM_THICKNESS_M / 2;
  parts.box(
    tw,
    TRIM_HEIGHT_M,
    TRIM_THICKNESS_M,
    accentRedMaterial,
    0,
    trimY,
    tz,
  );
  parts.box(
    tw,
    TRIM_HEIGHT_M,
    TRIM_THICKNESS_M,
    accentRedMaterial,
    0,
    trimY,
    -tz,
  );
  parts.box(
    TRIM_THICKNESS_M,
    TRIM_HEIGHT_M,
    d,
    accentRedMaterial,
    tx,
    trimY,
    0,
  );
  parts.box(
    TRIM_THICKNESS_M,
    TRIM_HEIGHT_M,
    d,
    accentRedMaterial,
    -tx,
    trimY,
    0,
  );

  // Apron under the top.
  const apronY = topM - TOP_THICKNESS_M - APRON_HEIGHT_M / 2;
  const ax = w / 2 - LEG_INSET_M;
  const az = d / 2 - LEG_INSET_M;
  const apron = (aw: number, ad: number, x: number, z: number) =>
    parts.box(aw, APRON_HEIGHT_M, ad, kingWoodMaterial, x, apronY, z);
  apron(2 * ax, APRON_THICKNESS_M, 0, az);
  apron(2 * ax, APRON_THICKNESS_M, 0, -az);
  apron(APRON_THICKNESS_M, 2 * az, ax, 0);
  apron(APRON_THICKNESS_M, 2 * az, -ax, 0);

  // Four legs and low stretchers.
  const legHeight = topM - TOP_THICKNESS_M;
  for (const sx of [-1, 1] as const) {
    for (const sz of [-1, 1] as const) {
      parts.box(
        LEG_SIZE_M,
        legHeight,
        LEG_SIZE_M,
        woodMaterial,
        sx * ax,
        legHeight / 2,
        sz * az,
      );
    }
  }
  const s = STRETCHER_SIZE_M;
  parts.box(2 * ax, s, s, woodMaterial, 0, STRETCHER_HEIGHT_M, az);
  parts.box(2 * ax, s, s, woodMaterial, 0, STRETCHER_HEIGHT_M, -az);
  parts.box(s, s, 2 * az, woodMaterial, 0, STRETCHER_HEIGHT_M, 0);

  if (spec.pennant) {
    // A little red pennant on a pole at one back corner — just for fun.
    const poleX = w / 2 - 0.02;
    const poleZ = -d / 2 + 0.02;
    parts.add(
      new CylinderGeometry(0.006, 0.006, POLE_HEIGHT_M, 6),
      woodMaterial,
      poleX,
      topM + POLE_HEIGHT_M / 2,
      poleZ,
    );
    const pennantGeometry = new BufferGeometry();
    const py = topM + POLE_HEIGHT_M - 0.01;
    pennantGeometry.setAttribute(
      'position',
      new Float32BufferAttribute(
        [
          0,
          py,
          0,
          0,
          py - PENNANT_HEIGHT_M,
          0,
          PENNANT_LENGTH_M,
          py - PENNANT_HEIGHT_M / 2,
          0,
        ],
        3,
      ),
    );
    pennantGeometry.computeVertexNormals();
    const pennant = new Mesh(pennantGeometry, pennantMaterial);
    pennant.position.set(poleX, 0, poleZ);
    table.add(pennant);
  }
  for (const mesh of parts.meshes()) {
    table.add(mesh);
  }
  return table;
}
