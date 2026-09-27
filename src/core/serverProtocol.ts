import { z } from 'zod';
import { matchStateSchema } from './matchSync.js';
import { presenceMessageSchema } from './presence.js';
import { gameModeSchema } from './settings.js';

/**
 * MP5 (docs/superpowers/specs/2026-09-26-authoritative-server-design.md):
 * the WebSocket protocol between the authoritative game server
 * (`server/`) and every headset. Shared by both ends; parsed with zod on
 * BOTH sides — the server treats clients as untrusted, and a client
 * treats a malformed server message as a bug to drop, never a crash.
 * One JSON object per WebSocket message, discriminated by `type`.
 */
/** v2 (MP6): join carries a clientId; reset, match and round messages. */
export const SERVER_PROTOCOL_VERSION = 2;
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

const clientMessageSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('join'),
    protocol: z.literal(SERVER_PROTOCOL_VERSION),
    gameMode: gameModeSchema,
    /** A per-browser id (localStorage) — a reloading headset rejoining
     * within the grace gets its side back and the match continues. */
    clientId: z.string().min(8).max(64),
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
  z.object({ type: z.literal('peers'), count: z.number().int().nonnegative() }),
  /** The other player's head + hands, for PeerAvatarSystem. */
  z.object({
    type: z.literal('presence'),
    side,
    message: presenceMessageSchema,
  }),
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
  /** The room is full or the protocol does not match. */
  z.object({
    type: z.literal('rejected'),
    reason: z.enum(['full', 'protocol']),
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
