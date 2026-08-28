import { AudioUtils } from '@iwsdk/core';
import type { World } from '@iwsdk/core';
import { pickVariantIndex } from '../core/audio.js';
import { SFX_CATEGORY } from './sfxLibrary.js';
import type { SfxCategoryName } from './sfxLibrary.js';

/**
 * Plays one variant from an SFX category as a one-shot, auto-removing
 * audio entity (AudioUtils.createOneShot, built into IWSDK). Shared by
 * every system that triggers a sound — see docs/DECISIONS.md (M5) for
 * why this isn't routed through a dedicated SfxSystem for grab/release
 * foley specifically (mirrors ThrowingSystem's existing direct-call
 * haptics pattern rather than adding an event-bus round trip).
 *
 * Always non-positional: createOneShot's entity has no Object3D, and
 * reading IWSDK's AudioSystem source shows positional audio needs one
 * (a Three.js PositionalAudio anchored in the scene graph) — passing a
 * position through createOneShot is a no-op in the installed version,
 * not a supported path. Every sound plays from the listener instead.
 */
export function playSfxVariant(
  world: World,
  category: SfxCategoryName,
  rng: () => number,
  volume: number,
): void {
  const variants = SFX_CATEGORY[category];
  const index = pickVariantIndex(rng, variants.length);
  const src = variants[index];
  if (!src) {
    return;
  }
  AudioUtils.createOneShot(world, src, { volume, positional: false });
}
