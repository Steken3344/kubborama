import { Pane } from 'tweakpane';
import { activePreset, tuningParams } from '../core/tuning.js';
import type { PresetId, TuningParamId } from '../core/tuning.js';
import type { TuningLabSystem } from '../systems/tuningLab.js';
import { presetBank } from '../tuningState.js';

const PARAM_IDS = Object.keys(tuningParams) as TuningParamId[];

/**
 * Desktop-only tuning panel (tweakpane). In-headset controls use
 * IWSDK's spatial UI instead — this is dev tooling for the flat
 * screen, where tuning conversations actually happen (per
 * docs/PLAN.md §9d2). Not gated behind a toggle yet (M2 scope); safe
 * to leave visible since it never blocks the player-facing experience.
 */
export function createTuningPanel(tuningLab: TuningLabSystem): void {
  const pane = new Pane({ title: 'Throw Tuning Lab' });

  const presetState = { preset: presetBank.activePresetId as string };
  pane
    .addBinding(presetState, 'preset', {
      label: 'Preset',
      options: { A: 'A', B: 'B', C: 'C' },
    })
    .on('change', (ev) => {
      tuningLab.switchPreset(ev.value as PresetId);
      refreshParamValues();
    });

  const paramsFolder = pane.addFolder({ title: 'Feel parameters (0-100)' });
  const paramState: Record<TuningParamId, number> = {} as Record<
    TuningParamId,
    number
  >;
  for (const id of PARAM_IDS) {
    paramState[id] = activePreset(presetBank)[id];
  }

  function refreshParamValues(): void {
    const preset = activePreset(presetBank);
    for (const id of PARAM_IDS) {
      paramState[id] = preset[id];
    }
    pane.refresh();
  }

  for (const id of PARAM_IDS) {
    const spec = tuningParams[id];
    paramsFolder
      .addBinding(paramState, id, {
        label: `${spec.label}${spec.unit ? ` (${spec.unit})` : ''}`,
        min: 0,
        max: 100,
        step: 1,
      })
      .on('change', (ev) => {
        tuningLab.setParam(id, ev.value);
      });
  }

  const metersFolder = pane.addFolder({ title: 'Last throw' });
  const meterState = {
    releaseSpeedMps: 0,
    spinRadS: 0,
    flightTimeS: 0,
    distanceM: 0,
    style: '—',
    flipQualityScore: 0,
  };
  metersFolder.addBinding(meterState, 'releaseSpeedMps', {
    readonly: true,
    label: 'Speed (m/s)',
  });
  metersFolder.addBinding(meterState, 'spinRadS', {
    readonly: true,
    label: 'Spin (rad/s)',
  });
  metersFolder.addBinding(meterState, 'flightTimeS', {
    readonly: true,
    label: 'Flight time (s)',
  });
  metersFolder.addBinding(meterState, 'distanceM', {
    readonly: true,
    label: 'Distance (m)',
  });
  metersFolder.addBinding(meterState, 'style', {
    readonly: true,
    label: 'Style',
  });
  metersFolder.addBinding(meterState, 'flipQualityScore', {
    readonly: true,
    label: 'Flip quality',
  });

  function refreshLastThrowMeters(): void {
    const last =
      tuningLab.telemetryStore.records[
        tuningLab.telemetryStore.records.length - 1
      ];
    if (!last) {
      return;
    }
    meterState.releaseSpeedMps = Math.round(last.releaseSpeedMps * 100) / 100;
    meterState.spinRadS = Math.round(last.spinRadS * 100) / 100;
    meterState.flightTimeS = Math.round(last.flightTimeS * 100) / 100;
    meterState.distanceM = Math.round(last.distanceM * 100) / 100;
    meterState.style = last.style;
    meterState.flipQualityScore = last.flipQualityScore;
    pane.refresh();
  }
  // Poll for new telemetry — simplest way to stay in sync without
  // threading a UI-refresh callback through the event bus.
  setInterval(refreshLastThrowMeters, 500);

  const actionsFolder = pane.addFolder({ title: 'Presets & telemetry' });
  actionsFolder
    .addButton({ title: 'Export preset JSON (console + clipboard)' })
    .on('click', () => {
      const json = tuningLab.exportActivePresetJSON();
      console.log('[tuning] active preset JSON:\n' + json);
      navigator.clipboard?.writeText(json).catch(() => undefined);
    });

  const importState = { json: '' };
  actionsFolder.addBinding(importState, 'json', {
    label: 'Import preset JSON',
    multiline: true,
    rows: 3,
  });
  actionsFolder
    .addButton({ title: 'Import into active preset' })
    .on('click', () => {
      const ok = tuningLab.importActivePresetJSON(importState.json);
      console.log(
        ok
          ? '[tuning] preset imported'
          : '[tuning] import failed — invalid JSON',
      );
      refreshParamValues();
    });

  actionsFolder
    .addButton({ title: 'Export telemetry JSON (console)' })
    .on('click', () => {
      console.log(
        '[tuning] telemetry JSON:\n' + tuningLab.exportTelemetryJSON(),
      );
    });

  actionsFolder.addButton({ title: 'Clear telemetry' }).on('click', () => {
    tuningLab.clearTelemetry();
  });
}
