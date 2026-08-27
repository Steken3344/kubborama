import { World } from '@iwsdk/core';
import projectOptions from 'virtual:iwsdk-project';
import { GrabHighlightSystem } from './systems/grabHighlight.js';
import { ImpactSystem } from './systems/impact.js';
import { MenuSystem } from './systems/menu.js';
import { ThrowingSystem } from './systems/throwing.js';
import { TuningLabSystem } from './systems/tuningLab.js';

// NOT `await World.create(...)` at module top level — that breaks the
// production build (Rollup's entry-chunk bundling hangs forever on it;
// dev mode tolerates it fine). See docs/DECISIONS.md, 2026-08-27.
World.create(
  document.getElementById('scene-container') as HTMLDivElement,
  projectOptions,
).then((world) => {
  // Default priority (0) runs after GrabSystem (-3) and PhysicsSystem
  // (-2), so both systems read up-to-date grab state and post-physics
  // velocities each frame.
  world.registerSystem(ThrowingSystem);
  world.registerSystem(ImpactSystem);
  world.registerSystem(MenuSystem);
  world.registerSystem(GrabHighlightSystem);
  // Reads gameEvents emitted by ThrowingSystem/ImpactSystem — order
  // doesn't matter for correctness (subscriptions, not query timing),
  // but registering last keeps init order readable.
  world.registerSystem(TuningLabSystem);
});
