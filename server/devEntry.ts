/// <reference types="node" />
import type { Server as HttpServer } from 'node:http';
import type { Http2SecureServer } from 'node:http2';
import { SERVER_PATH } from '../src/core/serverProtocol.js';
import { GameServer } from './gameServer.js';
import { attachGameWebSocket } from './wsServer.js';

/** Started by the `kubb-game-server` Vite plugin (vite.config.ts) via
 * ssrLoadModule, so src/core imports resolve exactly as in the app. */
export function startDevGameServer(
  httpServer: HttpServer | Http2SecureServer,
): GameServer {
  const game = new GameServer();
  const wss = attachGameWebSocket(httpServer, game);
  game.start();
  // Vite restarts (config edits) close this httpServer and build a new
  // one — stop this instance with it, or its timer and world would keep
  // running forever (review, 2026-09-26).
  httpServer.once('close', () => {
    game.stop();
    wss.close();
  });
  console.log(`[kubb-server] game server listening on ${SERVER_PATH}`);
  return game;
}
