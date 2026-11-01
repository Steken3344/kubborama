import { stickRack } from '../config.js';
import { buildGardenTable } from './garden-table.js';

const PLANK_WIDTH_M = 0.5;
const PLANK_DEPTH_M = 0.4;

// Erik's feedback, 2026-08-30: sticks used to scatter on the ground and
// bending down for each one got tiring — this holds them at comfortable
// reach height (core/court-layout.ts computeStickRackPositions). Since
// 2026-11-01 a proper garden table (scene-assets/garden-table.ts) that
// also follows the thrower to the advantage line. Local origin is ground
// level at the table's centre; the top is `stickRack.plankTopM` high,
// matching the stick-rack-collider in the scene JSON.
const rack = buildGardenTable({
  name: 'Pinnstall',
  widthM: PLANK_WIDTH_M,
  depthM: PLANK_DEPTH_M,
  topM: stickRack.plankTopM,
});

export default rack;
