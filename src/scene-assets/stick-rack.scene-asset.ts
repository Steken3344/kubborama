import { BoxGeometry, CylinderGeometry, Group, Mesh } from '@iwsdk/core';
import { stickRack } from '../config.js';
import { woodMaterial } from './materials.js';

const PLANK_WIDTH_M = 0.5;
const PLANK_DEPTH_M = 0.4;
const PLANK_THICKNESS_M = 0.03;
const LEG_RADIUS_M = 0.02;
/** Distance from the rack's local center to each leg, along X —
 * placed near the plank's ends for realistic support, which also
 * happens to sit right under the outermost stick slots. */
const LEG_INSET_M = 0.2;

const legHeightM = stickRack.plankTopM - PLANK_THICKNESS_M / 2;

// Erik's feedback, 2026-08-30: sticks used to scatter on the ground
// and bending down for each one got tiring — this holds them at
// comfortable reach height instead (see core/court-layout.ts's
// computeStickRackPositions). Local origin is ground level at the
// rack's horizontal center, matching stake/king's own
// "Group positioned by the scene node transform" convention.
const rack = new Group();
rack.name = 'Pinnstall';

const plank = new Mesh(
  new BoxGeometry(PLANK_WIDTH_M, PLANK_THICKNESS_M, PLANK_DEPTH_M),
  woodMaterial,
);
plank.position.y = stickRack.plankTopM - PLANK_THICKNESS_M / 2;
rack.add(plank);

for (const xSign of [-1, 1] as const) {
  const leg = new Mesh(
    new CylinderGeometry(LEG_RADIUS_M, LEG_RADIUS_M, legHeightM, 8),
    woodMaterial,
  );
  leg.position.set(xSign * LEG_INSET_M, legHeightM / 2, 0);
  rack.add(leg);
}

export default rack;
