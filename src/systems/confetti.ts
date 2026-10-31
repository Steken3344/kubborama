import {
  Color,
  createSystem,
  DoubleSide,
  Euler,
  InstancedMesh,
  Matrix4,
  MeshBasicMaterial,
  PlaneGeometry,
  Quaternion,
  Vector3,
} from '@iwsdk/core';
import { avatarPaletteEntry, confetti } from '../config.js';
import { burstConfetti, confettiDone, stepConfetti } from '../core/confetti.js';
import type { ConfettiOptions, ConfettiState } from '../core/confetti.js';
import { gameEvents } from '../core/events.js';
import type { MatchSide, MatchState } from '../core/match.js';
import { createRng } from '../core/rng.js';
import { gateLog } from '../debug/gateLog.js';
import { serverShownColors, shownColorsFor } from '../shownColors.js';
import { activeCourtHalves } from './activeCourt.js';

/** Colour slot 0 is the winner's avatar colour; the rest from the JSON. */
const COLOR_COUNT = 1 + confetti.extraColorsHex.length;
const OPTS: ConfettiOptions = {
  count: confetti.count,
  burstSpeedMps: confetti.burstSpeedMps,
  gravityMps2: confetti.gravityMps2,
  dragPerS: confetti.dragPerS,
  flutterAmplitudeMps: confetti.flutterAmplitudeMps,
  flutterRadPerS: confetti.flutterRadPerS,
  spinRadPerS: confetti.spinRadPerS,
  lifetimeS: confetti.lifetimeS,
  colorCount: COLOR_COUNT,
};
/** How far in front of the winner's baseline the burst goes up (m). */
const IN_FRONT_OF_BASELINE_M = 1.5;
const FALLBACK_WINNER_HEX = '#ffd23f';

/**
 * Victory confetti (Erik, 2026-10-31): when a match is won, a burst goes
 * up over the winner's side in their avatar colour plus gold, white,
 * pink and blue, and flutters down for a few seconds. Seen by both
 * headsets and the TV view — it is in the world. One instanced mesh
 * (one draw call), simulated by core/confetti.ts, nothing allocated per
 * frame. Follows the match from both routes: the game server's
 * broadcast (players and spectators) and the serverless host's
 * MatchStateChanged.
 */
export class ConfettiSystem extends createSystem({}) {
  private mesh!: InstancedMesh;
  private state: ConfettiState | null = null;
  private lastWinner: MatchSide | null = null;
  /** The first state only arms the trigger: a late joiner must not get
   * confetti for a win already over (review, 2026-10-31). */
  private seenState = false;
  /** For the winner's colour without the game server (serverless play). */
  private mySide: MatchSide | null = null;
  private opponentColorIndex: number | null = null;
  private bursts = 0;
  private readonly matrix = new Matrix4();
  private readonly position = new Vector3();
  private readonly rotation = new Quaternion();
  private readonly euler = new Euler();
  private readonly scale = new Vector3(1, 1, 1);
  private readonly color = new Color();

  init(): void {
    const geometry = new PlaneGeometry(
      confetti.pieceWidthM,
      confetti.pieceHeightM,
    );
    const material = new MeshBasicMaterial({ side: DoubleSide });
    this.mesh = new InstancedMesh(geometry, material, confetti.count);
    this.mesh.name = 'victory-confetti';
    // The pieces spread over the whole court; one bounding box would
    // have to be refreshed every frame — never cull this one mesh.
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
    const entity = this.world.createTransformEntity(this.mesh);
    const onMatch = (state: MatchState | null) => {
      const winner = state?.winner ?? null;
      if (this.seenState && winner !== null && this.lastWinner === null) {
        this.burst(winner);
      }
      this.seenState = true;
      this.lastWinner = winner;
    };
    this.cleanupFuncs.push(
      gameEvents.on('BroadcastMatchState', ({ state }) => {
        onMatch(state);
      }),
      gameEvents.on('MatchStateChanged', ({ state, mySide }) => {
        this.mySide = mySide;
        onMatch(state);
      }),
      gameEvents.on('PeerPresence', (e) => {
        this.opponentColorIndex = e.message.colorIndex;
      }),
      () => {
        entity.dispose();
      },
    );
  }

  private burst(winner: MatchSide): void {
    const halves = activeCourtHalves();
    const baselineZ =
      winner === 'host' ? halves.nearBaselineZ : halves.farBaselineZ;
    const z =
      baselineZ +
      (winner === 'host' ? -IN_FRONT_OF_BASELINE_M : IN_FRONT_OF_BASELINE_M);
    this.bursts += 1;
    this.state = burstConfetti(
      [0, confetti.burstHeightM, z],
      OPTS,
      createRng(this.bursts),
    );
    const winnerIndex = this.winnerColorIndex(winner);
    for (let i = 0; i < confetti.count; i += 1) {
      const slot = this.state.colors[i] ?? 0;
      const hex =
        slot === 0
          ? winnerIndex === null
            ? FALLBACK_WINNER_HEX
            : avatarPaletteEntry(winnerIndex).hex
          : (confetti.extraColorsHex[slot - 1] ?? FALLBACK_WINNER_HEX);
      this.mesh.setColorAt(i, this.color.set(hex));
    }
    if (this.mesh.instanceColor) {
      this.mesh.instanceColor.needsUpdate = true;
    }
    this.mesh.visible = true;
    gateLog('confetti', { winner });
  }

  /** The winner's shown colour: the server's assignment, or — playing
   * serverless — the same clash-resolved pair the avatars and HUD use. */
  private winnerColorIndex(winner: MatchSide): number | null {
    const assigned = serverShownColors.current?.[winner];
    if (assigned !== undefined && assigned !== null) return assigned;
    if (this.mySide === null) return null;
    const shown = shownColorsFor(this.opponentColorIndex, this.mySide);
    return winner === this.mySide ? shown.mine : shown.theirs;
  }

  update(delta: number): void {
    const s = this.state;
    if (!s) return;
    stepConfetti(s, Math.min(delta, 0.05), OPTS);
    if (confettiDone(s, OPTS)) {
      this.state = null;
      this.mesh.visible = false;
      return;
    }
    for (let i = 0; i < confetti.count; i += 1) {
      const angle = s.angles[i] ?? 0;
      this.position.set(
        s.positions[i * 3] ?? 0,
        s.positions[i * 3 + 1] ?? 0,
        s.positions[i * 3 + 2] ?? 0,
      );
      this.euler.set(angle, angle * 0.7, angle * 0.3);
      this.rotation.setFromEuler(this.euler);
      this.matrix.compose(this.position, this.rotation, this.scale);
      this.mesh.setMatrixAt(i, this.matrix);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}
