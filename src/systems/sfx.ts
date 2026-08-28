import { AudioSource, AudioUtils, createSystem } from '@iwsdk/core';
import type { Entity } from '@iwsdk/core';
import { audio } from '../config.js';
import { gameEvents } from '../core/events.js';
import { kingFelled, kubbFelled, roundCleared } from '../core/haptics.js';
import type { HapticSequence } from '../core/haptics.js';
import { createRng } from '../core/rng.js';
import { playHapticSequence } from './hapticPlayer.js';
import { playSfxVariant } from './playSfx.js';
import { AMBIENCE_SRC, MUSIC_SRC } from './sfxLibrary.js';
import { settingsState } from '../settingsState.js';

/** Deterministic per-session felled-sfx-variant picker — not the physics RNG. */
const FELLED_SFX_SEED = 9001;

/**
 * Sound + (previously dormant) haptic feedback for the moments the
 * per-tick ImpactSystem can't cover: a piece actually toppling
 * (KubbFelled/KingFelled, from ToppleSystem) and clearing a round
 * (RoundEnded with a felled king). Also owns the two persistent
 * background loops — ambience and music — since both are settings-
 * driven the same way these one-shots are.
 *
 * kubbFelled/kingFelled/roundCleared HapticSequences were defined in
 * core/haptics.ts back in M3/M4 but never fired anywhere — this system
 * closes that gap. Neither ToppleSystem's events nor RoundEnded carry
 * which hand caused them, so sequences fire on both controllers.
 */
export class SfxSystem extends createSystem({}) {
  private sfxRng = createRng(FELLED_SFX_SEED);
  private ambienceEntity!: Entity;
  private musicEntity!: Entity;
  private appliedSfxVolumePercent = -1;
  private appliedMusicVolumePercent = -1;
  private unsubscribeKubbFelled?: () => void;
  private unsubscribeKingFelled?: () => void;
  private unsubscribeRoundEnded?: () => void;

  init(): void {
    this.ambienceEntity = this.world.createEntity();
    this.ambienceEntity.addComponent(AudioSource, {
      src: AMBIENCE_SRC,
      loop: true,
      autoplay: true,
      positional: false,
      volume: 0,
    });

    this.musicEntity = this.world.createEntity();
    this.musicEntity.addComponent(AudioSource, {
      src: MUSIC_SRC,
      loop: true,
      autoplay: true,
      positional: false,
      volume: 0,
    });

    this.unsubscribeKubbFelled = gameEvents.on('KubbFelled', () => {
      playSfxVariant(
        this.world,
        'kubbFelled',
        this.sfxRng,
        audio.volume.felledFixed,
      );
      this.pulseBothHands(kubbFelled);
    });
    this.unsubscribeKingFelled = gameEvents.on('KingFelled', () => {
      playSfxVariant(
        this.world,
        'kingImpact',
        this.sfxRng,
        audio.volume.felledFixed,
      );
      this.pulseBothHands(kingFelled);
    });
    this.unsubscribeRoundEnded = gameEvents.on('RoundEnded', ({ result }) => {
      if (result.kingFelled) {
        this.pulseBothHands(roundCleared);
      }
    });
  }

  destroy(): void {
    this.unsubscribeKubbFelled?.();
    this.unsubscribeKingFelled?.();
    this.unsubscribeRoundEnded?.();
  }

  update(): void {
    const s = settingsState.current;
    if (s.sfxVolumePercent !== this.appliedSfxVolumePercent) {
      this.appliedSfxVolumePercent = s.sfxVolumePercent;
      // Ambience has no slider of its own — it deliberately follows
      // the SFX channel, per docs/PLAN.md §5 ("ambience follows the
      // SFX channel"), at a reduced base gain so it reads as
      // atmosphere rather than competing with impact klonks.
      AudioUtils.setVolume(
        this.ambienceEntity,
        (s.sfxVolumePercent / 100) * audio.volume.ambienceBaseGain,
      );
    }
    if (s.musicVolumePercent !== this.appliedMusicVolumePercent) {
      this.appliedMusicVolumePercent = s.musicVolumePercent;
      AudioUtils.setVolume(this.musicEntity, s.musicVolumePercent / 100);
    }
  }

  private pulseBothHands(sequence: HapticSequence): void {
    playHapticSequence(this.input.xr.gamepads.left, sequence);
    playHapticSequence(this.input.xr.gamepads.right, sequence);
  }
}
