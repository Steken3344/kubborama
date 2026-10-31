/// <reference types="node" />
import { networkInterfaces } from 'node:os';
import { fileURLToPath } from 'node:url';
import { getCertificate } from '@vitejs/plugin-basic-ssl';
import multiplayerConfig from '../src/data/multiplayer.json' with { type: 'json' };
import { startKubbServer } from './kubbServer.js';

/**
 * `npm start`: the whole game from one address on the home network —
 * open the printed https URL on both headsets. Reuses the dev server's
 * self-signed certificate (.iwsdk/https), so a headset that accepted it
 * there only has to accept it once more for the new port.
 */
const port = Number(process.env['KUBB_PORT'] ?? 8443);
// Paths from the repo root, not the working directory: the bundle lives
// in dist-server/, the source in server/ — both one level below it.
const repo = (path: string): string =>
  fileURLToPath(new URL(`../${path}`, import.meta.url));
// Long-lived (825 days) so the headsets do not have to re-accept a
// fresh certificate every month; the same file the dev server reuses.
const pem = await getCertificate(
  repo('.iwsdk/https'),
  undefined,
  undefined,
  825,
);
let server;
try {
  server = await startKubbServer({
    port,
    tls: { key: pem, cert: pem },
    staticDir: repo('dist'),
    logPath: repo('.iwsdk/runtime/logs/kubb-debug.ndjson'),
    room: multiplayerConfig.devRoomId,
  });
} catch (error) {
  const code = (error as { code?: string }).code;
  console.error(
    code === 'EADDRINUSE'
      ? `Port ${port} is already in use — is the server already running? (KUBB_PORT=<port> npm start to use another)`
      : `Could not start the KubbOrama server: ${String(error)}`,
  );
  process.exit(1);
}

const addresses = Object.values(networkInterfaces())
  .flat()
  .filter((a) => a && a.family === 'IPv4' && !a.internal)
  .map((a) => `https://${a?.address}:${server.port}`);
console.log('\nKubbOrama server running — open on both headsets:');
for (const url of addresses) {
  console.log(`  ${url}`);
}
console.log('(Ctrl+C to stop)\n');

const shutdown = () => {
  void server.close().then(() => process.exit(0));
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
