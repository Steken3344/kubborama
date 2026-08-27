import { BoxGeometry, Mesh } from '@iwsdk/core';
import { pieces } from '../config.js';
import { woodMaterial } from './materials.js';

const { widthM, heightM, depthM } = pieces.kubb;

const kubb = new Mesh(new BoxGeometry(widthM, heightM, depthM), woodMaterial);
kubb.name = 'Kubb';
// Sit visually a couple mm into the grass (docs/PLAN.md §2b); the
// collider in scene JSON uses the true, unshifted height.
kubb.position.y = -pieces.visualSinkM;

export default kubb;
