import { World } from '@iwsdk/core';
import projectOptions from 'virtual:iwsdk-project';

// M1: scene + physics only, no gameplay systems registered yet.
await World.create(
  document.getElementById('scene-container') as HTMLDivElement,
  projectOptions,
);
