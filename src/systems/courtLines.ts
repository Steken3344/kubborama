import { createSystem, Visibility } from '@iwsdk/core';
import { CourtLine } from '../components/court-line.js';
import { settingsState } from '../settingsState.js';

/**
 * Court boundary lines are off by default (real kubb courts have none
 * — docs/PLAN.md §2) and toggled from the settings panel. Only writes
 * when the setting actually differs from what's currently applied —
 * a boolean write is cheap, but there's no reason to touch every
 * line entity every frame when the value hasn't changed.
 */
export class CourtLinesSystem extends createSystem({
  lines: { required: [CourtLine, Visibility] },
}) {
  // Starts false to match the scene JSON's authored Visibility.isVisible
  // (also false) — the line nodes are already hidden at load, so this
  // only needs to act on an actual change from here.
  private appliedVisible = false;

  update(): void {
    const visible = settingsState.current.courtLinesVisible;
    if (visible === this.appliedVisible) {
      return;
    }
    this.appliedVisible = visible;
    for (const entity of this.queries.lines.entities) {
      entity.setValue(Visibility, 'isVisible', visible);
    }
  }
}
