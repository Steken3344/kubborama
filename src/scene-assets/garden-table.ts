import {
  BoxGeometry,
  BufferGeometry,
  CylinderGeometry,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  Mesh,
  MeshStandardMaterial,
} from '@iwsdk/core';
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

function box(
  w: number,
  h: number,
  d: number,
  material: typeof woodMaterial,
  x: number,
  y: number,
  z: number,
): Mesh {
  const mesh = new Mesh(new BoxGeometry(w, h, d), material);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

export function buildGardenTable(spec: GardenTableSpec): Group {
  const { widthM: w, depthM: d, topM } = spec;
  const table = new Group();
  table.name = spec.name;
  const topY = topM - TOP_THICKNESS_M / 2;

  // Three boards along the width, small gaps between them.
  const boardDepth = (d - (BOARD_COUNT - 1) * BOARD_GAP_M) / BOARD_COUNT;
  for (let i = 0; i < BOARD_COUNT; i++) {
    const z = -d / 2 + boardDepth / 2 + i * (boardDepth + BOARD_GAP_M);
    table.add(
      box(w, TOP_THICKNESS_M, boardDepth, kingWoodMaterial, 0, topY, z),
    );
  }
  // A painted edge band around the top, just below its surface.
  const trimY = topM - TRIM_HEIGHT_M / 2 - 0.004;
  const tw = w + 2 * TRIM_THICKNESS_M;
  table.add(
    box(
      tw,
      TRIM_HEIGHT_M,
      TRIM_THICKNESS_M,
      accentRedMaterial,
      0,
      trimY,
      d / 2 + TRIM_THICKNESS_M / 2,
    ),
  );
  table.add(
    box(
      tw,
      TRIM_HEIGHT_M,
      TRIM_THICKNESS_M,
      accentRedMaterial,
      0,
      trimY,
      -d / 2 - TRIM_THICKNESS_M / 2,
    ),
  );
  table.add(
    box(
      TRIM_THICKNESS_M,
      TRIM_HEIGHT_M,
      d,
      accentRedMaterial,
      w / 2 + TRIM_THICKNESS_M / 2,
      trimY,
      0,
    ),
  );
  table.add(
    box(
      TRIM_THICKNESS_M,
      TRIM_HEIGHT_M,
      d,
      accentRedMaterial,
      -w / 2 - TRIM_THICKNESS_M / 2,
      trimY,
      0,
    ),
  );

  // Apron under the top.
  const apronY = topM - TOP_THICKNESS_M - APRON_HEIGHT_M / 2;
  const ax = w / 2 - LEG_INSET_M;
  const az = d / 2 - LEG_INSET_M;
  table.add(
    box(
      2 * ax,
      APRON_HEIGHT_M,
      APRON_THICKNESS_M,
      kingWoodMaterial,
      0,
      apronY,
      az,
    ),
  );
  table.add(
    box(
      2 * ax,
      APRON_HEIGHT_M,
      APRON_THICKNESS_M,
      kingWoodMaterial,
      0,
      apronY,
      -az,
    ),
  );
  table.add(
    box(
      APRON_THICKNESS_M,
      APRON_HEIGHT_M,
      2 * az,
      kingWoodMaterial,
      ax,
      apronY,
      0,
    ),
  );
  table.add(
    box(
      APRON_THICKNESS_M,
      APRON_HEIGHT_M,
      2 * az,
      kingWoodMaterial,
      -ax,
      apronY,
      0,
    ),
  );

  // Four legs and low stretchers.
  const legHeight = topM - TOP_THICKNESS_M;
  for (const sx of [-1, 1] as const) {
    for (const sz of [-1, 1] as const) {
      table.add(
        box(
          LEG_SIZE_M,
          legHeight,
          LEG_SIZE_M,
          woodMaterial,
          sx * ax,
          legHeight / 2,
          sz * az,
        ),
      );
    }
  }
  table.add(
    box(
      2 * ax,
      STRETCHER_SIZE_M,
      STRETCHER_SIZE_M,
      woodMaterial,
      0,
      STRETCHER_HEIGHT_M,
      az,
    ),
  );
  table.add(
    box(
      2 * ax,
      STRETCHER_SIZE_M,
      STRETCHER_SIZE_M,
      woodMaterial,
      0,
      STRETCHER_HEIGHT_M,
      -az,
    ),
  );
  table.add(
    box(
      STRETCHER_SIZE_M,
      STRETCHER_SIZE_M,
      2 * az,
      woodMaterial,
      0,
      STRETCHER_HEIGHT_M,
      0,
    ),
  );

  // A little red pennant on a pole at one back corner — just for fun.
  const poleX = w / 2 - 0.02;
  const poleZ = -d / 2 + 0.02;
  const pole = new Mesh(
    new CylinderGeometry(0.006, 0.006, POLE_HEIGHT_M, 6),
    woodMaterial,
  );
  pole.position.set(poleX, topM + POLE_HEIGHT_M / 2, poleZ);
  table.add(pole);
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
  return table;
}
