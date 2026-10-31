/// <reference types="node" />
import { randomUUID } from 'node:crypto';
import { appendFileSync, createReadStream, mkdirSync, statSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { dirname, extname, join, normalize, resolve, sep } from 'node:path';
import { SERVER_PROTOCOL_VERSION } from '../src/core/serverProtocol.js';

/** The routes every KubbOrama server answers — shared by the standalone
 * server (server/main.ts) and the Vite dev plugin (vite.config.ts), so
 * a headset sees the same config and log endpoints in both. */
export const CONFIG_PATH = '/__kubb/config.json';
export const LOG_ROUTE = '/__kubb/log';
/**
 * Erik, 2026-10-31: "du kan använda cookies … för att säkerställa vilken
 * användare det är". The server gives every browser a random device id
 * in a cookie when it fetches its config. Cookies belong to the HOST,
 * not the port, so — unlike the page's localStorage clientId — it
 * survives moving between the dev server (8081) and `npm start` (8443).
 * The game WebSocket sends it along (wsServer.ts); it keys the player's
 * profile. HttpOnly: page scripts never see it. Random, so it identifies
 * a browser, not a person.
 */
export const DEVICE_COOKIE = 'kubb_device';
const DEVICE_COOKIE_MAX_AGE_S = 10 * 365 * 24 * 3600;
const DEVICE_ID_PATTERN = /^[0-9a-f-]{16,64}$/u;

/** The device id from a Cookie header, if well-formed. */
export function deviceIdFromCookie(header: string | undefined): string | null {
  for (const part of (header ?? '').split(';')) {
    const [name, value] = part.trim().split('=');
    if (name === DEVICE_COOKIE && value && DEVICE_ID_PATTERN.test(value)) {
      return value;
    }
  }
  return null;
}

/** A debug batch is ≤ 50 entries (src/debug/debugRelay.ts). */
const MAX_LOG_BODY_BYTES = 512 * 1024;

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.wasm': 'application/wasm',
  '.glb': 'model/gltf-binary',
  '.gltf': 'model/gltf+json',
  '.ktx2': 'image/ktx2',
  '.hdr': 'image/vnd.radiance',
  '.ogg': 'audio/ogg',
  '.mp3': 'audio/mpeg',
  '.woff2': 'font/woff2',
  '.uikitml': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
};

/** What a client learns from CONFIG_PATH (src/serverConfig.ts). */
export interface KubbClientConfig {
  server: true;
  protocol: number;
  room: string;
  debug: boolean;
}

export interface KubbRoutesOptions {
  /** The built game (`dist/`); omit to serve only the /__kubb routes
   * (the Vite dev server serves the app itself). */
  staticDir?: string;
  logPath: string;
  room: string;
  debug: boolean;
  /** Echo each logged entry to the terminal (dev convenience). */
  echoLog?: boolean;
}

type Handler = (
  req: IncomingMessage,
  res: ServerResponse,
  next?: () => void,
) => void;

export function createKubbRequestHandler(options: KubbRoutesOptions): Handler {
  const config: KubbClientConfig = {
    server: true,
    protocol: SERVER_PROTOCOL_VERSION,
    room: options.room,
    debug: options.debug,
  };
  const staticRoot = options.staticDir ? resolve(options.staticDir) : null;
  return (req, res, next) => {
    const path = decodePath(req.url ?? '/');
    if (path === CONFIG_PATH) {
      res.setHeader('content-type', MIME['.json'] ?? 'application/json');
      res.setHeader('cache-control', 'no-store');
      if (!deviceIdFromCookie(req.headers.cookie)) {
        res.setHeader(
          'set-cookie',
          `${DEVICE_COOKIE}=${randomUUID()}; Path=/; Max-Age=${DEVICE_COOKIE_MAX_AGE_S}; SameSite=Strict; Secure; HttpOnly`,
        );
      }
      res.end(JSON.stringify(config));
      return;
    }
    if (path === LOG_ROUTE) {
      handleLog(req, res, options);
      return;
    }
    if (staticRoot && path !== null) {
      serveStatic(staticRoot, path, res);
      return;
    }
    if (next) {
      next();
      return;
    }
    res.statusCode = 404;
    res.end();
  };
}

/** The URL path, decoded; null when it is malformed. */
function decodePath(url: string): string | null {
  try {
    return decodeURIComponent(url.split('?')[0] ?? '/');
  } catch {
    return null;
  }
}

function handleLog(
  req: IncomingMessage,
  res: ServerResponse,
  options: KubbRoutesOptions,
): void {
  if (req.method !== 'POST') {
    res.statusCode = 405;
    res.end();
    return;
  }
  const chunks: Buffer[] = [];
  let size = 0;
  let tooBig = false;
  req.on('data', (chunk: Buffer) => {
    size += chunk.length;
    if (size > MAX_LOG_BODY_BYTES) {
      tooBig = true;
      return;
    }
    chunks.push(chunk);
  });
  req.on('end', () => {
    if (tooBig) {
      res.statusCode = 413;
      res.end();
      return;
    }
    try {
      const entries = JSON.parse(
        Buffer.concat(chunks).toString('utf8'),
      ) as unknown;
      if (!Array.isArray(entries)) {
        throw new Error('not a batch');
      }
      const receivedAt = Date.now();
      mkdirSync(dirname(options.logPath), { recursive: true });
      appendFileSync(
        options.logPath,
        entries
          .map((e) =>
            JSON.stringify({ ...(e as Record<string, unknown>), receivedAt }),
          )
          .join('\n') + '\n',
      );
      if (options.echoLog) {
        for (const e of entries as Array<Record<string, unknown>>) {
          const data = e['data'] === undefined ? '' : JSON.stringify(e['data']);
          console.log(
            `[kubb ${String(e['role'])}/${String(e['client'])}] ${String(e['level'])} [${String(e['channel'])}] ${String(e['message'])} ${data}`,
          );
        }
      }
      res.statusCode = 204;
    } catch {
      res.statusCode = 400;
    }
    res.end();
  });
}

function serveStatic(root: string, path: string, res: ServerResponse): void {
  const relative = normalize(path).replace(/^([/\\])+/u, '');
  const file = join(root, relative);
  // Path traversal guard: the resolved file must stay inside the root.
  if (file !== root && !file.startsWith(root + sep)) {
    res.statusCode = 404;
    res.end();
    return;
  }
  const target = isFile(file)
    ? file
    : extname(relative) === ''
      ? join(root, 'index.html') // app routes fall back to the game
      : null;
  if (!target || !isFile(target)) {
    res.statusCode = 404;
    res.end();
    return;
  }
  res.setHeader(
    'content-type',
    MIME[extname(target).toLowerCase()] ?? 'application/octet-stream',
  );
  // Vite's hashed assets never change; the page itself always revalidates.
  res.setHeader(
    'cache-control',
    target.endsWith('index.html') || !/^assets[\\/]/u.test(relative)
      ? 'no-cache'
      : 'public, max-age=31536000, immutable',
  );
  // Streamed, so a multi-MB asset never stalls the game tick; a read
  // error ends this response, never the server (review, 2026-10-31).
  const stream = createReadStream(target);
  stream.on('error', () => {
    if (!res.headersSent) {
      res.statusCode = 500;
    }
    res.end();
  });
  stream.pipe(res);
}

function isFile(path: string): boolean {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}
