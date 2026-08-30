import { createSystem, Vector3 } from '@iwsdk/core';
import type { Entity, Object3D } from '@iwsdk/core';
import { windIndicator, windVectorForMode } from '../config.js';
import { createRng } from '../core/rng.js';
import { settingsState } from '../settingsState.js';

/** Not the physics or stick-scatter RNG — only ever picks leaf
 * spawn/flutter parameters, never anything gameplay-visible. */
const LEAF_RNG_SEED = 5150;

interface LeafState {
  bobPhase: number;
  bobSpeedRadPerS: number;
  spinAxis: Vector3;
  spinSpeedRadPerS: number;
  baseHeightM: number;
}

/**
 * Docs/PLAN.md §13's "cheapest possible" flourish: a handful of
 * drifting leaves make the wind tunable feel real (direction +
 * strength), deferred out of M4 as optional/low-priority, picked up
 * here as the last item on Erik's "remaining polish" list. Spawn area
 * is a fixed generous box covering every court preset (not wired to
 * CourtLayoutSystem) — this is ambient dressing, not gameplay, so it
 * doesn't need to track the exact active preset.
 *
 * Visual only: reads the same windVectorForMode() WindSystem uses for
 * the real stick-drift force, scaled down for a readable ambient pace
 * (config's driftSpeedScale) — an entirely independent number, no
 * shared state with WindSystem's own per-tick PhysicsManipulation
 * force.
 */
export class WindIndicatorSystem extends createSystem({}) {
  private leaves: Entity[] = [];
  private leafStates: LeafState[] = [];
  private rng = createRng(LEAF_RNG_SEED);
  private tmpSpinAxis = new Vector3();

  async init(): Promise<void> {
    const objects = await Promise.all(
      Array.from({ length: windIndicator.leafCount }, () =>
        this.world.assets.instantiate<Object3D>('leaf'),
      ),
    );
    for (const object3D of objects) {
      const state = this.randomLeafState();
      this.placeLeaf(object3D, state, { randomizeX: true });
      this.leaves.push(this.world.createTransformEntity(object3D));
      this.leafStates.push(state);
    }
  }

  destroy(): void {
    for (const entity of this.leaves) {
      entity.dispose();
    }
    this.leaves = [];
    this.leafStates = [];
  }

  update(delta: number): void {
    const windMps =
      windVectorForMode(settingsState.current.gameMode)[0] *
      windIndicator.driftSpeedScale;
    const halfWidthM = windIndicator.areaHalfWidthM;

    for (let i = 0; i < this.leaves.length; i++) {
      const entity = this.leaves[i];
      const state = this.leafStates[i];
      const object3D = entity?.object3D;
      if (!object3D || !state) {
        continue;
      }

      object3D.position.x += windMps * delta;
      state.bobPhase += state.bobSpeedRadPerS * delta;
      object3D.position.y =
        state.baseHeightM +
        Math.sin(state.bobPhase) * windIndicator.bobAmplitudeM;
      object3D.rotateOnAxis(
        this.tmpSpinAxis.copy(state.spinAxis),
        state.spinSpeedRadPerS * delta,
      );

      if (object3D.position.x > halfWidthM) {
        this.randomizeLeafState(state);
        this.placeLeaf(object3D, state, { edgeX: -halfWidthM });
      } else if (object3D.position.x < -halfWidthM) {
        this.randomizeLeafState(state);
        this.placeLeaf(object3D, state, { edgeX: halfWidthM });
      }
    }
  }

  private randomLeafState(): LeafState {
    const state: LeafState = {
      bobPhase: 0,
      bobSpeedRadPerS: 0,
      spinAxis: new Vector3(),
      spinSpeedRadPerS: 0,
      baseHeightM: 0,
    };
    this.randomizeLeafState(state);
    return state;
  }

  /** Mutates an existing state in place (init still allocates one
   * fresh per leaf via randomLeafState(), but a recycle — a leaf
   * drifting past the spawn area's edge — reuses the same object and
   * Vector3 rather than allocating new ones each time; GC pass,
   * docs/DECISIONS.md M5 review gate). */
  private randomizeLeafState(state: LeafState): void {
    const {
      bobSpeedRadPerSMin,
      bobSpeedRadPerSMax,
      spinSpeedRadPerSMin,
      spinSpeedRadPerSMax,
      heightMinM,
      heightMaxM,
    } = windIndicator;
    state.bobPhase = this.rng() * Math.PI * 2;
    state.bobSpeedRadPerS =
      bobSpeedRadPerSMin +
      this.rng() * (bobSpeedRadPerSMax - bobSpeedRadPerSMin);
    state.spinAxis
      .set(this.rng() * 2 - 1, this.rng() * 2 - 1, this.rng() * 2 - 1)
      .normalize();
    state.spinSpeedRadPerS =
      spinSpeedRadPerSMin +
      this.rng() * (spinSpeedRadPerSMax - spinSpeedRadPerSMin);
    state.baseHeightM = heightMinM + this.rng() * (heightMaxM - heightMinM);
  }

  private placeLeaf(
    object3D: Object3D,
    state: LeafState,
    xOptions: { randomizeX?: boolean; edgeX?: number },
  ): void {
    const x = xOptions.randomizeX
      ? (this.rng() * 2 - 1) * windIndicator.areaHalfWidthM
      : (xOptions.edgeX ?? 0);
    const z =
      windIndicator.areaNearZ +
      this.rng() * (windIndicator.areaFarZ - windIndicator.areaNearZ);
    object3D.position.set(x, state.baseHeightM, z);
  }
}
