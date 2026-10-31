import { createSystem, LocomotionEnvironment, Vector3 } from '@iwsdk/core';
import { lineLeanAllowanceM, walkArea } from '../config.js';
import { gameEvents } from '../core/events.js';
import { standingLineZ } from '../core/match.js';
import type { MatchSide } from '../core/match.js';
import { behindLineCorrectionZ, clampToWalkArea } from '../core/walkArea.js';
import { gateLog } from '../debug/gateLog.js';
import { movePlayerTo } from '../playerPlacement.js';
import { activeCourtHalves } from './activeCourt.js';

/** At most one gate line per this many seconds while held at a line. */
const LINE_LOG_INTERVAL_S = 2;

/**
 * Thumbstick locomotion (Erik, 2026-10-31; iwsdk.config.json
 * `features.locomotion`): the ground becomes walkable, and the player
 * is kept inside the garden (core/walkArea.ts) and — during a match —
 * behind their own throwing line: the baseline, or the advantage line
 * while throwing from it (core/match.ts standingLineZ). The line check
 * uses the HEAD, so walking forward in the room is stopped too, with a
 * lean allowance for the throw itself. Registered after IWSDK's
 * LocomotionSystem, so it corrects the frame's slide before anything
 * reads the rig.
 */
export class WalkAreaSystem extends createSystem({}) {
  private point = { x: 0, z: 0 };
  private target = new Vector3();
  private headPos = new Vector3();
  /** My side and throwing line while a match runs; null otherwise. */
  private side: MatchSide | null = null;
  private lineZ: number | null = null;
  private lastLineLogS = -Infinity;

  init(): void {
    // The walkable surface is set here rather than in the scene JSON, so
    // the editor and the game server's scene reader stay untouched.
    this.world
      .requireSceneEntity('ground')
      .addComponent(LocomotionEnvironment, { type: 'static' });
    this.cleanupFuncs.push(
      gameEvents.on('MatchStateChanged', ({ state, mySide }) => {
        this.side = mySide;
        this.lineZ = standingLineZ(state, mySide, activeCourtHalves());
      }),
      // No line until the next match state: a court switch moves the
      // baselines, and the room emptying ends the match.
      gameEvents.on('GameModeChanged', () => {
        this.lineZ = null;
      }),
      gameEvents.on('MultiplayerPeerDisconnected', () => {
        this.side = null;
        this.lineZ = null;
      }),
    );
  }

  update(_delta: number, timeS: number): void {
    const position = this.player.position;
    this.point.x = position.x;
    this.point.z = position.z;
    let moved = clampToWalkArea(this.point, walkArea);
    if (this.side !== null && this.lineZ !== null) {
      this.player.head.getWorldPosition(this.headPos);
      const dz = behindLineCorrectionZ(
        this.headPos.z + (this.point.z - position.z),
        this.side,
        this.lineZ,
        lineLeanAllowanceM,
      );
      if (dz !== 0) {
        this.point.z += dz;
        moved = true;
        if (timeS - this.lastLineLogS > LINE_LOG_INTERVAL_S) {
          this.lastLineLogS = timeS;
          gateLog('held behind line', { side: this.side, lineZ: this.lineZ });
        }
      }
    }
    if (moved) {
      this.target.set(this.point.x, position.y, this.point.z);
      movePlayerTo(this.world, this.player, this.target);
    }
  }
}
