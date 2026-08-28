/// <reference types="vite/client" />
/// <reference types="@iwsdk/vite-plugin-dev/client" />

/** `git describe --tags --always --dirty` at build time — see
 * vite.config.ts. Shown in the settings menu so Erik knows which
 * build he's testing (2026-08-28 feedback). */
declare const __APP_VERSION__: string;
