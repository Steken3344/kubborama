import { createSystem, UIKitMLAsset } from '@iwsdk/core';
import type { GameEvents } from '../core/events.js';
import type { ThrowStyle } from '../core/underhandClassifier.js';
import { gameEvents } from '../core/events.js';
import { isFinished, score } from '../core/match.js';
import { i18nState } from '../i18nState.js';
import { StatsSystem } from './stats.js';

/**
 * Updates the always-visible scoreboard panel. Purely event-driven —
 * text only changes when a round ends or a throw is released, so
 * there's nothing to do in update(). Reads StatsSystem's personal
 * bests directly (must be registered before this system in
 * src/index.ts so its RoundEnded handler runs first and the "record"
 * field is never one round stale).
 */
export class HudSystem extends createSystem({}) {
  private hudPanel!: UIKitMLAsset;
  private statsSystem!: StatsSystem;
  private lastThrowStyle: ThrowStyle | null = null;
  private lastMatchState: GameEvents['MatchStateChanged'] | null = null;
  private unsubscribeRoundEnded?: () => void;
  private unsubscribeThrown?: () => void;
  private unsubscribeLanguageChanged?: () => void;
  private unsubscribeMatchStateChanged?: () => void;
  private unsubscribeMultiplayerPeerDisconnected?: () => void;

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
    this.unsubscribeThrown = gameEvents.on('Thrown', (e) => {
      this.lastThrowStyle = e.style;
      this.updateThrowStyle();
    });
    this.unsubscribeLanguageChanged = gameEvents.on('LanguageChanged', () => {
      this.refreshLabels();
    });
    this.unsubscribeMatchStateChanged = gameEvents.on(
      'MatchStateChanged',
      (e) => {
        this.lastMatchState = e;
        this.updateMatchRow();
      },
    );
    // gh#10 (code review, 2026-09-02): without this, match-row/role-row
    // stayed visible with stale text once the opponent disconnected —
    // MatchStateChanged alone never fires again to hide them.
    this.unsubscribeMultiplayerPeerDisconnected = gameEvents.on(
      'MultiplayerPeerDisconnected',
      () => {
        this.lastMatchState = null;
        this.hidePeerRows();
      },
    );
  }

  destroy(): void {
    this.unsubscribeRoundEnded?.();
    this.unsubscribeThrown?.();
    this.unsubscribeLanguageChanged?.();
    this.unsubscribeMatchStateChanged?.();
    this.unsubscribeMultiplayerPeerDisconnected?.();
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
    this.hudPanel
      .requireElementById('style-label')
      .setProperties({ text: t('hudStyleLabel') });
    this.hudPanel
      .requireElementById('match-label')
      .setProperties({ text: t('matchLabel') });
    this.hudPanel
      .requireElementById('role-label')
      .setProperties({ text: t('roleLabel') });
    this.hudPanel
      .requireElementById('turn-label')
      .setProperties({ text: t('matchTurnLabel') });
    this.updateThrowStyle();
    this.updateMatchRow();
  }

  /** Hidden until the first MatchStateChanged — i.e. never in solo
   * play, since systems/multiplayer.ts only emits it with an actual
   * opponent connected. */
  private updateMatchRow(): void {
    if (!this.lastMatchState) {
      return;
    }
    const t = i18nState.t;
    const { state, mySide } = this.lastMatchState;
    const s = score(state);
    const show = (id: string) =>
      this.hudPanel.requireElementById(id).setProperties({ display: 'flex' });

    // "Du är: Spelare A/B" — each player's own fixed identity for the
    // whole match (Erik, 2026-09-02: with only a turn label there was
    // no way to tell WHICH player you were).
    show('role-row');
    this.hudPanel.requireElementById('role-value').setProperties({
      text: mySide === 'host' ? t('rolePlayerA') : t('rolePlayerB'),
    });
    // Score `A - B`, Player A (host) always left so it lines up with the
    // role row (Erik, 2026-09-05, MP3a). Plain hyphen on purpose: the
    // UIKit MSDF font has no glyph for an en dash ("Missing glyph info
    // for character '–'" in the emulator — same charset limit as gh#5).
    show('match-row');
    this.hudPanel
      .requireElementById('match-value')
      .setProperties({ text: `${s.host} - ${s.guest}` });
    // Absolute "Spelare A/B" turn labels, not "din/motst. tur" (Erik,
    // 2026-09-02); once decided, the relative won/lost verdict.
    show('turn-row');
    const turnText = isFinished(state)
      ? state.winner === mySide
        ? t('matchWon')
        : t('matchLost')
      : state.currentTurn === 'host'
        ? t('matchPlayerATurn')
        : t('matchPlayerBTurn');
    this.hudPanel
      .requireElementById('turn-value')
      .setProperties({ text: turnText });
    if (isFinished(state)) {
      show('end-reason-row');
      this.hudPanel.requireElementById('end-reason-value').setProperties({
        text:
          state.endReason === 'allKubbsAndKing'
            ? t('matchEndKing')
            : t('matchEndKingEarly'),
      });
    } else {
      this.hudPanel
        .requireElementById('end-reason-row')
        .setProperties({ display: 'none' });
    }
  }

  private hidePeerRows(): void {
    for (const id of ['role-row', 'match-row', 'turn-row', 'end-reason-row']) {
      this.hudPanel.requireElementById(id).setProperties({ display: 'none' });
    }
  }

  private updateBestFelled(): void {
    this.hudPanel.requireElementById('best-felled').setProperties({
      text: `${this.statsSystem.stats.personalBests.mostFelledInRound}/11`,
    });
  }

  /** Only "underhand" is the correct kubb technique — accented green;
   * the other two stay neutral white (informational, never a penalty
   * — see core/underhandClassifier.ts). */
  private updateThrowStyle(): void {
    if (this.lastThrowStyle === null) {
      return;
    }
    const t = i18nState.t;
    const text =
      this.lastThrowStyle === 'underhand'
        ? t('throwStyleUnderhand')
        : this.lastThrowStyle === 'overhand'
          ? t('throwStyleOverhand')
          : t('throwStyleHelicopter');
    const color = this.lastThrowStyle === 'underhand' ? '#7ed957' : '#ffffff';
    this.hudPanel
      .requireElementById('throw-style')
      .setProperties({ text, color });
  }
}
