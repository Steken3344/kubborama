import { AudioUtils, createSystem } from '@iwsdk/core';
import { OneShotAudio } from '../components/one-shot-audio.js';

/**
 * Disposes every one-shot sound entity (impact/felled/foley/UI-click,
 * see playSfx.ts) once its clip finishes. AudioSystem's own instance
 * pool only returns the Audio/PositionalAudio object to its per-entity
 * pool on `onended` — it never removes the entity itself, so without
 * this every sound effect this game plays would leak an entity
 * forever. Tracks which entities have actually started playing so a
 * still-loading clip (isPlaying false before it starts, same as after
 * it ends) is never disposed early.
 */
export class OneShotAudioSystem extends createSystem({
  oneShots: { required: [OneShotAudio] },
}) {
  private startedPlaying = new Set<number>();

  update(): void {
    for (const entity of this.queries.oneShots.entities) {
      if (AudioUtils.isPlaying(entity)) {
        this.startedPlaying.add(entity.index);
      } else if (this.startedPlaying.delete(entity.index)) {
        entity.dispose();
      }
    }
  }
}
