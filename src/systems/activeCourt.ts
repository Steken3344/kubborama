import { courtPresetForMode, getCourtPreset } from '../config.js';
import { farBaselineZ } from '../core/court-layout.js';
import { courtHalves } from '../core/inkast.js';
import type { CourtHalves } from '../core/inkast.js';
import { settingsState } from '../settingsState.js';

/** The far baseline of the court the ACTIVE game mode uses — not the
 * default preset (spec review I5: Advanced plays on the 8 m tournament
 * court; a 6 m constant would put mirrored placements inside it). Read
 * at call time, so a mode switch is picked up by the next placement. */
export function activeFarBaselineZ(): number {
  return farBaselineZ(
    getCourtPreset(courtPresetForMode(settingsState.current.gameMode)),
  );
}

/** The ACTIVE court's halves (MP4 inkast legality, advantage line). */
export function activeCourtHalves(): CourtHalves {
  return courtHalves(
    getCourtPreset(courtPresetForMode(settingsState.current.gameMode)),
  );
}
