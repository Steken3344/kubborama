import { AudioSource } from '@iwsdk/core';
import type { World } from '@iwsdk/core';
import { OneShotAudio } from '../components/one-shot-audio.js';
import { audio } from '../config.js';
import { pickVariantIndex } from '../core/audio.js';
import type { Vec3 } from '../core/vec3.js';
import { SFX_CATEGORY } from './sfxLibrary.js';
import type { SfxCategoryName } from './sfxLibrary.js';

/**
 * Plays one variant from an SFX category as a one-shot audio entity —
 * positional (anchored at `position` in the world, spatially
 * attenuated) when a position is given, otherwise from the listener
 * like a UI click or the throw foley whoosh. Shared by every system
 * that triggers a sound — see docs/DECISIONS.md (M5) for why this
 * isn't routed through a dedicated SfxSystem for grab/release foley
 * specifically (mirrors ThrowingSystem's existing direct-call haptics
 * pattern rather than adding an event-bus round trip).
 *
 * Does NOT use `AudioUtils.createOneShot`: its entity has no Object3D,
 * and IWSDK's AudioSystem anchors PositionalAudio to `entity.object3D`
 * when present (its own doc comment: "For positional audio, attach the
 * component to an entity with a valid Object3D") — createOneShot's
 * bare entity falls back to the scene root, so position is silently a
 * no-op there. Tags the entity `OneShotAudio` so `OneShotAudioSystem`
 * disposes it once the clip finishes — AudioSystem's own instance pool
 * only returns the Audio/PositionalAudio object to its pool on
 * `onended`, it never removes the entity itself.
 */
export function playSfxVariant(
  world: World,
  category: SfxCategoryName,
  rng: () => number,
  volume: number,
  position?: Vec3,
): void {
  const variants = SFX_CATEGORY[category];
  const index = pickVariantIndex(rng, variants.length);
  const src = variants[index];
  if (!src) {
    return;
  }
  const entity = position
    ? world.createTransformEntity()
    : world.createEntity();
  if (position && entity.object3D) {
    entity.object3D.position.set(position[0], position[1], position[2]);
  }
  entity.addComponent(AudioSource, {
    src,
    volume,
    positional: !!position,
    refDistance: audio.positional.refDistanceM,
    rolloffFactor: audio.positional.rolloffFactor,
    maxDistance: audio.positional.maxDistanceM,
    autoplay: true,
    loop: false,
  });
  entity.addComponent(OneShotAudio);
}
