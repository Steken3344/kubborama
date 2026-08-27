import { Mesh, PlaneGeometry } from '@iwsdk/core';
import { grassMaterial } from './materials.js';

const SIZE_M = 30;

const geometry = new PlaneGeometry(SIZE_M, SIZE_M);
geometry.rotateX(-Math.PI / 2);

const ground = new Mesh(geometry, grassMaterial);
ground.name = 'Ground';

export default ground;
