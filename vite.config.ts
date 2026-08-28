/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { execSync } from 'node:child_process';
import { iwsdkDev } from '@iwsdk/vite-plugin-dev';
import { defineConfig } from 'vite';

// Shown in the settings menu (src/systems/menu.ts) so Erik knows which
// build he's testing — a milestone tag plus commits-since/hash reads
// far better than package.json's rarely-bumped "0.1.0". Falls back to
// "dev" rather than failing the build if git isn't available (e.g. a
// source tarball with no .git directory).
function appVersion(): string {
  try {
    return execSync('git describe --tags --always --dirty', {
      encoding: 'utf-8',
    }).trim();
  } catch {
    return 'dev';
  }
}

export default defineConfig({
  plugins: [iwsdkDev()],
  define: { __APP_VERSION__: JSON.stringify(appVersion()) },
  server: { host: '0.0.0.0', port: 8081, open: false },
  build: {
    outDir: 'dist',
    sourcemap: process.env.NODE_ENV !== 'production',
    target: 'esnext',
    rollupOptions: { input: './index.html' },
  },
  esbuild: { target: 'esnext' },
  optimizeDeps: {
    exclude: ['@babylonjs/havok'],
    esbuildOptions: { target: 'esnext' },
  },
  publicDir: 'public',
  base: './',
});
