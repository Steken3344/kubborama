import { Grabbed } from '@iwsdk/core';
import type { Entity, PhysicsSystem } from '@iwsdk/core';
import type { PieceTransform } from '../core/pieceSync.js';

/**
 * Applies an authoritative snapshot (the Trystero host's pieceSync, or
 * the MP5 game server's) to this client's copies of the pieces. A piece
 * the LOCAL player is holding is skipped — a stale snapshot would fight
 * their own hand-tracking while aiming. `onApply` lets a caller trace
 * what it applied (debug mode).
 */
export function applyPieceTransforms(
  physicsSystem: PhysicsSystem,
  entitiesById: ReadonlyMap<string, Entity>,
  pieces: readonly PieceTransform[],
  onApply?: (piece: PieceTransform) => void,
): void {
  for (const piece of pieces) {
    const entity = entitiesById.get(piece.id);
    if (!entity || entity.hasComponent(Grabbed)) {
      continue;
    }
    onApply?.(piece);
    physicsSystem.setBodyTransform(entity, {
      position: piece.position,
      quaternion: piece.quaternion,
    });
  }
}
