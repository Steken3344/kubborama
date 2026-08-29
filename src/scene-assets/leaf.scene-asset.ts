import { Mesh, Shape, ShapeGeometry } from '@iwsdk/core';
import { leafMaterial } from './materials.js';

const LEAF_LENGTH_M = 0.08;
const LEAF_WIDTH_M = 0.045;

/** Simple pointed-oval silhouette — a background wind-indicator
 * particle, not a hero asset, so a two-curve outline is plenty. */
function buildLeafShape(): Shape {
  const halfLength = LEAF_LENGTH_M / 2;
  const halfWidth = LEAF_WIDTH_M / 2;
  const shape = new Shape();
  shape.moveTo(0, -halfLength);
  shape.quadraticCurveTo(halfWidth, 0, 0, halfLength);
  shape.quadraticCurveTo(-halfWidth, 0, 0, -halfLength);
  return shape;
}

const leaf = new Mesh(new ShapeGeometry(buildLeafShape()), leafMaterial);
leaf.name = 'Leaf';

export default leaf;
