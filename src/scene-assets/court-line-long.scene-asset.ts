import { BoxGeometry, Mesh } from '@iwsdk/core';
import { courtPresets, defaultCourtPreset, pieces } from '../config.js';
import { courtLineMaterial } from './materials.js';

// Sideline — spans the court's length (Z axis). Sized for the default
// preset at load; CourtLayoutSystem swaps this geometry (never
// disposing the shared original — see
// .claude/rules/assets-and-manifest.md) when the game mode changes.
const { lengthM } = courtPresets[defaultCourtPreset];
const { thicknessM, heightM } = pieces.courtLine;
const courtLineLong = new Mesh(
  new BoxGeometry(thicknessM, heightM, lengthM),
  courtLineMaterial,
);
courtLineLong.name = 'CourtLineLong';

export default courtLineLong;
