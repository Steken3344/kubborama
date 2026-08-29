import { BoxGeometry, Mesh } from '@iwsdk/core';
import { courtPresets, defaultCourtPreset, pieces } from '../config.js';
import { courtLineMaterial } from './materials.js';

// Baseline — spans the court's width (X axis in world space, but the
// node is authored along local Z like its long-side sibling and
// rotated 90° in the scene JSON, matching the stick asset's
// "geometry stays canonical, orientation is a node transform"
// convention). Sized for the default preset at load; CourtLayoutSystem
// swaps this geometry (never disposing the shared original — see
// .claude/rules/assets-and-manifest.md) when the game mode changes.
const { widthM } = courtPresets[defaultCourtPreset];
const { thicknessM, heightM } = pieces.courtLine;
const courtLineShort = new Mesh(
  new BoxGeometry(thicknessM, heightM, widthM),
  courtLineMaterial,
);
courtLineShort.name = 'CourtLineShort';

export default courtLineShort;
