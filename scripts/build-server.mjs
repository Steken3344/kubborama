// Bundles server/main.ts (and the src/core rules it imports) into one
// ESM file for `npm start`. Native/WASM packages stay external.
import { build } from 'esbuild';

await build({
  entryPoints: ['server/main.ts'],
  outfile: 'dist-server/main.mjs',
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  external: ['@babylonjs/havok', 'ws', '@vitejs/plugin-basic-ssl'],
  logLevel: 'warning',
});
console.log('built dist-server/main.mjs');
