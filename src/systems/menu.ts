import {
  createSystem,
  GrabSystem,
  InputComponent,
  PhysicsSystem,
  UIKitMLAsset,
} from '@iwsdk/core';
import type { Entity } from '@iwsdk/core';
import { Resettable } from '../components/resettable.js';
import { StickPhase, StickState } from '../components/stick-state.js';
import { gameEvents } from '../core/events.js';
import { log } from '../core/log.js';
import type { Vec3 } from '../core/vec3.js';
import { i18nState } from '../i18nState.js';
import { settingsState } from '../settingsState.js';
import { SettingsSystem } from './settings.js';

interface HomePose {
  position: Vec3;
  quaternion: [number, number, number, number];
}

/**
 * B button (right controller) toggles a small pause menu: Reset
 * (teleports every kubb/king/stick back to its authored spawn pose,
 * captured once at init, before physics has moved anything; returns
 * sticks to StickState.Racked), plus language and game-mode toggles
 * (M4) that call SettingsSystem directly — a UI action dispatch, not
 * the scoring/stats/haptics traffic the "one event bus" rule targets.
 */
export class MenuSystem extends createSystem({
  resettable: { required: [Resettable] },
}) {
  private grabSystem!: GrabSystem;
  private physicsSystem!: PhysicsSystem;
  private settingsSystem!: SettingsSystem;
  private homePoses = new Map<number, HomePose>();
  private menuPanel!: UIKitMLAsset;
  private menuOpen = false;
  private currentTimeS = 0;
  private unsubscribeRoundEnded?: () => void;
  private unsubscribeLanguageChanged?: () => void;

  init(): void {
    const grabSystem = this.world.getSystem(GrabSystem);
    if (!grabSystem) {
      throw new Error(
        'MenuSystem requires GrabSystem — enable the "grabbing" world feature in iwsdk.config.json',
      );
    }
    const physicsSystem = this.world.getSystem(PhysicsSystem);
    if (!physicsSystem) {
      throw new Error(
        'MenuSystem requires PhysicsSystem — enable the "physics" world feature in iwsdk.config.json',
      );
    }
    const settingsSystem = this.world.getSystem(SettingsSystem);
    if (!settingsSystem) {
      throw new Error(
        'MenuSystem requires SettingsSystem to be registered first',
      );
    }
    this.grabSystem = grabSystem;
    this.physicsSystem = physicsSystem;
    this.settingsSystem = settingsSystem;

    for (const entity of this.queries.resettable.entities) {
      const object3D = entity.object3D;
      if (!object3D) {
        continue;
      }
      this.homePoses.set(entity.index, {
        position: [
          object3D.position.x,
          object3D.position.y,
          object3D.position.z,
        ],
        quaternion: [
          object3D.quaternion.x,
          object3D.quaternion.y,
          object3D.quaternion.z,
          object3D.quaternion.w,
        ],
      });
    }

    this.menuPanel =
      this.world.requireSceneObject<UIKitMLAsset>('reset-menu-panel');
    const resetButton = this.menuPanel.requireElementById('reset-button');
    resetButton.addEventListener('click', () => {
      this.resetAll();
      this.setMenuOpen(false);
    });
    const languageButton = this.menuPanel.requireElementById('language-button');
    languageButton.addEventListener('click', () => {
      this.settingsSystem.toggleLanguage();
    });
    const gameModeButton =
      this.menuPanel.requireElementById('game-mode-button');
    gameModeButton.addEventListener('click', () => {
      this.settingsSystem.toggleGameMode();
      this.refreshLabels();
    });

    this.refreshLabels();

    // A finished round (RoundSystem) auto-resets through the exact
    // same path as the menu's manual Reset button — one reset
    // implementation, two triggers.
    this.unsubscribeRoundEnded = gameEvents.on('RoundEnded', () => {
      this.resetAll();
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
    this.menuPanel
      .requireElementById('menu-title')
      .setProperties({ text: t('menuTitle') });
    this.menuPanel
      .requireElementById('reset-button-label')
      .setProperties({ text: t('resetButton') });
    this.menuPanel.requireElementById('language-button-label').setProperties({
      text:
        settingsState.current.language === 'sv'
          ? t('languageNameSv')
          : t('languageNameEn'),
    });
    this.menuPanel.requireElementById('game-mode-button-label').setProperties({
      text:
        settingsState.current.gameMode === 'simple'
          ? t('gameModeNameSimple')
          : t('gameModeNameAdvanced'),
    });
  }

  update(_delta: number, time: number): void {
    this.currentTimeS = time;
    const rightGamepad = this.input.xr.gamepads.right;
    if (rightGamepad?.getButtonDown(InputComponent.B_Button)) {
      this.setMenuOpen(!this.menuOpen);
    }
  }

  private setMenuOpen(open: boolean): void {
    this.menuOpen = open;
    const root = this.menuPanel.requireElementById('menu-root');
    root.setProperties({ display: open ? 'flex' : 'none' });
  }

  private resetAll(): void {
    for (const entity of this.queries.resettable.entities) {
      this.resetOne(entity);
    }
    gameEvents.emit('Reset', { timeS: this.currentTimeS });
    log('info', 'state', 'reset', {});
  }

  private resetOne(entity: Entity): void {
    const home = this.homePoses.get(entity.index);
    if (!home) {
      return;
    }
    this.grabSystem.forceRelease(entity);
    if (entity.hasComponent(StickState)) {
      entity.setValue(StickState, 'phase', StickPhase.Racked);
      entity.setValue(StickState, 'lastThrowerHand', '');
    }
    this.physicsSystem.setBodyTransform(entity, {
      position: home.position,
      quaternion: home.quaternion,
    });
  }
}
