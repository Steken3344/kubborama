import { BoxGeometry, Mesh } from '@iwsdk/core';
import { courtPresets, defaultCourtPreset } from '../config.js';
import { courtLineMaterial } from './materials.js';

const LINE_THICKNESS_M = 0.05;
const LINE_HEIGHT_M = 0.005;

// Sideline — spans the court's length (Z axis). Sized for the default
// preset only, matching the rest of the scene's static geometry (the
// court doesn't yet resize with game mode — see docs/DECISIONS.md).
const { lengthM } = courtPresets[defaultCourtPreset];
const courtLineLong = new Mesh(
  new BoxGeometry(LINE_THICKNESS_M, LINE_HEIGHT_M, lengthM),
  courtLineMaterial,
);
courtLineLong.name = 'CourtLineLong';

export default courtLineLong;
