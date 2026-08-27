import { createSystem, UIKitMLAsset } from '@iwsdk/core';
import { gameEvents } from '../core/events.js';
import { StatsSystem } from './stats.js';

/**
 * Updates the always-visible scoreboard panel. Purely event-driven —
 * text only changes when a round actually ends, so there's nothing to
 * do in update(). Reads StatsSystem's personal bests directly (must be
 * registered before this system in src/index.ts so its RoundEnded
 * handler runs first and the "record" field is never one round stale).
 */
export class HudSystem extends createSystem({}) {
  private hudPanel!: UIKitMLAsset;
  private statsSystem!: StatsSystem;
  private unsubscribeRoundEnded?: () => void;

  init(): void {
    const statsSystem = this.world.getSystem(StatsSystem);
    if (!statsSystem) {
      throw new Error('HudSystem requires StatsSystem to be registered first');
    }
    this.statsSystem = statsSystem;
    this.hudPanel = this.world.requireSceneObject<UIKitMLAsset>('hud-panel');

    this.updateBestFelled();

    this.unsubscribeRoundEnded = gameEvents.on('RoundEnded', (e) => {
      const felled = e.result.kubbsFelled + (e.result.kingFelled ? 1 : 0);
      this.hudPanel
        .requireElementById('round-number')
        .setProperties({ text: String(e.result.roundNumber + 1) });
      this.hudPanel
        .requireElementById('last-round-felled')
        .setProperties({ text: `${felled}/11` });
      this.updateBestFelled();
    });
  }

  destroy(): void {
    this.unsubscribeRoundEnded?.();
  }

  private updateBestFelled(): void {
    this.hudPanel.requireElementById('best-felled').setProperties({
      text: `${this.statsSystem.stats.personalBests.mostFelledInRound}/11`,
    });
  }
}
