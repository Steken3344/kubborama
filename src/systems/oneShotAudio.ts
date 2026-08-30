import { AudioUtils, createSystem } from '@iwsdk/core';
import { OneShotAudio } from '../components/one-shot-audio.js';

/** Real one-shot clips are ~1s at most; this only ever engages for a
 * clip that will NEVER start (autoplay blocked pending a user
 * gesture, a 404, a decode failure) — generous on purpose so it never
 * cuts off a genuinely slow-loading real clip. */
const MAX_LIFETIME_S = 5;

/**
 * Disposes every one-shot sound entity (impact/felled/foley/UI-click,
 * see playSfx.ts) once its clip finishes. AudioSystem's own instance
 * pool only returns the Audio/PositionalAudio object to its per-entity
 * pool on `onended` — it never removes the entity itself, so without
 * this every sound effect this game plays would leak an entity
 * forever. Tracks which entities have actually started playing so a
 * still-loading clip (isPlaying false before it starts, same as after
 * it ends) is never disposed early.
 *
 * Also tracks how long an entity has gone WITHOUT ever starting to
 * play: a clip that never starts (autoplay blocked until a user
 * gesture resolves, a load 404, a decode failure) would otherwise
 * never satisfy the "was playing, now isn't" disposal condition and
 * leak forever — the exact bug class this system exists to prevent,
 * just from the opposite direction (M5 adversarial review gate,
 * docs/DECISIONS.md). MAX_LIFETIME_S force-disposes it anyway once
 * that's clearly not going to happen.
 */
export class OneShotAudioSystem extends createSystem({
  oneShots: { required: [OneShotAudio] },
}) {
  private startedPlaying = new Set<number>();
  private firstSeenTimeS = new Map<number, number>();

  update(_delta: number, timeS: number): void {
    for (const entity of this.queries.oneShots.entities) {
      if (AudioUtils.isPlaying(entity)) {
        this.startedPlaying.add(entity.index);
        this.firstSeenTimeS.delete(entity.index);
        continue;
      }
      if (this.startedPlaying.delete(entity.index)) {
        entity.dispose();
        continue;
      }
      const firstSeen = this.firstSeenTimeS.get(entity.index);
      if (firstSeen === undefined) {
        this.firstSeenTimeS.set(entity.index, timeS);
      } else if (timeS - firstSeen > MAX_LIFETIME_S) {
        this.firstSeenTimeS.delete(entity.index);
        entity.dispose();
      }
    }
  }
}
