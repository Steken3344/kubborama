import {
  createSystem,
  PhysicsBody,
  PhysicsShape,
  PhysicsSystem,
} from '@iwsdk/core';
import { StickState } from '../components/stick-state.js';
import {
  addRecord,
  buildTelemetryRecord,
  decodeStore,
  emptyStore,
  encodeStore,
} from '../core/telemetry.js';
import type { TelemetryStore } from '../core/telemetry.js';
import { gameEvents } from '../core/events.js';
import { log } from '../core/log.js';
import {
  activePreset,
  decodePreset,
  encodePreset,
  percentToReal,
  tuningParams,
} from '../core/tuning.js';
import type { PresetId, TuningParamId } from '../core/tuning.js';
import { length, sub } from '../core/vec3.js';
import type { Vec3 } from '../core/vec3.js';
import { presetBank } from '../tuningState.js';
import { createTuningPanel } from '../ui/tuningPanel.js';

const TELEMETRY_STORAGE_KEY = 'kubborama.telemetry.v1';

interface PendingThrow {
  releaseTimeS: number;
  releasePosition: Vec3;
  releaseSpeedMps: number;
  spinRadS: number;
  style: 'underhand' | 'overhand' | 'helicopter';
  flipQualityScore: number;
  presetId: PresetId;
}

function loadTelemetry(): TelemetryStore {
  try {
    const raw = localStorage.getItem(TELEMETRY_STORAGE_KEY);
    return raw ? decodeStore(raw) : emptyStore();
  } catch {
    return emptyStore();
  }
}

function saveTelemetry(store: TelemetryStore): void {
  try {
    localStorage.setItem(TELEMETRY_STORAGE_KEY, encodeStore(store));
  } catch {
    // localStorage unavailable (private mode, quota) — telemetry stays
    // in-memory only for this session.
  }
}

/**
 * Applies the live tuning preset to physics (gravity, stick material,
 * angular damping), records per-throw telemetry (Thrown + Settled ->
 * one record, persisted to localStorage), and exposes the methods the
 * desktop tweakpane panel calls. Dev tooling — never gates the player
 * experience.
 */
export class TuningLabSystem extends createSystem({
  sticks: { required: [StickState] },
}) {
  telemetryStore: TelemetryStore = emptyStore();
  private pendingThrows = new Map<string, PendingThrow>();
  private physicsSystem!: PhysicsSystem;
  private unsubscribeThrown?: () => void;
  private unsubscribeSettled?: () => void;

  init(): void {
    const physicsSystem = this.world.getSystem(PhysicsSystem);
    if (!physicsSystem) {
      throw new Error(
        'TuningLabSystem requires PhysicsSystem — enable the "physics" world feature in iwsdk.config.json',
      );
    }
    this.physicsSystem = physicsSystem;
    this.telemetryStore = loadTelemetry();

    this.unsubscribeThrown = gameEvents.on('Thrown', (e) => {
      this.pendingThrows.set(e.stickId, {
        releaseTimeS: e.timeS,
        releasePosition: e.releasePosition,
        releaseSpeedMps: e.releaseSpeedMps,
        spinRadS: length(e.angularVelocity),
        style: e.style,
        flipQualityScore: e.flipQualityScore,
        presetId: e.presetId,
      });
    });
    this.unsubscribeSettled = gameEvents.on('Settled', (e) => {
      const pending = this.pendingThrows.get(e.stickId);
      if (!pending) {
        return;
      }
      const flightTimeS = e.timeS - pending.releaseTimeS;
      const delta = sub(e.position, pending.releasePosition);
      const distanceM = Math.hypot(delta[0], delta[2]);
      const record = buildTelemetryRecord({
        timeS: pending.releaseTimeS,
        presetId: pending.presetId,
        releaseSpeedMps: pending.releaseSpeedMps,
        spinRadS: pending.spinRadS,
        flightTimeS,
        distanceM,
        style: pending.style,
        flipQualityScore: pending.flipQualityScore,
      });
      this.telemetryStore = addRecord(this.telemetryStore, record);
      saveTelemetry(this.telemetryStore);
      log('info', 'throw', 'telemetry recorded', record);
      this.pendingThrows.delete(e.stickId);
    });

    this.applyTuningToPhysics();
    createTuningPanel(this);
  }

  destroy(): void {
    this.unsubscribeThrown?.();
    this.unsubscribeSettled?.();
  }

  setParam(id: TuningParamId, percent: number): void {
    activePreset(presetBank)[id] = Math.min(100, Math.max(0, percent));
    this.applyTuningToPhysics();
  }

  switchPreset(id: PresetId): void {
    presetBank.activePresetId = id;
    this.applyTuningToPhysics();
  }

  exportActivePresetJSON(): string {
    return encodePreset(activePreset(presetBank));
  }

  /** Returns false (and leaves the preset untouched) on invalid JSON. */
  importActivePresetJSON(json: string): boolean {
    const decoded = decodePreset(json);
    if (!decoded) {
      return false;
    }
    presetBank.presets[presetBank.activePresetId] = decoded;
    this.applyTuningToPhysics();
    return true;
  }

  exportTelemetryJSON(): string {
    return encodeStore(this.telemetryStore);
  }

  clearTelemetry(): void {
    this.telemetryStore = emptyStore();
    saveTelemetry(this.telemetryStore);
  }

  private applyTuningToPhysics(): void {
    const preset = activePreset(presetBank);
    const gravityMps2 = percentToReal(
      tuningParams.gravityMps2,
      preset.gravityMps2,
    );
    this.physicsSystem.config.gravity.value = [0, -gravityMps2, 0];

    const density = percentToReal(
      tuningParams.stickMassDensityKgM3,
      preset.stickMassDensityKgM3,
    );
    const friction = percentToReal(tuningParams.friction, preset.friction);
    const restitution = percentToReal(
      tuningParams.restitution,
      preset.restitution,
    );
    const angularDamping = percentToReal(
      tuningParams.angularDampingInFlight,
      preset.angularDampingInFlight,
    );

    for (const entity of this.queries.sticks.entities) {
      entity.setValue(PhysicsShape, 'density', density);
      entity.setValue(PhysicsShape, 'friction', friction);
      entity.setValue(PhysicsShape, 'restitution', restitution);
      entity.setValue(PhysicsBody, 'angularDamping', angularDamping);
    }
  }
}
