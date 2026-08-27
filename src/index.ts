import { World } from '@iwsdk/core';
import projectOptions from 'virtual:iwsdk-project';
import { ImpactSystem } from './systems/impact.js';
import { ThrowingSystem } from './systems/throwing.js';

const world = await World.create(
  document.getElementById('scene-container') as HTMLDivElement,
  projectOptions,
);

// Default priority (0) runs after GrabSystem (-3) and PhysicsSystem
// (-2), so both systems read up-to-date grab state and post-physics
// velocities each frame.
world.registerSystem(ThrowingSystem);
world.registerSystem(ImpactSystem);
