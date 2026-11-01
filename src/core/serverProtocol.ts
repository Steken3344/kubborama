import { z } from 'zod';
import { botLevelSchema } from './botLevel.js';
import { botRecordSchema } from './profiles.js';
import { matchStateSchema } from './matchSync.js';
import { MAX_COLOR_INDEX, presenceMessageSchema } from './presence.js';
import { MAX_HEAD_TO_HEAD } from './profiles.js';
import { gameModeSchema } from './settings.js';
import { statsSchema } from './stats.js';

/**
 * MP5 (docs/superpowers/specs/2026-09-26-authoritative-server-design.md):
 * the WebSocket protocol between the authoritative game server
 * (`server/`) and every headset. Shared by both ends; parsed with zod on
 * BOTH sides — the server treats clients as untrusted, and a client
 * treats a malformed server message as a bug to drop, never a crash.
 * One JSON object per WebSocket message, discriminated by `type`.
 */
/** v2 (MP6): join carries a clientId; reset, match and round messages.
 * v3 (2026-10-31): server-owned profiles (setProfile, setColor →
 * profile, colors), notices (foot faults) and spectators (watch →
 * watching, players). */
/** v4 (2026-11-01): room settings (setTimeLimit, setBot → roomSettings),
 * the match clock, `players.bot` and endReason 'timeLimit' — an old
 * client would drop a time-limit result, so it must reload. */
export const SERVER_PROTOCOL_VERSION = 4;
/** The server's fixed simulation rate, and every how many ticks it
 * sends a snapshot (→ 20 Hz). Shared: the client interpolates in ticks
 * (core/snapshotBuffer.ts). */
export const TICK_HZ = 60;
export const SNAPSHOT_EVERY_TICKS = 3;
/** The WebSocket path on the dev server (and later the cloud server). */
export const SERVER_PATH = '/__kubb/game';

const finite = z.number().finite();
const vec3 = z.tuple([finite, finite, finite]);
/** Bounded components (review, 2026-09-26): a finite-but-absurd value
 * would still destabilise the shared Havok world for every player. The
 * whole scene fits in ±20 m; a strong real throw is ~12 m/s and
 * ~40 rad/s. */
const bounded = (limit: number) => z.number().min(-limit).max(limit);
const positionVec = z.tuple([bounded(20), bounded(20), bounded(20)]);
const linearVec = z.tuple([bounded(30), bounded(30), bounded(30)]);
const angularVec = z.tuple([bounded(100), bounded(100), bounded(100)]);
const quat = z.tuple([finite, finite, finite, finite]);
// Scene ids are short (`stick-5`, `kubb-9`, `king`); a long one is garbage.
const pieceId = z.string().min(1).max(32);
const side = z.enum(['host', 'guest']);
const colorIndex = z.number().int().min(0).max(MAX_COLOR_INDEX);
/** A profile name from the menu's fixed list (the server checks the
 * list itself) — short, never free text. */
const profileName = z.string().min(1).max(24);
export { botLevelSchema } from './botLevel.js';
export type { BotLevelName } from './botLevel.js';
/** A room time limit in whole minutes; 0 = none (src/data/match.json). */
const timeLimitMin = z.number().int().min(0).max(120);
/** WebRTC voice signaling, relayed by the server between the two seats
 * (the server "introduces" the headsets — no Trystero/Nostr). Bounded:
 * an audio-only SDP is a few kB. */
const voiceSignal = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('offer'), sdp: z.string().max(20_000) }),
  z.object({ kind: z.literal('answer'), sdp: z.string().max(20_000) }),
  z.object({
    kind: z.literal('ice'),
    candidate: z.string().max(2_000),
    sdpMid: z.string().max(64).nullable(),
    sdpMLineIndex: z.number().int().nonnegative().max(64).nullable(),
  }),
]);
export type VoiceSignal = z.infer<typeof voiceSignal>;

const clientMessageSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('join'),
    protocol: z.literal(SERVER_PROTOCOL_VERSION),
    gameMode: gameModeSchema,
    /** A per-browser id (localStorage) — a reloading headset rejoining
     * within the grace gets its side back and the match continues. */
    clientId: z.string().min(8).max(64),
    /** The headset's own colour and name (v3): they seed its profile
     * the first time the server meets this device, so nothing chosen
     * before is lost. */
    colorIndex: colorIndex.optional(),
    profileName: profileName.nullable().optional(),
  }),
  /** A browser outside VR: watch the room without taking a seat
   * (docs/superpowers/specs/2026-10-31-spectator-tv-design.md). */
  z.object({
    type: z.literal('watch'),
    protocol: z.literal(SERVER_PROTOCOL_VERSION),
  }),
  /** "Ny runda". */
  z.object({ type: z.literal('reset') }),
  /** This player's head + hands (~20 Hz), relayed to the other player
   * for the avatar — the Trystero route proved unreliable (MP7). */
  z.object({ type: z.literal('presence'), message: presenceMessageSchema }),
  /** A released stick (or kubb) — the throwRelay v2 shape. */
  z.object({
    type: z.literal('throw'),
    pieceId,
    position: positionVec,
    quaternion: quat,
    linearVelocity: linearVec,
    angularVelocity: angularVec,
  }),
  z.object({ type: z.literal('signal'), data: voiceSignal }),
  /** A room setting both players share: the court (game mode). */
  z.object({ type: z.literal('setGameMode'), gameMode: gameModeSchema }),
  /** Play as this named profile (null: this device's anonymous one). */
  z.object({ type: z.literal('setProfile'), name: profileName.nullable() }),
  /** This player's chosen avatar colour, kept in their profile. */
  z.object({ type: z.literal('setColor'), colorIndex }),
  /** Room setting: the match time limit (0 = none). */
  z.object({ type: z.literal('setTimeLimit'), minutes: timeLimitMin }),
  /** Room setting: a bot in the free seat at this level, or none. */
  z.object({ type: z.literal('setBot'), level: botLevelSchema.nullable() }),
]);
export type ClientMessage = z.infer<typeof clientMessageSchema>;

const pieceTransform = z.object({
  id: pieceId,
  position: vec3,
  quaternion: quat,
});
export type ServerPieceTransform = z.infer<typeof pieceTransform>;

const serverMessageSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('welcome'),
    protocol: z.literal(SERVER_PROTOCOL_VERSION),
    /** Player A = 'host', player B = 'guest' — the side, not the authority
     * (the server is always the authority). */
    side,
    /** The room's court — a later joiner plays on it (like gh#15). */
    gameMode: gameModeSchema,
  }),
  z.object({
    type: z.literal('snapshot'),
    tick: z.number().int().nonnegative(),
    pieces: z.array(pieceTransform).max(64),
  }),
  /** Seated, connected players. `generation` changes on EVERY seat
   * change (join, leave, a reconnect taking a seat over) — so side A can
   * tell "B came back" even when the count stays 2 (review, 2026-10-31). */
  z.object({
    type: z.literal('peers'),
    count: z.number().int().nonnegative(),
    generation: z.number().int().nonnegative(),
  }),
  /** The other player's head + hands, for PeerAvatarSystem. */
  z.object({
    type: z.literal('presence'),
    side,
    message: presenceMessageSchema,
  }),
  /** The room's shared settings changed (a player switched the court);
   * every client adopts it — a fresh match on the new court follows. */
  z.object({ type: z.literal('room'), gameMode: gameModeSchema }),
  /** The other player's voice signaling (offer / answer / ICE). */
  z.object({ type: z.literal('signal'), side, data: voiceSignal }),
  /** The match (null = practice: fewer than two players). */
  z.object({ type: z.literal('match'), state: matchStateSchema.nullable() }),
  /** A finished round — the RoundEnded payload plus who threw it. */
  z.object({
    type: z.literal('round'),
    side,
    result: z.object({
      roundNumber: z.number().int().positive(),
      kubbsFelled: z.number().int().nonnegative(),
      kingFelled: z.boolean(),
      sticksThrownWhenKingFelled: z.number().int().nonnegative().nullable(),
    }),
    sticksThrownThisRound: z.number().int().nonnegative(),
    longestThrowM: finite,
    longestFellingThrowM: finite.nullable(),
    roundDurationS: finite,
  }),
  /** This player's own profile (on join, and after every change). */
  z.object({
    type: z.literal('profile'),
    name: profileName.nullable(),
    colorIndex,
    stats: statsSchema,
    headToHead: z
      .array(
        z.object({
          opponentName: profileName.nullable(),
          won: z.number().int().nonnegative(),
          lost: z.number().int().nonnegative(),
        }),
      )
      .max(MAX_HEAD_TO_HEAD),
    botRecord: botRecordSchema.optional(),
  }),
  /** The colours the room SHOWS for each side — a clash already
   * resolved (core/avatarColors.ts); null for an empty seat. */
  z.object({
    type: z.literal('colors'),
    host: colorIndex.nullable(),
    guest: colorIndex.nullable(),
  }),
  /** A spectator is in: it gets every broadcast from now on. */
  z.object({
    type: z.literal('watching'),
    protocol: z.literal(SERVER_PROTOCOL_VERSION),
    gameMode: gameModeSchema,
  }),
  /** Who is seated, for the spectators' scoreboard (shown colours). */
  z.object({
    type: z.literal('players'),
    host: z
      .object({
        name: profileName.nullable(),
        colorIndex,
        bot: botLevelSchema.optional(),
      })
      .nullable(),
    guest: z
      .object({
        name: profileName.nullable(),
        colorIndex,
        bot: botLevelSchema.optional(),
      })
      .nullable(),
  }),
  /** The room's own settings beside the court: sent on joining/watching
   * and whenever one changes. */
  z.object({
    type: z.literal('roomSettings'),
    timeLimitMin,
    bot: botLevelSchema.nullable(),
  }),
  /** To the thrower: the server tick its release started flying on —
   * the client shows its own stick on that time line
   * (core/throwHandover.ts). */
  z.object({
    type: z.literal('thrown'),
    pieceId,
    tick: z.number().int().nonnegative(),
  }),
  /** The match clock under a time limit, about once a second. */
  z.object({
    type: z.literal('clock'),
    remainingS: z.number().min(0).max(7200),
    timeUp: z.boolean(),
  }),
  /** Something both players should see — a foot fault by `side`. */
  z.object({
    type: z.literal('notice'),
    kind: z.literal('footFault'),
    side,
  }),
  /** The room is full or the protocol does not match. */
  z.object({
    type: z.literal('rejected'),
    reason: z.enum(['full', 'protocol', 'spectatorsFull']),
  }),
]);
export type ServerMessage = z.infer<typeof serverMessageSchema>;

export function buildServerMessage(message: ServerMessage): ServerMessage {
  return message;
}

/** Never throws — untrusted network boundary (CLAUDE.md). */
export function parseClientMessage(data: unknown): ClientMessage | null {
  const result = clientMessageSchema.safeParse(data);
  return result.success ? result.data : null;
}

export function parseServerMessage(data: unknown): ServerMessage | null {
  const result = serverMessageSchema.safeParse(data);
  return result.success ? result.data : null;
}
