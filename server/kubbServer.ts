/// <reference types="node" />
import { createServer as createHttpServer } from 'node:http';
import type { Server as HttpServer } from 'node:http';
import { createServer as createHttpsServer } from 'node:https';
import type { AddressInfo } from 'node:net';
import { GameServer } from './gameServer.js';
import type { GameServerOptions } from './gameServer.js';
import { createKubbRequestHandler } from './httpRoutes.js';
import { attachGameWebSocket } from './wsServer.js';

export interface KubbServerOptions {
  port: number;
  host?: string;
  /** PEM key + certificate; omit for plain HTTP (tests only — WebXR on a
   * headset needs HTTPS outside localhost). */
  tls?: { key: string; cert: string };
  staticDir: string;
  logPath: string;
  room: string;
  game?: GameServerOptions;
}

export interface RunningKubbServer {
  port: number;
  game: GameServer;
  close(): Promise<void>;
}

/**
 * One address for everything (docs/superpowers/specs/2026-10-31-one-
 * address-server-design.md): the built game, /__kubb/config.json,
 * /__kubb/log and the game WebSocket, on a single HTTP(S) server.
 * Testable: `port: 0` + no TLS boots it on a random local port.
 */
export async function startKubbServer(
  options: KubbServerOptions,
): Promise<RunningKubbServer> {
  const handler = createKubbRequestHandler({
    staticDir: options.staticDir,
    logPath: options.logPath,
    room: options.room,
    debug: true,
  });
  const http: HttpServer = options.tls
    ? createHttpsServer(
        { key: options.tls.key, cert: options.tls.cert },
        handler,
      )
    : createHttpServer(handler);
  const game = new GameServer(options.game);
  const wss = attachGameWebSocket(http, game);
  game.start();
  await new Promise<void>((done, fail) => {
    http.once('error', fail); // e.g. EADDRINUSE — reported by the caller
    http.listen(options.port, options.host ?? '0.0.0.0', () => {
      http.off('error', fail);
      done();
    });
  });
  return {
    port: (http.address() as AddressInfo).port,
    game,
    close: () =>
      new Promise<void>((done) => {
        game.stop();
        for (const client of wss.clients) {
          client.terminate();
        }
        wss.close();
        http.close(() => done());
      }),
  };
}
