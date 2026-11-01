import { BufferAttribute, BufferGeometry, Color, Mesh } from '@iwsdk/core';
import { stoneWall } from '../config.js';
import { createRng } from '../core/rng.js';
import { stoneMaterial } from './materials.js';

// Erik's feedback, 2026-11-01: the 30 x 30 m ground used to just end
// in a drop — a low dry-stone wall along its edge makes it read as a
// garden boundary. Procedural and seeded (core/rng.ts) so the runtime
// and editor realms build the identical wall. All stones are baked
// into ONE flat-shaded, vertex-coloured geometry: one draw call.
//
// Local origin is the ground's centre at ground level; the wall's
// outer face sits at ±outerSideM/2 on X and Z.

/** Icosahedron corners (three.js's IcosahedronGeometry ordering),
 * scaled so the largest coordinate is 1 — a stone is this blob
 * jittered and stretched to its half-extents. */
const PHI = (1 + Math.sqrt(5)) / 2;
const ICO_VERTICES: readonly (readonly [number, number, number])[] = (
  [
    [-1, PHI, 0],
    [1, PHI, 0],
    [-1, -PHI, 0],
    [1, -PHI, 0],
    [0, -1, PHI],
    [0, 1, PHI],
    [0, -1, -PHI],
    [0, 1, -PHI],
    [PHI, 0, -1],
    [PHI, 0, 1],
    [-PHI, 0, -1],
    [-PHI, 0, 1],
  ] as const
).map(([x, y, z]) => [x / PHI, y / PHI, z / PHI] as const);
const ICO_FACES: readonly number[] = [
  0, 11, 5, 0, 5, 1, 0, 1, 7, 0, 7, 10, 0, 10, 11, 1, 5, 9, 5, 11, 4, 11, 10, 2,
  10, 7, 6, 7, 1, 8, 3, 9, 4, 3, 4, 2, 3, 2, 6, 3, 6, 8, 3, 8, 9, 4, 9, 5, 2, 4,
  11, 6, 2, 10, 8, 6, 7, 9, 8, 1,
];
/** Stones overlap their neighbours a little so no gaps show through. */
const LENGTH_OVERLAP = 1.12;
/** Per-corner jitter as a fraction of the stone's half-extents. */
const SHAPE_JITTER = 0.18;
/** Max yaw / tilt of a stone off the wall's line, radians. */
const MAX_YAW_RAD = 0.08;
const MAX_TILT_RAD = 0.06;

interface Stone {
  /** Centre along the side, across it, and height (side-local, m). */
  along: number;
  across: number;
  y: number;
  halfLength: number;
  halfHeight: number;
  halfDepth: number;
  yawRad: number;
  tiltRad: number;
  /** 0–2: which icosahedron axis maps to the stone's length. */
  axisShift: number;
  color: Color;
}

function buildStoneWall(): Mesh {
  const rand = createRng(stoneWall.seed);
  const range = (min: number, max: number): number =>
    min + (max - min) * rand();
  const palette = stoneWall.colors.map((hex) => new Color(hex));

  const halfSide = stoneWall.outerSideM / 2;
  const thickness = stoneWall.thicknessM;
  const courseHeight =
    (stoneWall.heightM + stoneWall.sinkM) / stoneWall.courseCount;

  // One side, along local X at z = halfSide - thickness/2. It runs
  // from -halfSide to halfSide - thickness; rotating it 90° four times
  // makes a pinwheel where each corner square is filled exactly once.
  const sides: Stone[][] = [];
  for (let side = 0; side < 4; side++) {
    const stones: Stone[] = [];
    const start = -halfSide;
    const end = halfSide - thickness;
    for (let course = 0; course < stoneWall.courseCount; course++) {
      const isTop = course === stoneWall.courseCount - 1;
      let cursor = start;
      // Running bond: odd courses start with a short stone.
      let first = course % 2 === 1;
      while (cursor < end - 0.01) {
        let length = range(
          stoneWall.stoneLengthMinM,
          stoneWall.stoneLengthMaxM,
        );
        if (first) length *= 0.5;
        first = false;
        length = Math.min(length, end - cursor);
        const baseColor =
          palette[Math.floor(rand() * palette.length)] ?? new Color('#888');
        const color = baseColor.clone().multiplyScalar(range(0.82, 1.12));
        stones.push({
          along: cursor + length / 2,
          across: halfSide - thickness / 2 + range(-1, 1) * stoneWall.jitterM,
          y:
            -stoneWall.sinkM +
            courseHeight * (course + 0.5) +
            range(-0.3, 0.3) * stoneWall.jitterM,
          halfLength: (length / 2) * LENGTH_OVERLAP,
          halfHeight: (courseHeight / 2) * range(0.95, isTop ? 1.4 : 1.25),
          halfDepth: (thickness / 2) * range(0.88, 1.05),
          yawRad: range(-MAX_YAW_RAD, MAX_YAW_RAD),
          tiltRad: range(-MAX_TILT_RAD, MAX_TILT_RAD),
          axisShift: Math.floor(rand() * 3),
          color,
        });
        cursor += length;
      }
    }
    sides.push(stones);
  }

  const stoneCount = sides.reduce((n, s) => n + s.length, 0);
  const vertexCount = stoneCount * ICO_FACES.length;
  const positions = new Float32Array(vertexCount * 3);
  const colors = new Float32Array(vertexCount * 3);
  const corner = new Float32Array(ICO_VERTICES.length * 3);
  let v = 0;

  sides.forEach((stones, side) => {
    // Side rotation about +Y by side * 90°: (x, z) -> (x c + z s, -x s + z c).
    const sideCos = Math.round(Math.cos((side * Math.PI) / 2));
    const sideSin = Math.round(Math.sin((side * Math.PI) / 2));
    for (const stone of stones) {
      const yawCos = Math.cos(stone.yawRad);
      const yawSin = Math.sin(stone.yawRad);
      const tiltCos = Math.cos(stone.tiltRad);
      const tiltSin = Math.sin(stone.tiltRad);
      // A cyclic axis swap per stone turns the blob a different way
      // so neighbours don't repeat the same lozenge silhouette.
      const axisShift = stone.axisShift;
      // Jitter each of the 12 corners once so shared edges stay closed.
      ICO_VERTICES.forEach((ico, i) => {
        const ix = ico[axisShift % 3] ?? 0;
        const iy = ico[(axisShift + 1) % 3] ?? 0;
        const iz = ico[(axisShift + 2) % 3] ?? 0;
        // Stretch to the stone's half-extents with per-corner jitter.
        let x = ix * stone.halfLength * (1 + range(-1, 1) * SHAPE_JITTER);
        let y = iy * stone.halfHeight * (1 + range(-1, 1) * SHAPE_JITTER);
        const z = iz * stone.halfDepth * (1 + range(-1, 1) * SHAPE_JITTER);
        // Tilt about the across axis (Z), then yaw about Y.
        const tx = x * tiltCos - y * tiltSin;
        y = x * tiltSin + y * tiltCos;
        x = tx;
        const lx = x * yawCos + z * yawSin + stone.along;
        const lz = -x * yawSin + z * yawCos + stone.across;
        corner[i * 3] = lx * sideCos + lz * sideSin;
        corner[i * 3 + 1] = y + stone.y;
        corner[i * 3 + 2] = -lx * sideSin + lz * sideCos;
      });
      for (let f = 0; f < ICO_FACES.length; f += 3) {
        // Slight per-face shade variation for a chiselled look.
        const shade = range(0.92, 1.06);
        for (let k = 0; k < 3; k++) {
          const ci = ICO_FACES[f + k] ?? 0;
          positions[v * 3] = corner[ci * 3] ?? 0;
          positions[v * 3 + 1] = corner[ci * 3 + 1] ?? 0;
          positions[v * 3 + 2] = corner[ci * 3 + 2] ?? 0;
          colors[v * 3] = stone.color.r * shade;
          colors[v * 3 + 1] = stone.color.g * shade;
          colors[v * 3 + 2] = stone.color.b * shade;
          v++;
        }
      }
    }
  });

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  geometry.setAttribute('color', new BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();

  const mesh = new Mesh(geometry, stoneMaterial);
  mesh.name = 'StoneWall';
  return mesh;
}

export default buildStoneWall();
