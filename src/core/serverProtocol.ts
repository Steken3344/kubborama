import { z } from 'zod';
import { gameModeSchema } from './settings.js';

/**
 * MP5 (docs/superpowers/specs/2026-09-26-authoritative-server-design.md):
 * the WebSocket protocol between the authoritative game server
 * (`server/`) and every headset. Shared by both ends; parsed with zod on
 * BOTH sides — the server treats clients as untrusted, and a client
 * treats a malformed server message as a bug to drop, never a crash.
 * One JSON object per WebSocket message, discriminated by `type`.
 */
export const SERVER_PROTOCOL_VERSION = 1;

const finite = z.number().finite();
const vec3 = z.tuple([finite, finite, finite]);
const quat = z.tuple([finite, finite, finite, finite]);
// Scene ids are short (`stick-5`, `kubb-9`, `king`); a long one is garbage.
const pieceId = z.string().min(1).max(32);
const side = z.enum(['host', 'guest']);

const clientMessageSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('join'),
    protocol: z.literal(SERVER_PROTOCOL_VERSION),
    gameMode: gameModeSchema,
  }),
  /** A released stick (or kubb) — the throwRelay v2 shape. */
  z.object({
    type: z.literal('throw'),
    pieceId,
    position: vec3,
    quaternion: quat,
    linearVelocity: vec3,
    angularVelocity: vec3,
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
  }),
  z.object({
    type: z.literal('snapshot'),
    tick: z.number().int().nonnegative(),
    pieces: z.array(pieceTransform).max(64),
  }),
  z.object({ type: z.literal('peers'), count: z.number().int().nonnegative() }),
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
