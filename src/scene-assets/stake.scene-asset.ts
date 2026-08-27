import { CylinderGeometry, Group, Mesh } from '@iwsdk/core';
import { pieces } from '../config.js';
import { accentRedMaterial, woodMaterial } from './materials.js';

const { radiusM, heightM } = pieces.stake;
const tipHeightM = heightM * 0.12;
// Corner stakes are driven into the ground, not resting on top of it.
const embedM = 0.02;

const stake = new Group();
stake.name = 'Hompinne';
stake.position.y = -embedM;

const body = new Mesh(
  new CylinderGeometry(radiusM, radiusM, heightM, 8),
  woodMaterial,
);
stake.add(body);

// Authentic red-topped detail seen in reference photos.
const tip = new Mesh(
  new CylinderGeometry(radiusM * 1.05, radiusM * 1.05, tipHeightM, 8),
  accentRedMaterial,
);
tip.position.y = heightM / 2 - tipHeightM / 2;
stake.add(tip);

export default stake;
