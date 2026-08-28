import { BoxGeometry, Mesh } from '@iwsdk/core';
import { courtPresets, defaultCourtPreset } from '../config.js';
import { courtLineMaterial } from './materials.js';

const LINE_THICKNESS_M = 0.05;
const LINE_HEIGHT_M = 0.005;

// Baseline — spans the court's width (X axis in world space, but the
// node is authored along local Z like its long-side sibling and
// rotated 90° in the scene JSON, matching the stick asset's
// "geometry stays canonical, orientation is a node transform"
// convention).
const { widthM } = courtPresets[defaultCourtPreset];
const courtLineShort = new Mesh(
  new BoxGeometry(LINE_THICKNESS_M, LINE_HEIGHT_M, widthM),
  courtLineMaterial,
);
courtLineShort.name = 'CourtLineShort';

export default courtLineShort;
