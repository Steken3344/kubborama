import { ConeGeometry, BoxGeometry, Group, Mesh } from '@iwsdk/core';
import { pieces } from '../config.js';
import { accentRedMaterial, kingWoodMaterial } from './materials.js';

const { widthM, heightM, depthM } = pieces.king;
const crownHeightM = heightM * 0.12;

const king = new Group();
king.name = 'King';
king.position.y = -pieces.visualSinkM;

const body = new Mesh(
  new BoxGeometry(widthM, heightM, depthM),
  kingWoodMaterial,
);
king.add(body);

// Simple 4-sided crown cap (docs/PLAN.md §2), painted red.
const crown = new Mesh(
  new ConeGeometry(Math.max(widthM, depthM) * 0.55, crownHeightM, 4),
  accentRedMaterial,
);
crown.position.y = heightM / 2 + crownHeightM / 2;
crown.rotation.y = Math.PI / 4;
king.add(crown);

export default king;
