import {
  avatarPalette,
  bot as botTuning,
  courtPresetForMode,
  getCourtPreset,
  match as matchTuning,
  pieces,
  profileNames,
} from '../src/config.js';
import type { BotLevel } from '../src/config.js';
import {
  botStep,
  forgetBotToss,
  freshBotMemory,
} from '../src/core/botBrain.js';
import type { BotMemory } from '../src/core/botBrain.js';
import { botPresence, isFreshMatch } from '../src/core/botPolicy.js';
import { courtHalves } from '../src/core/inkast.js';
import type { CourtHalves } from '../src/core/inkast.js';
import { createImpactWatch } from '../src/core/impactWatch.js';
import type { ImpactItem } from '../src/core/impactWatch.js';
import { createRng } from '../src/core/rng.js';
import type { Vec3 } from '../src/core/vec3.js';
import { shownAvatarColors } from '../src/core/avatarColors.js';
import { isMatchUnderway } from '../src/core/match.js';
import type { MatchSide, MatchState } from '../src/core/match.js';
import { NETWORKED_PIECE_IDS } from '../src/core/pieceSync.js';
import {
  claimProfile,
  clientProfile,
  isKnownDevice,
  profileKeyFor,
  recordBotResult,
  recordMatchResult,
  recordRoundFor,
  setProfileColor,
} from '../src/core/profiles.js';
import type { ProfileStore } from '../src/core/profiles.js';
import {
  MAX_IMPACT_DELTA_V_MPS,
  MAX_IMPACTS_PER_MESSAGE,
  parseClientMessage,
  SERVER_PROTOCOL_VERSION,
  SNAPSHOT_EVERY_TICKS,
  TICK_HZ,
} from '../src/core/serverProtocol.js';
import type {
  ClientMessage,
  RoomRules,
  ServerMessage,
} from '../src/core/serverProtocol.js';
import type { Settings } from '../src/core/settings.js';
import { MatchHost } from './matchHost.js';
import type { RoundReport } from './matchHost.js';
import { memoryProfileRepository } from './profileRepository.js';
import type { ProfileRepository } from './profileRepository.js';
import { createPhysicsWorld } from './physicsWorld.js';
import type { PhysicsWorld } from './physicsWorld.js';
import { appendServerLog } from './serverLog.js';
import type { ServerLog } from './serverLog.js';

/** At most this many throws per client per second — six sticks is a
 * whole turn; anything faster is a flood (review, 2026-09-26). */
const MAX_THROWS_PER_SECOND = 6;
/** Server impacts (core/impactWatch.ts): a jump this much past a piece's
 * own reach in one step is a teleport, and one contact reports at most
 * once per cooldown. */
const IMPACT_TELEPORT_M = 0.2;
const IMPACT_COOLDOWN_S = 0.08;

/** A dropped player keeps its side this long: a reloading headset
 * rejoins with the same clientId and the match simply continues
 * (docs/QUESTIONS.md, option 1 — decided 2026-09-27). */
export const REJOIN_GRACE_MS = 60_000;
/** A seated player with no presence (head/hands, sent 20 Hz from the
 * headset) for this long is not playing: asking for the bot takes that
 * seat (Erik, 2026-11-01 — an old tab of the same headset held it and
 * the bot was refused, "room full"). */
export const SEAT_IDLE_MS = 10_000;
/** "Ny runda" and a court switch each act at most once per this long,
 * room-wide: a repeated press (a bouncing ray, a quick double click, or
 * both players at once) must not restart the match — or flip the court
 * back — again and again (gh#27; 8 court flips in 2 s on 2026-10-31). */
export const ROOM_ACTION_COOLDOWN_MS = 1000;
/** A player changes name or colour at most this often (each change
 * rewrites the profile file — review, 2026-10-31). */
const PROFILE_CHANGE_COOLDOWN_MS = 300;
/** Browsers watching the room without a seat (the TV view). */
export const MAX_SPECTATORS = 8;

/** What the transport (wsServer.ts, or a test) gives the game server. */
export interface ClientConnection {
  send(message: ServerMessage): void;
  close(): void;
}

/** What the game server gives back for each connection. */
/** What the transport knows about a connection before any message. */
export interface ConnectionInfo {
  /** The server's device cookie (httpRoutes.ts), when the browser sent
   * one — it survives a port change, unlike the page's clientId. */
  deviceId?: string;
}

export interface ClientHandle {
  /** One decoded JSON message from the client (untrusted). Resolves to
   * whether it was accepted and acted on. */
  receive(data: unknown): Promise<boolean>;
  /** The connection went away. */
  close(): void;
}

interface Seat {
  side: MatchSide;
  clientId: string;
  connection: ClientConnection | null;
  /** The device behind the seat: its cookie, else its clientId. */
  deviceId: string;
  profileKey: string;
  /** Set while the player is away; the seat is freed after the grace. */
  leftAtMs: number | null;
  recentThrowsMs: number[];
  lastPresenceMs: number;
  /** When this seat was taken or reclaimed (idleness counts from here). */
  seatedAtMs: number;
  recentSignalsMs: number[];
  lastProfileChangeMs: number;
  /** A server-run bot (no connection, never expires, no profile). */
  bot: boolean;
}

const SIDES: readonly MatchSide[] = ['host', 'guest'];

export interface GameServerOptions {
  nowMs?: () => number;
  log?: ServerLog;
  /** Player profiles (colour, name, stats); in memory if omitted. */
  profiles?: ProfileRepository;
}

/**
 * MP5/MP6 (docs/superpowers/specs/2026-09-26-authoritative-server-design.md):
 * one room, two seats (side A = 'host', side B = 'guest' — the side, not
 * the authority; this server is always the authority). The first
 * player's game mode picks the court; the physics world and its
 * MatchHost (the rules) are built on the first join and dropped when
 * the room is empty. A seat survives a disconnect for REJOIN_GRACE_MS.
 * `tick()` advances exactly one fixed 1/TICK_HZ step; `start()` drives
 * it from wall-clock time.
 */
export class GameServer {
  private readonly nowMs: () => number;
  private readonly lastRoomActionMs = new Map<
    'reset' | 'court' | 'settings',
    number
  >();
  private readonly log: ServerLog;
  private seats: Seat[] = [];
  private readonly spectators = new Set<ClientConnection>();
  private world: PhysicsWorld | null = null;
  /** Server-side impacts, sent with each snapshot (core/impactWatch.ts). */
  private readonly impactWatch = createImpactWatch({
    thresholdMps: pieces.throw.impactThresholdMps,
    teleportM: IMPACT_TELEPORT_M,
    cooldownS: IMPACT_COOLDOWN_S,
  });
  private pendingImpacts: ImpactItem[] = [];
  /** Clients whose idle seat went to the bot (cleared when it leaves). */
  private readonly idleClientIds = new Set<string>();
  private host: MatchHost | null = null;
  private worldPromise: Promise<PhysicsWorld> | null = null;
  private lastMatch: ServerMessage | null = null;
  private tickCount = 0;
  private peersGeneration = 0;
  private gameMode: Settings['gameMode'] = 'simple';
  private timer: ReturnType<typeof setInterval> | null = null;
  private readonly profileRepo: ProfileRepository;
  private profiles: ProfileStore;
  private readonly deviceIds = new WeakMap<ClientConnection, string>();
  /** The current finished match is already in the profiles. */
  private matchRecorded = false;
  /** Room settings beside the court (reset when the room empties). */
  private timeLimitMin = 0;
  private rules: RoomRules = 'standard';
  private botLevel: BotLevel | null = null;
  private botMemory: BotMemory = freshBotMemory();
  private botRng: () => number = createRng(1);
  private matchState: MatchState | null = null;
  private readonly botPositions = new Map<string, Vec3>();
  private halvesCache: { gameMode: string; halves: CourtHalves } | null = null;

  constructor(options: GameServerOptions = {}) {
    this.nowMs = options.nowMs ?? (() => performance.now());
    this.log = options.log ?? appendServerLog;
    this.profileRepo = options.profiles ?? memoryProfileRepository();
    this.profiles = this.profileRepo.load();
  }

  connect(
    connection: ClientConnection,
    info: ConnectionInfo = {},
  ): ClientHandle {
    if (info.deviceId) {
      this.deviceIds.set(connection, info.deviceId);
    }
    return {
      receive: (data) => this.onMessage(connection, data),
      close: () => this.onClose(connection),
    };
  }

  /** One fixed physics step, the rules, a snapshot every few ticks. */
  tick(): void {
    this.expireSeats();
    if (!this.world || !this.host) {
      return;
    }
    this.world.step(1 / TICK_HZ);
    this.host.setClockPaused(this.playerAway());
    this.host.tick(1 / TICK_HZ);
    this.tickCount += 1;
    this.tickBot();
    if (this.tickCount % matchTuning.clockEveryTicks === 0) {
      const clock = this.host.clock();
      if (clock) {
        this.broadcast({ type: 'clock', ...clock });
      }
    }
    const pieceStates = this.world.snapshot(NETWORKED_PIECE_IDS);
    const nowS = this.tickCount / TICK_HZ;
    for (const p of pieceStates) {
      const v = this.world.linearVelocity(p.id);
      if (v) {
        this.impactWatch.observe(
          p.id,
          p.position,
          v,
          nowS,
          1 / TICK_HZ,
          this.pendingImpacts,
        );
      }
    }
    if (this.tickCount % SNAPSHOT_EVERY_TICKS === 0) {
      this.broadcast({
        type: 'snapshot',
        tick: this.tickCount,
        pieces: pieceStates,
      });
      if (this.pendingImpacts.length > 0) {
        this.broadcast({
          type: 'impacts',
          items: this.pendingImpacts
            .slice(0, MAX_IMPACTS_PER_MESSAGE)
            .map((i) => ({
              ...i,
              deltaVMps: Math.min(i.deltaVMps, MAX_IMPACT_DELTA_V_MPS),
            })),
        });
        this.pendingImpacts = [];
      }
    }
  }

  /** Real-time loop: catches up whole ticks from elapsed wall time, so a
   * late timer never changes the simulated dt. */
  start(): void {
    if (this.timer) {
      return;
    }
    let last = performance.now();
    let pendingS = 0;
    this.timer = setInterval(() => {
      const now = performance.now();
      pendingS = Math.min(pendingS + (now - last) / 1000, 0.25);
      last = now;
      while (pendingS >= 1 / TICK_HZ) {
        this.tick();
        pendingS -= 1 / TICK_HZ;
      }
    }, 1000 / TICK_HZ);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private async onMessage(
    connection: ClientConnection,
    data: unknown,
  ): Promise<boolean> {
    const message = parseClientMessage(data);
    if (!message) {
      if (isJoinWithOtherProtocol(data)) {
        connection.send({ type: 'rejected', reason: 'protocol' });
        connection.close();
      }
      return false;
    }
    if (message.type === 'join') {
      return this.onJoin(connection, message);
    }
    if (message.type === 'watch') {
      return this.onWatch(connection);
    }
    const seat = this.seats.find((s) => s.connection === connection);
    if (!seat || !this.host) {
      return false; // only seated players act
    }
    if (message.type === 'presence') {
      // Relay only, capped at ~40 Hz (a client sends 20 Hz).
      const now = this.nowMs();
      if (now - seat.lastPresenceMs < 25) {
        return false;
      }
      seat.lastPresenceMs = now;
      const relay: ServerMessage = {
        type: 'presence',
        side: seat.side,
        message: message.message,
      };
      for (const other of this.seats) {
        if (other !== seat) {
          other.connection?.send(relay);
        }
      }
      for (const spectator of this.spectators) {
        spectator.send(relay); // both avatars, for the TV view
      }
      return true;
    }
    if (message.type === 'signal') {
      // Voice signaling: relay to the other seat only, capped (an ICE
      // burst is tens of messages, not thousands).
      const now = this.nowMs();
      seat.recentSignalsMs = seat.recentSignalsMs.filter((t) => now - t < 1000);
      if (seat.recentSignalsMs.length >= 60) {
        return false;
      }
      seat.recentSignalsMs.push(now);
      for (const other of this.seats) {
        if (other !== seat) {
          other.connection?.send({
            type: 'signal',
            side: seat.side,
            data: message.data,
          });
        }
      }
      return true;
    }
    if (message.type === 'setGameMode') {
      if (!this.roomActionAllowed('court')) {
        return false;
      }
      return this.changeGameMode(message.gameMode, seat.side);
    }
    if (message.type === 'setTimeLimit') {
      return this.changeTimeLimit(message.minutes, seat.side);
    }
    if (message.type === 'setRules') {
      return this.changeRules(message.rules, seat.side);
    }
    if (message.type === 'setBot') {
      return this.changeBot(message.level, seat.side);
    }
    if (message.type === 'setProfile' || message.type === 'setColor') {
      // Each change writes the whole file: a click rate, not a flood.
      const now = this.nowMs();
      if (now - seat.lastProfileChangeMs < PROFILE_CHANGE_COOLDOWN_MS) {
        return false;
      }
      seat.lastProfileChangeMs = now;
    }
    if (message.type === 'setProfile') {
      if (message.name !== null && !profileNames.includes(message.name)) {
        return false; // only the menu's fixed names
      }
      this.updateProfiles(
        claimProfile(this.profiles, seat.deviceId, message.name),
      );
      seat.profileKey = profileKeyFor(this.profiles, seat.deviceId).key;
      this.log('info', 'gate', 'profile chosen', {
        side: seat.side,
        named: message.name !== null,
      });
      this.sendProfile(seat);
      this.broadcastColors();
      return true;
    }
    if (message.type === 'setColor') {
      this.updateProfiles(
        setProfileColor(this.profiles, seat.profileKey, message.colorIndex),
      );
      this.sendProfile(seat);
      this.broadcastColors();
      return true;
    }
    if (message.type === 'reset') {
      if (!this.roomActionAllowed('reset')) {
        return false;
      }
      this.log('info', 'gate', 'reset pressed', { side: seat.side });
      this.host.reset();
      return true;
    }
    if (!this.allowThrow(seat)) {
      return false;
    }
    const accepted = this.host.onThrow(seat.side, message);
    if (accepted) {
      // Flying from the next step: tick N + k shows k ticks of flight.
      seat.connection?.send({
        type: 'thrown',
        pieceId: message.pieceId,
        tick: this.tickCount,
      });
    }
    return accepted;
  }

  /** ROOM_ACTION_COOLDOWN_MS per kind of room action. */
  private roomActionAllowed(kind: 'reset' | 'court' | 'settings'): boolean {
    const now = this.nowMs();
    const last = this.lastRoomActionMs.get(kind);
    if (last !== undefined && now - last < ROOM_ACTION_COOLDOWN_MS) {
      this.log('info', 'gate', 'room action ignored (cooldown)', { kind });
      return false;
    }
    this.lastRoomActionMs.set(kind, now);
    return true;
  }

  private allowThrow(seat: Seat): boolean {
    const now = this.nowMs();
    seat.recentThrowsMs = seat.recentThrowsMs.filter((t) => now - t < 1000);
    if (seat.recentThrowsMs.length >= MAX_THROWS_PER_SECOND) {
      return false;
    }
    seat.recentThrowsMs.push(now);
    return true;
  }

  /** A spectator: every broadcast, no seat, nothing it sends counts. */
  private onWatch(connection: ClientConnection): boolean {
    if (
      this.spectators.has(connection) ||
      this.seats.some((s) => s.connection === connection)
    ) {
      return false;
    }
    if (this.spectators.size >= MAX_SPECTATORS) {
      connection.send({ type: 'rejected', reason: 'spectatorsFull' });
      connection.close();
      return false;
    }
    this.spectators.add(connection);
    this.log('info', 'gate', 'spectator joined', {
      spectators: this.spectators.size,
    });
    connection.send({
      type: 'watching',
      protocol: SERVER_PROTOCOL_VERSION,
      gameMode: this.gameMode,
    });
    connection.send(this.roomSettingsMessage());
    if (this.lastMatch) {
      connection.send(this.lastMatch);
    }
    this.broadcastColors();
    return true;
  }

  private async onJoin(
    connection: ClientConnection,
    message: Extract<ClientMessage, { type: 'join' }>,
  ): Promise<boolean> {
    if (
      this.seats.some((s) => s.connection === connection) ||
      this.spectators.has(connection)
    ) {
      return false;
    }
    this.expireSeats();
    const deviceId = this.deviceIds.get(connection) ?? message.clientId;
    let seat = this.seats.find((s) => s.clientId === message.clientId);
    if (seat) {
      seat.connection?.close(); // a second tab of the same browser wins
      seat.connection = connection;
      seat.leftAtMs = null;
      seat.seatedAtMs = this.nowMs();
      seat.deviceId = deviceId;
      seat.profileKey = this.seatProfileKey(deviceId, message);
    } else {
      // A person always beats the bot to a seat — except the idle one
      // the bot was given it from (giveIdleSeatToBot).
      if (
        this.idleClientIds.has(message.clientId) &&
        this.seats.some((s) => s.bot)
      ) {
        connection.send({ type: 'rejected', reason: 'full' });
        connection.close();
        return false;
      }
      if (this.seats.length >= SIDES.length && this.seats.some((s) => s.bot)) {
        this.removeBot('player joined');
      }
      const taken = new Set(this.seats.map((s) => s.side));
      const side = SIDES.find((s) => !taken.has(s));
      if (!side) {
        connection.send({ type: 'rejected', reason: 'full' });
        connection.close();
        return false;
      }
      seat = {
        side,
        clientId: message.clientId,
        connection,
        deviceId,
        profileKey: this.seatProfileKey(deviceId, message),
        leftAtMs: null,
        lastProfileChangeMs: -Infinity,
        recentThrowsMs: [],
        lastPresenceMs: -Infinity,
        // Counts as present from joining (SEAT_IDLE_MS).
        seatedAtMs: this.nowMs(),
        recentSignalsMs: [],
        bot: false,
      };
      this.seats.push(seat);
    }
    await this.ensureWorld(message.gameMode);
    connection.send({
      type: 'welcome',
      protocol: SERVER_PROTOCOL_VERSION,
      side: seat.side,
      gameMode: this.gameMode,
    });
    connection.send(this.roomSettingsMessage());
    this.host?.setPlayers(this.seats.map((s) => s.side));
    if (this.lastMatch) {
      connection.send(this.lastMatch);
    }
    this.sendProfile(seat);
    this.broadcastPeers();
    this.broadcastColors();
    return true;
  }

  // --- profiles ------------------------------------------------------------

  /** A seated player's profile. Only a SEATED device gets one (a
   * rejected join stores nothing), and the first time the server meets
   * a device, the headset's own colour and name seed it. */
  private seatProfileKey(
    deviceId: string,
    message: Extract<ClientMessage, { type: 'join' }>,
  ): string {
    if (!isKnownDevice(this.profiles, deviceId)) {
      const name =
        message.profileName && profileNames.includes(message.profileName)
          ? message.profileName
          : null;
      let store = name
        ? claimProfile(this.profiles, deviceId, name)
        : this.profiles;
      const key = profileKeyFor(store, deviceId).key;
      // A named profile that already exists keeps its own colour; the
      // default colour 0 needs nothing stored.
      const keepsOwnColour = this.profiles.profiles[key] !== undefined;
      if (
        message.colorIndex !== undefined &&
        message.colorIndex !== 0 &&
        !keepsOwnColour
      ) {
        store = setProfileColor(store, key, message.colorIndex);
      }
      this.updateProfiles(store);
    }
    return profileKeyFor(this.profiles, deviceId).key;
  }

  private updateProfiles(next: ProfileStore): void {
    if (next === this.profiles) {
      return;
    }
    this.profiles = next;
    try {
      this.profileRepo.save(next);
    } catch (error) {
      // A full disk must not stop the game; the profiles stay in memory.
      this.log('warn', 'net', 'profile save failed', { error: String(error) });
    }
  }

  private sendProfile(seat: Seat): void {
    seat.connection?.send({
      type: 'profile',
      ...clientProfile(this.profiles, seat.profileKey),
    });
  }

  /** The colours the room shows: each seat's choice, a clash resolved
   * in side B's disfavour (core/avatarColors.ts). */
  private broadcastColors(): void {
    const choice = (side: MatchSide): number | null => {
      const seat = this.seats.find((s) => s.side === side);
      if (seat?.bot) {
        return botTuning.colorIndex;
      }
      return seat
        ? clientProfile(this.profiles, seat.profileKey).colorIndex
        : null;
    };
    const host = choice('host');
    const guest = choice('guest');
    let shown = { host, guest };
    if (host !== null && guest !== null) {
      const fromHost = shownAvatarColors({
        mine: host,
        theirs: guest,
        mySide: 'host',
        paletteSize: avatarPalette.length,
      });
      shown = { host: fromHost.mine, guest: fromHost.theirs };
    }
    this.broadcast({ type: 'colors', ...shown });
    // The spectators' scoreboard: names with those shown colours.
    const player = (side: MatchSide, colorIndex: number | null) => {
      const seat = this.seats.find((s) => s.side === side);
      if (seat?.bot && colorIndex !== null && this.botLevel !== null) {
        return { name: null, colorIndex, bot: this.botLevel };
      }
      // A seat waiting out its rejoin grace is shown as empty (its
      // avatar would otherwise stand frozen on the spectators' screen).
      return seat?.connection && colorIndex !== null
        ? {
            name: clientProfile(this.profiles, seat.profileKey).name,
            colorIndex,
          }
        : null;
    };
    this.broadcast({
      type: 'players',
      host: player('host', shown.host),
      guest: player('guest', shown.guest),
    });
  }

  /** gh#16 semantics on the server: a round counts for its thrower. */
  private recordRound(report: RoundReport): void {
    const seat = this.seats.find((s) => s.side === report.side);
    if (!seat || seat.bot) {
      return; // the bot keeps no profile
    }
    this.updateProfiles(
      recordRoundFor(this.profiles, seat.profileKey, {
        result: report.result,
        sticksThrownThisRound: report.sticksThrownThisRound,
        longestThrowThisRoundM: report.longestThrowM,
        longestFellingThrowThisRoundM: report.longestFellingThrowM,
        roundDurationS: report.roundDurationS,
      }),
    );
    // gh#16 on the server: the round lands in its THROWER's profile.
    this.log('info', 'gate', 'round recorded', { side: report.side });
    this.sendProfile(seat);
  }

  /** A finished match goes into both players' head-to-head, once. */
  private recordMatch(state: MatchState | null): void {
    if (!state || state.winner === null) {
      this.matchRecorded = false; // a new match (or practice)
      return;
    }
    if (this.matchRecorded) {
      return;
    }
    const winner = this.seats.find((s) => s.side === state.winner);
    const loser = this.seats.find((s) => s.side !== state.winner);
    if (!winner || !loser) {
      return;
    }
    if (winner.bot || loser.bot) {
      // Head-to-head is between people; the bot has its own record, per
      // level, in the person's profile.
      this.matchRecorded = true;
      const person = winner.bot ? loser : winner;
      if (this.botLevel !== null && !person.bot) {
        this.updateProfiles(
          recordBotResult(
            this.profiles,
            person.profileKey,
            this.botLevel,
            person === winner,
          ),
        );
        this.sendProfile(person);
      }
      this.log('info', 'gate', 'bot match recorded', {
        winner: state.winner,
        level: this.botLevel,
      });
      return;
    }
    this.matchRecorded = true;
    this.updateProfiles(
      recordMatchResult(this.profiles, winner.profileKey, loser.profileKey),
    );
    this.log('info', 'gate', 'match result recorded', { winner: state.winner });
    this.sendProfile(winner);
    this.sendProfile(loser);
  }

  private async ensureWorld(gameMode: Settings['gameMode']): Promise<void> {
    if (!this.worldPromise) {
      this.gameMode = gameMode;
      this.worldPromise = createPhysicsWorld(courtPresetForMode(gameMode));
    }
    const pending = this.worldPromise;
    let world: PhysicsWorld;
    try {
      world = await pending;
    } catch (error) {
      // A failed build must not brick the room: the next join retries.
      if (this.worldPromise === pending) {
        this.worldPromise = null;
      }
      this.log('warn', 'net', 'physics world build failed', {
        error: String(error),
      });
      throw error;
    }
    // The room may have emptied (and a new world been started) while
    // this one was building — only the CURRENT promise may install.
    if (this.world === world) {
      return;
    }
    if (this.worldPromise !== pending) {
      world.dispose(); // built for a room that emptied meanwhile
      return;
    }
    this.world = world;
    this.impactWatch.reset();
    this.pendingImpacts = [];
    this.host = new MatchHost(world, this.gameMode, {
      matchState: (state) => {
        this.matchState = state;
        if (isFreshMatch(state)) {
          // A new match (restart, Ny runda, court): the bot starts over,
          // with its turn-start pause.
          this.botMemory = freshBotMemory();
        }
        this.lastMatch = { type: 'match', state };
        this.broadcast(this.lastMatch);
        this.recordMatch(state);
      },
      roundEnded: (report) => {
        this.broadcast({ type: 'round', ...report });
        this.recordRound(report);
      },
      notice: (kind, side) => {
        this.broadcast({ type: 'notice', kind, side });
      },
      gate: (gateMessage, data) => {
        this.log('info', 'gate', gateMessage, data);
      },
    });
    this.host.setTimeLimit(this.timeLimitMin);
    this.host.setSimplified(this.rules === 'simplified');
  }

  /** A room setting: the court. Rebuild the world on the new preset and
   * start afresh — both players get `room` and then the new match. */
  private async changeGameMode(
    gameMode: Settings['gameMode'],
    by: MatchSide,
  ): Promise<boolean> {
    if (gameMode === this.gameMode || !this.world) {
      return false;
    }
    this.log('info', 'gate', 'room game mode changed', { gameMode, by });
    this.world.dispose();
    this.world = null;
    this.host = null;
    this.worldPromise = null;
    this.lastMatch = null;
    this.broadcast({ type: 'room', gameMode });
    await this.ensureWorld(gameMode);
    // Re-read after the await (TS still narrows it to the null set above).
    const host = this.host as MatchHost | null;
    host?.setPlayers(this.seats.map((s) => s.side));
    return true;
  }

  private roomSettingsMessage(): ServerMessage {
    return {
      type: 'roomSettings',
      timeLimitMin: this.timeLimitMin,
      bot: this.botLevel,
      rules: this.rules,
    };
  }

  /** A room setting: the match time limit (src/data/match.json choices). */
  private changeTimeLimit(minutes: number, by: MatchSide): boolean {
    if (
      !matchTuning.timeLimitChoicesMin.includes(minutes) ||
      minutes === this.timeLimitMin
    ) {
      return false;
    }
    if (isMatchUnderway(this.matchState)) {
      // Locked mid-match: no shortening the limit while ahead.
      this.log('info', 'gate', 'time limit locked (match underway)', { by });
      return false;
    }
    if (!this.roomActionAllowed('settings')) {
      return false;
    }
    this.timeLimitMin = minutes;
    this.host?.setTimeLimit(minutes);
    this.log('info', 'gate', 'room time limit changed', { minutes, by });
    this.broadcast(this.roomSettingsMessage());
    return true;
  }

  /** A room setting: standard or simplified rules. Locked like the time
   * limit while a match is underway; the match host builds the next
   * match with them (a fresh one switches at once). */
  private changeRules(rules: RoomRules, by: MatchSide): boolean {
    if (rules === this.rules) {
      return false;
    }
    if (isMatchUnderway(this.matchState)) {
      this.log('info', 'gate', 'rules locked (match underway)', { by });
      return false;
    }
    if (!this.roomActionAllowed('settings')) {
      return false;
    }
    this.rules = rules;
    this.host?.setSimplified(rules === 'simplified');
    this.log('info', 'gate', 'room rules changed', { rules, by });
    this.broadcast(this.roomSettingsMessage());
    return true;
  }

  /** A room setting: a bot in the free seat (or a new level for the one
   * seated), or no bot. Refused while both seats hold people who are
   * there; a seat idle for SEAT_IDLE_MS is given to the bot. */
  private changeBot(level: BotLevel | null, by: MatchSide): boolean {
    if (level === this.botLevel || !this.roomActionAllowed('settings')) {
      return false;
    }
    if (level === null) {
      this.removeBot('switched off');
      return true;
    }
    const seated = this.seats.find((s) => s.bot);
    if (!seated) {
      const now = this.nowMs();
      const idle = this.seats.find(
        (s) =>
          !s.bot &&
          s.side !== by &&
          // A dropped seat counts too, but only after the same idle time:
          // a reloading headset is back within seconds (REJOIN_GRACE_MS).
          now - Math.max(s.lastPresenceMs, s.seatedAtMs) > SEAT_IDLE_MS,
      );
      if (this.seats.length >= SIDES.length && idle) {
        this.giveIdleSeatToBot(idle);
      }
      const taken = new Set(this.seats.map((s) => s.side));
      const side = SIDES.find((s) => !taken.has(s));
      if (!side) {
        this.log('info', 'gate', 'bot refused (room full)', { by });
        return false;
      }
      this.seats.push({
        side,
        clientId: 'bot',
        connection: null,
        deviceId: 'bot',
        profileKey: 'bot',
        leftAtMs: null,
        lastProfileChangeMs: -Infinity,
        recentThrowsMs: [],
        lastPresenceMs: -Infinity,
        seatedAtMs: this.nowMs(),
        recentSignalsMs: [],
        bot: true,
      });
      this.botMemory = freshBotMemory();
      this.botRng = createRng(Math.floor(this.nowMs()) || 1);
    }
    this.botLevel = level;
    this.log('info', 'gate', 'bot seated', {
      level,
      side: this.seats.find((s) => s.bot)?.side,
      by,
    });
    this.host?.setPlayers(this.seats.map((s) => s.side));
    this.broadcast(this.roomSettingsMessage());
    this.broadcastPeers();
    this.broadcastColors();
    return true;
  }

  /** An idle seat is cleared for the bot; its client is told the room
   * is full and, while the bot sits, may not take a seat back. */
  private giveIdleSeatToBot(seat: (typeof this.seats)[number]): void {
    this.log('info', 'gate', 'idle seat given to the bot', {
      side: seat.side,
    });
    seat.connection?.send({ type: 'rejected', reason: 'full' });
    seat.connection?.close();
    this.seats = this.seats.filter((s) => s !== seat);
    this.idleClientIds.add(seat.clientId);
  }

  /** A person's seat is held for a rejoin: the match waits for them. */
  private playerAway(): boolean {
    return this.seats.some((s) => !s.bot && s.connection === null);
  }

  /** The court's halves, cached per court (read every tick). */
  private botHalves(): CourtHalves {
    if (this.halvesCache?.gameMode !== this.gameMode) {
      this.halvesCache = {
        gameMode: this.gameMode,
        halves: courtHalves(getCourtPreset(courtPresetForMode(this.gameMode))),
      };
    }
    return this.halvesCache.halves;
  }

  private removeBot(why: string): void {
    const before = this.seats.length;
    this.seats = this.seats.filter((s) => !s.bot);
    this.botLevel = null;
    this.idleClientIds.clear();
    if (this.seats.length === before) {
      return;
    }
    this.log('info', 'gate', 'bot left', { why });
    this.host?.setPlayers(this.seats.map((s) => s.side));
    this.broadcast(this.roomSettingsMessage());
    this.broadcastPeers();
    this.broadcastColors();
  }

  /** One tick of the bot: its avatar now and then, and a release when
   * core/botBrain.ts says it is time. */
  private tickBot(): void {
    const seat = this.seats.find((s) => s.bot);
    if (!seat || !this.host || !this.world || this.botLevel === null) {
      return;
    }
    const halves = this.botHalves();
    if (this.tickCount % botTuning.presenceEveryTicks === 0) {
      const relay: ServerMessage = {
        type: 'presence',
        side: seat.side,
        message: botPresence(
          seat.side,
          halves.farBaselineZ,
          botTuning.colorIndex,
        ),
      };
      for (const other of this.seats) {
        other.connection?.send(relay);
      }
      for (const spectator of this.spectators) {
        spectator.send(relay);
      }
    }
    const state = this.matchState;
    if (!state || this.playerAway()) {
      return; // the bot waits for its opponent to come back
    }
    const myTurn = state.currentTurn === seat.side;
    this.botPositions.clear();
    if (myTurn) {
      for (const p of this.world.snapshot(NETWORKED_PIECE_IDS)) {
        this.botPositions.set(p.id, p.position);
      }
    }
    const step = botStep(
      this.botMemory,
      {
        state,
        side: seat.side,
        halves,
        positions: this.botPositions,
        racked: myTurn ? this.host.rackedSticks() : [],
        stickInFlight: myTurn && this.host.stickInFlight(),
        nowS: this.tickCount / TICK_HZ,
      },
      { ...botTuning, ...botTuning.levels[this.botLevel] },
      this.botRng,
    );
    this.botMemory = step.memory;
    const action = step.action;
    if (!action) {
      return;
    }
    const accepted = this.host.onThrow(seat.side, {
      pieceId: action.pieceId,
      position: action.from,
      quaternion: [0, 0, 0, 1],
      linearVelocity: action.velocity,
      angularVelocity: action.spin,
    });
    if (!accepted) {
      this.botMemory = forgetBotToss(this.botMemory, action.pieceId);
    }
  }

  private onClose(connection: ClientConnection): void {
    if (this.spectators.delete(connection)) {
      return;
    }
    const seat = this.seats.find((s) => s.connection === connection);
    if (!seat) {
      return;
    }
    seat.connection = null;
    seat.leftAtMs = this.nowMs();
    this.broadcastPeers();
    this.broadcastColors(); // the spectators' scoreboard and avatars
  }

  /** Free the seats of players gone longer than the grace; drop the
   * world once nobody is left. */
  private expireSeats(): void {
    const now = this.nowMs();
    const before = this.seats.length;
    this.seats = this.seats.filter(
      (s) => s.leftAtMs === null || now - s.leftAtMs < REJOIN_GRACE_MS,
    );
    if (this.seats.length === before) {
      return;
    }
    if (this.seats.every((s) => s.bot)) {
      // Nobody left to play the bot: the room starts over (spectators
      // are told; they stay connected).
      this.seats = [];
      this.botLevel = null;
      this.idleClientIds.clear();
      this.timeLimitMin = 0;
      this.rules = 'standard';
      this.broadcast(this.roomSettingsMessage());
    }
    if (this.seats.length === 0) {
      this.world?.dispose();
      this.world = null;
      this.host = null;
      this.worldPromise = null;
      this.lastMatch = null;
      this.tickCount = 0;
      return;
    }
    this.host?.setPlayers(this.seats.map((s) => s.side));
    this.broadcastPeers();
    this.broadcastColors();
  }

  private broadcastPeers(): void {
    this.peersGeneration += 1;
    this.broadcast({
      type: 'peers',
      count: this.seats.filter((s) => s.connection !== null || s.bot).length,
      generation: this.peersGeneration,
    });
  }

  private broadcast(message: ServerMessage): void {
    for (const seat of this.seats) {
      seat.connection?.send(message);
    }
    for (const spectator of this.spectators) {
      spectator.send(message);
    }
  }
}

function isJoinWithOtherProtocol(data: unknown): boolean {
  return (
    typeof data === 'object' &&
    data !== null &&
    (data as { type?: unknown }).type === 'join' &&
    (data as { protocol?: unknown }).protocol !== SERVER_PROTOCOL_VERSION
  );
}
