import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SERVER_PROTOCOL_VERSION } from '../src/core/serverProtocol.js';
import { createKubbRequestHandler } from './httpRoutes.js';

const root = mkdtempSync(join(tmpdir(), 'kubb-http-'));
const staticDir = join(root, 'dist');
const logPath = join(root, 'logs', 'kubb-debug.ndjson');
mkdirSync(join(staticDir, 'assets'), { recursive: true });
writeFileSync(
  join(staticDir, 'index.html'),
  '<!doctype html><title>kubb</title>',
);
writeFileSync(join(staticDir, 'assets', 'app.js'), 'console.log(1)');
writeFileSync(join(root, 'secret.txt'), 'nope');

let base = '';
const server = createServer(
  createKubbRequestHandler({
    staticDir,
    logPath,
    room: 'home-room',
    debug: true,
  }),
);
beforeAll(async () => {
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => {
  server.close();
});

describe('KubbOrama HTTP routes', () => {
  it('serves the game with the right MIME types', async () => {
    const page = await fetch(`${base}/`);
    expect(page.status).toBe(200);
    expect(page.headers.get('content-type')).toContain('text/html');
    const js = await fetch(`${base}/assets/app.js`);
    expect(js.headers.get('content-type')).toContain('javascript');
    expect(await js.text()).toBe('console.log(1)');
  });
  it('never serves files outside the build directory', async () => {
    const res = await fetch(`${base}/..%2fsecret.txt`);
    expect(res.status).toBe(404);
    const res2 = await fetch(`${base}/assets/../../secret.txt`);
    expect(await res2.text()).not.toContain('nope');
  });
  it('falls back to index.html for unknown pages, 404 for unknown files', async () => {
    expect((await fetch(`${base}/play`)).status).toBe(200);
    expect((await fetch(`${base}/missing.png`)).status).toBe(404);
  });
  it('tells the client where the server is', async () => {
    const config = await (await fetch(`${base}/__kubb/config.json`)).json();
    expect(config).toEqual({
      server: true,
      protocol: SERVER_PROTOCOL_VERSION,
      room: 'home-room',
      debug: true,
    });
  });
  it('appends debug log batches to the NDJSON file', async () => {
    const res = await fetch(`${base}/__kubb/log`, {
      method: 'POST',
      body: JSON.stringify([
        {
          level: 'info',
          channel: 'net',
          message: 'hi',
          timeMs: 1,
          client: 'c',
          role: 'solo',
        },
      ]),
    });
    expect(res.status).toBe(204);
    const line = JSON.parse(
      readFileSync(logPath, 'utf8').trim().split('\n').at(-1) ?? '{}',
    );
    expect(line.message).toBe('hi');
    expect(typeof line.receivedAt).toBe('number');
  });
  it('rejects a bad log body and a GET on the log route', async () => {
    expect(
      (await fetch(`${base}/__kubb/log`, { method: 'POST', body: 'not json' }))
        .status,
    ).toBe(400);
    expect((await fetch(`${base}/__kubb/log`)).status).toBe(405);
    const huge = 'x'.repeat(600 * 1024);
    expect(
      (await fetch(`${base}/__kubb/log`, { method: 'POST', body: huge }))
        .status,
    ).toBe(413);
  });
});

describe('caching (review, 2026-10-31)', () => {
  it('the page always revalidates; hashed assets are immutable', async () => {
    expect((await fetch(`${base}/`)).headers.get('cache-control')).toBe(
      'no-cache',
    );
    expect(
      (await fetch(`${base}/assets/app.js`)).headers.get('cache-control'),
    ).toContain('immutable');
    expect(
      (await fetch(`${base}/__kubb/config.json`)).headers.get('cache-control'),
    ).toBe('no-store');
  });
});
