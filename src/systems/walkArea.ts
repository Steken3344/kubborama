import {
  createSystem,
  Grabbed,
  LocomotionEnvironment,
  LocomotionSystem,
  Vector3,
} from '@iwsdk/core';
import { settingsState } from '../settingsState.js';
import {
  kubbTable,
  lineLeanAllowanceM,
  standBehindLineM,
  stickRack,
  tableBodyRadiusM,
  walkArea,
} from '../config.js';
import { gameEvents } from '../core/events.js';
import { isFreshMatch, standingLineZ } from '../core/match.js';
import type { MatchSide } from '../core/match.js';
import {
  behindLineCorrectionZ,
  clampToWalkArea,
  blockSlideIntoFootprints,
  recentreKey,
  shouldRecentre,
  throwSpot,
} from '../core/walkArea.js';
import type { Footprint } from '../core/walkArea.js';
import { gateLog } from '../debug/gateLog.js';
import { movePlayerTo } from '../playerPlacement.js';
import { activeCourtHalves, activeFarBaselineZ } from './activeCourt.js';

/** At most one gate line per this many seconds while held at a line. */
const LINE_LOG_INTERVAL_S = 2;
/** A rig move longer than this in one frame is a teleport. */
const TELEPORT_JUMP_M = 0.5;

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
export class WalkAreaSystem extends createSystem({
  /** Anything in a hand: re-centring then would jolt the held piece and
   * corrupt its release velocity (review, 2026-11-01). */
  held: { required: [Grabbed] },
}) {
  private point = { x: 0, z: 0 };
  private target = new Vector3();
  private headPos = new Vector3();
  /** My side and throwing line while a match runs; null otherwise. */
  private side: MatchSide | null = null;
  private lineZ: number | null = null;
  private lastLineLogS = -Infinity;
  /** Both baselines' stick and kubb tables (Erik, 2026-11-01: no
   * sliding through them); the far ones follow the court. */
  private readonly tables: Footprint[] = [
    { x: 0, z: 0, halfX: 0, halfZ: 0 },
    { x: 0, z: 0, halfX: 0, halfZ: 0 },
    { x: 0, z: 0, halfX: 0, halfZ: 0 },
    { x: 0, z: 0, halfX: 0, halfZ: 0 },
  ];
  private tablesFarZ = Number.NaN;
  private head = { x: 0, z: 0 };
  private slide = { x: 0, z: 0 };
  /** The rig at the end of last frame: its change is this frame's
   * thumbstick slide (NaN until the first frame). */
  private lastRigX = Number.NaN;
  private lastRigZ = Number.NaN;

  /** The configured slide speed, restored when walking is switched back
   * on; NaN until read. */
  private slideSpeed = Number.NaN;
  private appliedStickMove: boolean | null = null;
  /** `turn/phase` I was last centred for; a new one of mine re-centres. */
  private centredKey = '';
  private recentrePending = false;
  private wasFresh = false;

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
        // My turn (or its next phase) starts: put me on the throwing spot.
        if (shouldRecentre(state, mySide, this.centredKey, this.wasFresh)) {
          this.recentrePending = true;
        }
        this.centredKey = recentreKey(state, mySide);
        this.wasFresh = isFreshMatch(state);
      }),
      // No line until the next match state: a court switch moves the
      // baselines, and the room emptying ends the match.
      gameEvents.on('GameModeChanged', () => {
        this.lineZ = null;
        this.centredKey = '';
      }),
      gameEvents.on('MultiplayerPeerDisconnected', () => {
        this.side = null;
        this.lineZ = null;
        this.centredKey = '';
        this.wasFresh = false;
        this.recentrePending = false;
      }),
    );
  }

  update(_delta: number, timeS: number): void {
    this.applyStickMove();
    // Waits while anything is held (it happens when the hand lets go).
    if (this.recentrePending && this.queries.held.entities.size === 0) {
      this.recentrePending = false;
      this.recentre();
    }
    const position = this.player.position;
    this.point.x = position.x;
    this.point.z = position.z;
    let moved = clampToWalkArea(this.point, walkArea);
    this.layOutTables();
    this.player.head.getWorldPosition(this.headPos);
    // The thumbstick's slide this frame may not carry the head into a
    // table (core/walkArea.ts) — cut back, never pushed.
    this.slide.x = this.point.x - this.lastRigX;
    this.slide.z = this.point.z - this.lastRigZ;
    // NaN before the first frame; a jump is a teleport (joining, a court
    // switch), never a slide to undo.
    if (Math.hypot(this.slide.x, this.slide.z) < TELEPORT_JUMP_M) {
      this.head.x = this.headPos.x + (this.point.x - position.x);
      this.head.z = this.headPos.z + (this.point.z - position.z);
      const sx = this.slide.x;
      const sz = this.slide.z;
      if (
        blockSlideIntoFootprints(
          this.head,
          this.slide,
          this.tables,
          tableBodyRadiusM,
        )
      ) {
        this.point.x += this.slide.x - sx;
        this.point.z += this.slide.z - sz;
        moved = true;
      }
    }
    if (this.side !== null && this.lineZ !== null) {
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
    this.lastRigX = this.player.position.x;
    this.lastRigZ = this.player.position.z;
  }

  /** The four table footprints for the current court — rewritten in
   * place only when the far baseline moves (a court switch). */
  private layOutTables(): void {
    const farZ = activeFarBaselineZ();
    if (farZ === this.tablesFarZ) {
      return;
    }
    this.tablesFarZ = farZ;
    const near = [
      {
        x: stickRack.xM,
        z: stickRack.zM,
        w: stickRack.widthM,
        d: stickRack.depthM,
      },
      {
        x: kubbTable.xM,
        z: kubbTable.zM,
        w: kubbTable.widthM,
        d: kubbTable.depthM,
      },
    ];
    near.forEach((t, i) => {
      const n = this.tables[i * 2];
      const f = this.tables[i * 2 + 1];
      if (!n || !f) return;
      n.x = t.x;
      n.z = t.z;
      f.x = -t.x; // mirrored onto the far baseline (core/presence.ts)
      f.z = farZ - t.z;
      n.halfX = f.halfX = t.w / 2;
      n.halfZ = f.halfZ = t.d / 2;
    });
  }

  /** "Gå med spaken" (settings.stickMove, Erik 2026-11-01): off sets the
   * locomotion slide speed to 0 — snap turning stays. Checked each frame,
   * applied only on a change (no allocation). */
  private applyStickMove(): void {
    const on = settingsState.current.stickMove;
    if (on === this.appliedStickMove) {
      return;
    }
    const locomotion = this.world.getSystem(LocomotionSystem);
    if (!locomotion) {
      return;
    }
    if (Number.isNaN(this.slideSpeed)) {
      this.slideSpeed = locomotion.config.slidingSpeed.value;
    }
    locomotion.config.slidingSpeed.value = on ? this.slideSpeed : 0;
    this.appliedStickMove = on;
  }

  /** Moves the rig so the head stands on my throwing spot (throwSpot) —
   * the room position the player happens to be at becomes the spot.
   * Runs on the frame after the state, so placement on joining (which
   * also arrives with a state) has happened first. */
  private recentre(): void {
    if (this.side === null) {
      return;
    }
    const spot = throwSpot(this.side, activeCourtHalves(), standBehindLineM);
    this.player.head.getWorldPosition(this.headPos);
    const position = this.player.position;
    this.target.set(
      position.x + (spot.x - this.headPos.x),
      position.y,
      position.z + (spot.z - this.headPos.z),
    );
    movePlayerTo(this.world, this.player, this.target);
    // A jump, not a slide: the table check must not undo it.
    this.lastRigX = this.target.x;
    this.lastRigZ = this.target.z;
    gateLog('recentred on throwing spot', {
      side: this.side,
      z: spot.z,
    });
  }
}
