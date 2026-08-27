import { createPresetBank } from './core/tuning.js';

/**
 * The one live tuning-lab instance — shared between ThrowingSystem
 * (reads velocity/spin multipliers + smoothing window every release)
 * and TuningLabSystem (owns the UI, applies changes to live physics,
 * records telemetry). A plain singleton, same pattern as
 * core/events.ts's gameEvents.
 */
export const presetBank = createPresetBank();
