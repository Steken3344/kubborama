import { kubbTable } from '../config.js';
import { buildGardenTable } from './garden-table.js';

/**
 * The table the felled kubbs wait on for the inkast (Erik, 2026-11-01:
 * "fällda kubbar bör också spawna på ett bord") — up to ten upright kubbs
 * in one or two rows (core/inkast.ts inkastRackPosition). Mirrored to the
 * far baseline like the stick rack (core/court-layout.ts
 * FAR_RACK_NODE_IDS).
 */
export default buildGardenTable({
  name: 'Kubbbord',
  widthM: kubbTable.widthM,
  depthM: kubbTable.depthM,
  topM: kubbTable.topM,
  pennant: true,
});
