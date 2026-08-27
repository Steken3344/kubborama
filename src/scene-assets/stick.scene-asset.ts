import { CylinderGeometry, Mesh } from '@iwsdk/core';
import { pieces } from '../config.js';
import { woodMaterial } from './materials.js';

const { radiusM, lengthM } = pieces.stick;

// Bake "lying flat" into the geometry (long axis along local X) so a
// scene node's rotationDeg.y alone controls which way it points on the
// ground — no combined-rotation math needed at placement time.
const geometry = new CylinderGeometry(radiusM, radiusM, lengthM, 12);
geometry.rotateZ(Math.PI / 2);

const stick = new Mesh(geometry, woodMaterial);
stick.name = 'Kastpinne';
stick.position.y = -pieces.visualSinkM;

export default stick;
