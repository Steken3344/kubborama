import { createSystem, UIKitMLAsset } from '@iwsdk/core';
import { gameEvents } from '../core/events.js';
import { i18nState } from '../i18nState.js';
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
  private unsubscribeLanguageChanged?: () => void;

  init(): void {
    const statsSystem = this.world.getSystem(StatsSystem);
    if (!statsSystem) {
      throw new Error('HudSystem requires StatsSystem to be registered first');
    }
    this.statsSystem = statsSystem;
    this.hudPanel = this.world.requireSceneObject<UIKitMLAsset>('hud-panel');

    this.refreshLabels();
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
    this.unsubscribeLanguageChanged = gameEvents.on('LanguageChanged', () => {
      this.refreshLabels();
    });
  }

  destroy(): void {
    this.unsubscribeRoundEnded?.();
    this.unsubscribeLanguageChanged?.();
  }

  private refreshLabels(): void {
    const t = i18nState.t;
    this.hudPanel
      .requireElementById('round-label')
      .setProperties({ text: t('hudRoundLabel') });
    this.hudPanel
      .requireElementById('felled-label')
      .setProperties({ text: t('hudFelledLabel') });
    this.hudPanel
      .requireElementById('best-label')
      .setProperties({ text: t('hudBestLabel') });
  }

  private updateBestFelled(): void {
    this.hudPanel.requireElementById('best-felled').setProperties({
      text: `${this.statsSystem.stats.personalBests.mostFelledInRound}/11`,
    });
  }
}
