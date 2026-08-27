import { CylinderGeometry, Mesh } from '@iwsdk/core';
import { pieces } from '../config.js';
import { woodMaterial } from './materials.js';

const { radiusM, lengthM } = pieces.stick;

// Canonical upright cylinder (height along local Y) — deliberately NOT
// pre-rotated. PhysicsShapeType.Cylinder always assumes height-along-Y
// too, so "lying flat" must be a node-transform rotation (applied to
// both the mesh and the collider together), never baked into the
// geometry alone — that desyncs the visual mesh from its collider.
const geometry = new CylinderGeometry(radiusM, radiusM, lengthM, 12);

const stick = new Mesh(geometry, woodMaterial);
stick.name = 'Kastpinne';
// No visual-sink offset here: the node applies a 90° tip (see scene
// JSON) so a mesh-local Y offset would rotate into a horizontal
// direction instead of sinking it — not worth the complexity for a
// lying-flat piece with a horizontal contact footprint.

export default stick;
