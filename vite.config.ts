/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { execSync } from 'node:child_process';
import { iwsdkDev } from '@iwsdk/vite-plugin-dev';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

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
  plugins: [
    iwsdkDev(),
    // M6 (docs/PLAN.md §12, pre-approved): installable from the
    // deployed GitHub Pages URL, launches fullscreen from the Quest
    // app library. `start_url`/`scope` are relative ('./') to match
    // the project's own base:'./' convention (verified working under
    // the /kubborama/ subpath since M0) — an absolute '/' would break
    // under any subpath. `registerType: 'autoUpdate'` activates a new
    // service worker on next load automatically, so a deploy never
    // needs a manual cache-bust step or leaves a player stuck on a
    // stale cached build.
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon-32.png', 'favicon-48.png'],
      manifest: {
        name: 'KubbOrama',
        short_name: 'KubbOrama',
        description: 'VR-kubbspel för Meta Quest / VR kubb game for Meta Quest',
        lang: 'sv',
        start_url: './',
        scope: './',
        display: 'fullscreen',
        orientation: 'any',
        // Matches index.html's #splash background (`#1c4a36`) so the
        // OS/launcher splash and the app's own splash don't flash two
        // different colors during the handoff.
        background_color: '#1c4a36',
        theme_color: '#1c4a36',
        icons: [
          {
            src: 'icons/icon-192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: 'icons/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
          },
        ],
      },
      workbox: {
        // App-shell precache — everything needed to START the app
        // offline: JS/CSS/HTML, the physics wasm, the UIKitML panels
        // and the scene JSON (both fetch()-loaded at startup, small).
        // Font chunks are excluded (see manualChunks above). Textures/
        // audio/glTF are numerous and per-scene, so they go through
        // the runtime rule below instead of bloating the install.
        globPatterns: [
          '**/*.{js,css,html,wasm}',
          'ui/**/*.uikitml',
          'scenes/**/*.json',
        ],
        globIgnores: ['**/font-*.js'],
        // The Havok wasm (~2 MB) and the main bundle exceed workbox's
        // 2 MB default cap — both are load-bearing for the app shell,
        // so raise it rather than silently excluding them.
        maximumFileSizeToCacheInBytes: 10 * 1024 * 1024,
        runtimeCaching: [
          {
            // Three's loaders (audio, glTF, textures, UIKitML) go
            // through fetch(), so `request.destination` is '' for
            // them — match by extension, not destination (code review,
            // 2026-09-03: an 'audio' destination check never matched a
            // single .ogg).
            urlPattern: ({ request }) =>
              ['image', 'font'].includes(request.destination) ||
              /\.(?:ogg|glb|gltf|ktx2|hdr|uikitml|json)$/u.test(
                new URL(request.url).pathname,
              ),
            handler: 'CacheFirst',
            options: {
              cacheName: 'kubborama-assets',
              expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 30 },
            },
          },
        ],
      },
    }),
  ],
  define: { __APP_VERSION__: JSON.stringify(appVersion()) },
  server: { host: '0.0.0.0', port: 8081, open: false },
  build: {
    outDir: 'dist',
    sourcemap: process.env.NODE_ENV !== 'production',
    target: 'esnext',
    rollupOptions: {
      input: './index.html',
      output: {
        // Every UIKit MSDF font ships as its own ~400-660 KB JS chunk
        // (17 of them, ~7 MB), only one or two of which the app ever
        // loads. Naming them `font-*` lets the PWA precache below
        // exclude them by glob (code review, 2026-09-03: they were
        // being precached, doubling the install download for nothing).
        manualChunks(id) {
          const match = id.match(/\/@pmndrs\/msdfonts\/dist\/([^/]+)\.js$/u);
          return match ? `font-${match[1]}` : undefined;
        },
      },
    },
  },
  esbuild: { target: 'esnext' },
  optimizeDeps: {
    exclude: ['@babylonjs/havok'],
    esbuildOptions: { target: 'esnext' },
  },
  publicDir: 'public',
  base: './',
});
