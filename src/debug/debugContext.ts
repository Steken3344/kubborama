import type { Vec3 } from '../core/vec3.js';

export type DebugRole = 'solo' | 'host' | 'guest';

export interface PieceSyncTrace {
  position: Vec3;
  atMs: number;
}

/**
 * Debug mode's shared, mutable context — the same module-state pattern
 * as settingsState.ts. `enabled` is set once at startup by
 * src/debug/debugRelay.ts (URL `?debug=1`, dev server only); systems
 * that want to leave extra breadcrumbs check it first so debug mode
 * costs nothing when off. `role` is kept current by MultiplayerSystem
 * so every shipped log line says which headset it came from; the
 * pieceSync trace is what DebugWatchSystem correlates a stick found
 * under the ground against (Erik, 2026-09-05: "pinnarna hamnar ibland
 * under marken vid gästen").
 */
export const debugContext: {
  enabled: boolean;
  clientId: string;
  role: DebugRole;
  /** Last host snapshot applied per piece id — guest side only. */
  lastPieceSync: Map<string, PieceSyncTrace>;
  /** entity.index → scene id (`stick-3`, `kubb-7`, `king`), filled by
   * MultiplayerSystem.init() so debug lines can name pieces. */
  pieceIdByEntityIndex: Map<number, string>;
} = {
  enabled: false,
  clientId: Math.random().toString(36).slice(2, 8),
  role: 'solo',
  lastPieceSync: new Map(),
  pieceIdByEntityIndex: new Map(),
};
