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
import { audio } from '../config.js';
import { KUBB_COUNT } from '../core/court-layout.js';
import { accuracy } from '../core/stats.js';
import { gameEvents } from '../core/events.js';
import { uiTick } from '../core/haptics.js';
import { log } from '../core/log.js';
import { createRng } from '../core/rng.js';
import type { Vec3 } from '../core/vec3.js';
import { i18nState } from '../i18nState.js';
import { settingsState } from '../settingsState.js';
import { pulseHaptic } from './hapticPlayer.js';
import { playSfxVariant } from './playSfx.js';
import { SettingsSystem } from './settings.js';
import { StatsSystem } from './stats.js';

interface HomePose {
  position: Vec3;
  quaternion: [number, number, number, number];
}

type TabId = 'main' | 'settings' | 'stats';

/** Cycle grid for the volume/haptics-strength buttons. `defaultSettings()`
 * starts these at 70, off this grid, so advancing must find the next step
 * greater than the current value rather than assume grid alignment — see
 * docs/DECISIONS.md (M4 review). */
const VOLUME_STEPS = [0, 25, 50, 75, 100] as const;

/** Deterministic per-session UI-click-sfx-variant picker — not the physics RNG. */
const UI_SFX_SEED = 24601;

// 5 kubbs per baseline, 2 baselines, 1 king (docs/PLAN.md §2b).
const TOTAL_PIECES = KUBB_COUNT * 2 + 1;
/** null = the default "Spelare"/"Player" placeholder — cycled through
 * on the profile-name button since real text entry in VR wasn't
 * attempted this session (see docs/DECISIONS.md). */
const PROFILE_NAME_OPTIONS: Array<string | null> = [null, 'Erik', 'Gast'];

/**
 * B button (right controller) toggles a small pause menu with three
 * tabs: Meny (reset), Alternativ (settings), Statistik (read-only
 * personal bests). Every control is a Button that shows its current
 * value and advances on click — see reset-menu.uikitml's header
 * comment for why, over a native Toggle/Slider/Input.
 */
export class MenuSystem extends createSystem({
  resettable: { required: [Resettable] },
}) {
  private grabSystem!: GrabSystem;
  private physicsSystem!: PhysicsSystem;
  private settingsSystem!: SettingsSystem;
  private statsSystem!: StatsSystem;
  private homePoses = new Map<number, HomePose>();
  private menuPanel!: UIKitMLAsset;
  private menuOpen = false;
  private activeTab: TabId = 'main';
  private currentTimeS = 0;
  private uiSfxRng = createRng(UI_SFX_SEED);

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
    const statsSystem = this.world.getSystem(StatsSystem);
    if (!statsSystem) {
      throw new Error('MenuSystem requires StatsSystem to be registered first');
    }
    this.grabSystem = grabSystem;
    this.physicsSystem = physicsSystem;
    this.settingsSystem = settingsSystem;
    this.statsSystem = statsSystem;

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

    this.wireButton('tab-main-button', () => this.setActiveTab('main'));
    this.wireButton('tab-settings-button', () => this.setActiveTab('settings'));
    this.wireButton('tab-stats-button', () => this.setActiveTab('stats'));

    this.wireButton('reset-button', () => {
      this.resetAll();
      this.setMenuOpen(false);
    });
    this.wireButton('language-button', () => {
      this.settingsSystem.toggleLanguage();
    });
    this.wireButton('game-mode-button', () => {
      this.settingsSystem.toggleGameMode();
      this.refreshLabels();
    });
    this.wireButton('haptics-button', () => {
      this.settingsSystem.setHapticsEnabled(
        !settingsState.current.hapticsEnabled,
      );
      this.refreshLabels();
    });
    this.wireButton('haptics-strength-button', () => {
      this.settingsSystem.setHapticsIntensityPercent(
        nextVolumeStep(settingsState.current.hapticsIntensityPercent),
      );
      this.refreshLabels();
    });
    this.wireButton('music-volume-button', () => {
      this.settingsSystem.setMusicVolumePercent(
        nextVolumeStep(settingsState.current.musicVolumePercent),
      );
      this.refreshLabels();
    });
    this.wireButton('sfx-volume-button', () => {
      this.settingsSystem.setSfxVolumePercent(
        nextVolumeStep(settingsState.current.sfxVolumePercent),
      );
      this.refreshLabels();
    });
    this.wireButton('profile-name-button', () => {
      const current = PROFILE_NAME_OPTIONS.indexOf(
        settingsState.current.profileName,
      );
      const next =
        PROFILE_NAME_OPTIONS[(current + 1) % PROFILE_NAME_OPTIONS.length] ??
        null;
      this.settingsSystem.setProfileName(next);
      this.refreshLabels();
    });
    this.wireButton('court-lines-button', () => {
      this.settingsSystem.setCourtLinesVisible(
        !settingsState.current.courtLinesVisible,
      );
      this.refreshLabels();
    });

    this.refreshLabels();
    this.setActiveTab('main');

    // A finished round (RoundSystem) auto-resets through the exact
    // same path as the menu's manual Reset button — one reset
    // implementation, two triggers.
    this.cleanupFuncs.push(
      gameEvents.on('RoundEnded', () => {
        this.resetAll();
        this.refreshStats();
      }),
      gameEvents.on('LanguageChanged', () => {
        this.refreshLabels();
      }),
    );
  }

  /** Wires a button's click to `handler`, plus the shared UI-click
   * feedback (uiTick haptic + click sound) every button gets — see
   * docs/DECISIONS.md (M5) for why this fires on the right hand only
   * (a UIKitML click event carries no hand/pointer info to key off). */
  private wireButton(elementId: string, handler: () => void): void {
    this.menuPanel
      .requireElementById(elementId)
      .addEventListener('click', () => {
        pulseHaptic(this.input.xr.gamepads.right, uiTick);
        playSfxVariant(
          this.world,
          'uiClick',
          this.uiSfxRng,
          audio.volume.uiClick,
        );
        handler();
      });
  }

  private setActiveTab(tab: TabId): void {
    this.activeTab = tab;
    this.menuPanel
      .requireElementById('tab-main-content')
      .setProperties({ display: tab === 'main' ? 'flex' : 'none' });
    this.menuPanel
      .requireElementById('tab-settings-content')
      .setProperties({ display: tab === 'settings' ? 'flex' : 'none' });
    this.menuPanel
      .requireElementById('tab-stats-content')
      .setProperties({ display: tab === 'stats' ? 'flex' : 'none' });
    if (tab === 'stats') {
      this.refreshStats();
    }
  }

  private refreshLabels(): void {
    const t = i18nState.t;
    const s = settingsState.current;
    this.menuPanel
      .requireElementById('tab-main-label')
      .setProperties({ text: t('tabMain') });
    this.menuPanel
      .requireElementById('tab-settings-label')
      .setProperties({ text: t('tabSettings') });
    this.menuPanel
      .requireElementById('tab-stats-label')
      .setProperties({ text: t('tabStats') });
    this.menuPanel
      .requireElementById('reset-button-label')
      .setProperties({ text: t('resetButton') });
    this.menuPanel.requireElementById('language-button-label').setProperties({
      text: s.language === 'sv' ? t('languageNameSv') : t('languageNameEn'),
    });
    this.menuPanel.requireElementById('game-mode-button-label').setProperties({
      text:
        s.gameMode === 'simple'
          ? t('gameModeNameSimple')
          : t('gameModeNameAdvanced'),
    });
    this.menuPanel.requireElementById('haptics-button-label').setProperties({
      text: s.hapticsEnabled ? t('hapticsOn') : t('hapticsOff'),
    });
    this.menuPanel.requireElementById('haptics-strength-label').setProperties({
      text: t('hapticsStrength', { percent: s.hapticsIntensityPercent }),
    });
    this.menuPanel.requireElementById('music-volume-label').setProperties({
      text: t('musicVolume', { percent: s.musicVolumePercent }),
    });
    this.menuPanel
      .requireElementById('sfx-volume-label')
      .setProperties({ text: t('sfxVolume', { percent: s.sfxVolumePercent }) });
    this.menuPanel.requireElementById('profile-name-label').setProperties({
      text: t('profileNamePrefix', {
        name: s.profileName ?? t('profileNameDefault'),
      }),
    });
    this.menuPanel.requireElementById('court-lines-label').setProperties({
      text: s.courtLinesVisible ? t('courtLinesOn') : t('courtLinesOff'),
    });
    this.menuPanel.requireElementById('version-label').setProperties({
      text: t('versionLabel', { version: __APP_VERSION__ }),
    });
  }

  private refreshStats(): void {
    const t = i18nState.t;
    const stats = this.statsSystem.stats;
    const pb = stats.personalBests;
    this.menuPanel.requireElementById('stats-fewest-sticks').setProperties({
      text:
        pb.fewestSticksToFellKing === null
          ? t('statsFewestSticksEmpty')
          : t('statsFewestSticks', { value: pb.fewestSticksToFellKing }),
    });
    this.menuPanel.requireElementById('stats-most-felled').setProperties({
      text: t('statsMostFelled', {
        value: pb.mostFelledInRound,
        total: TOTAL_PIECES,
      }),
    });
    this.menuPanel.requireElementById('stats-longest-throw').setProperties({
      text: t('statsLongestThrow', {
        value: Math.round(pb.longestThrowM * 10) / 10,
      }),
    });
    this.menuPanel
      .requireElementById('stats-longest-felling-throw')
      .setProperties({
        text: t('statsLongestFellingThrow', {
          value: Math.round(pb.longestFellingThrowM * 10) / 10,
        }),
      });
    this.menuPanel.requireElementById('stats-streak').setProperties({
      text: t('statsStreak', { value: pb.longestKingFellingStreak }),
    });
    this.menuPanel.requireElementById('stats-rounds-played').setProperties({
      text: t('statsRoundsPlayed', {
        value: stats.lifetimeTotals.roundsPlayed,
      }),
    });
    this.menuPanel.requireElementById('stats-accuracy').setProperties({
      text: t('statsAccuracy', {
        value: Math.round(accuracy(stats) * 100),
      }),
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

function nextVolumeStep(current: number): number {
  for (const step of VOLUME_STEPS) {
    if (step > current) {
      return step;
    }
  }
  return 0;
}
