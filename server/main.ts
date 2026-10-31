/// <reference types="node" />
import { networkInterfaces } from 'node:os';
import { resolve } from 'node:path';
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
const pem = await getCertificate(resolve('.iwsdk/https'));
const server = await startKubbServer({
  port,
  tls: { key: pem, cert: pem },
  staticDir: resolve('dist'),
  logPath: resolve('.iwsdk/runtime/logs/kubb-debug.ndjson'),
  room: multiplayerConfig.devRoomId,
});

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
