/// <reference types="node" />
import type { Server as HttpServer } from 'node:http';
import type { Http2SecureServer } from 'node:http2';
import { WebSocketServer } from 'ws';
import { SERVER_PATH } from '../src/core/serverProtocol.js';
import type { GameServer } from './gameServer.js';

/** Largest client message we accept — a throw is ~250 bytes. */
const MAX_PAYLOAD_BYTES = 16 * 1024;

/**
 * MP5: the WebSocket transport for the game server, attached to an
 * existing HTTP(S) server (in development: Vite's own, so `wss://` works
 * on the LAN with the dev certificate). Only upgrades on SERVER_PATH are
 * taken; every other upgrade (Vite HMR, the IWSDK MCP bridge) is left to
 * its owner. Messages are JSON; anything unparsable is dropped — the
 * GameServer validates the rest with zod.
 */
export function attachGameWebSocket(
  httpServer: HttpServer | Http2SecureServer,
  game: GameServer,
): WebSocketServer {
  const wss = new WebSocketServer({
    noServer: true,
    maxPayload: MAX_PAYLOAD_BYTES,
  });
  httpServer.on('upgrade', (request, socket, head) => {
    const path = (request.url ?? '').split('?')[0];
    if (path !== SERVER_PATH) {
      return;
    }
    wss.handleUpgrade(request, socket, head, (ws) => {
      const handle = game.connect({
        send: (message) => {
          ws.send(JSON.stringify(message));
        },
        close: () => {
          ws.close();
        },
      });
      ws.on('message', (raw) => {
        let data: unknown;
        try {
          data = JSON.parse(String(raw));
        } catch {
          return;
        }
        void handle.receive(data);
      });
      ws.on('close', () => {
        handle.close();
      });
    });
  });
  return wss;
}
