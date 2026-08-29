// Production-build smoke test — loads the actual `dist/` build (not
// `npm run dev`, which uses unbundled dev-mode ESM and would NOT have
// caught the top-level-await bug that shipped a blank site from M1
// through the start of M2; see docs/DECISIONS.md, 2026-08-27).
//
// Fails the build if the scene never renders (empty #scene-container,
// no <canvas>) or the page throws an uncaught error.
import { chromium } from 'playwright';
import { preview } from 'vite';

const PORT = 4321;
const TIMEOUT_MS = 20_000;

const server = await preview({ preview: { port: PORT, strictPort: true } });
const url = server.resolvedUrls?.local?.[0];
if (!url) {
  throw new Error('vite preview did not report a local URL');
}

const browser = await chromium.launch();
const page = await browser.newPage({ ignoreHTTPSErrors: true });

const pageErrors = [];
page.on('pageerror', (err) => pageErrors.push(err.message));
const badResponses = [];
page.on('response', (res) => {
  if (res.status() >= 400) {
    badResponses.push(`${res.status()} ${res.url()}`);
  }
});

try {
  await page.goto(url, { waitUntil: 'load', timeout: TIMEOUT_MS });
  await page.waitForTimeout(5000);

  const info = await page.evaluate(() => ({
    sceneContainerChildren:
      document.getElementById('scene-container')?.children.length ?? 0,
    canvasCount: document.querySelectorAll('canvas').length,
  }));

  const failures = [];
  if (pageErrors.length > 0) {
    failures.push(`page errors: ${pageErrors.join('; ')}`);
  }
  if (badResponses.length > 0) {
    failures.push(`failed requests: ${badResponses.join('; ')}`);
  }
  if (info.sceneContainerChildren === 0 || info.canvasCount === 0) {
    failures.push(
      `scene never rendered (sceneContainerChildren=${info.sceneContainerChildren}, canvasCount=${info.canvasCount})`,
    );
  }

  if (failures.length > 0) {
    console.error('SMOKE TEST FAILED:\n' + failures.join('\n'));
    process.exitCode = 1;
  } else {
    console.log('Smoke test passed: production build renders a scene.');
  }
} finally {
  // Both can throw during shutdown (observed in CI: vite preview's
  // HTTP/2 server threw ERR_HTTP2_INVALID_STREAM closing an
  // in-flight stream, crashing the whole process with a false-
  // negative exit code even though the test above had already
  // passed and logged success). Cleanup failures aren't test
  // failures — process.exitCode above is already the real verdict.
  await browser.close().catch(() => {});
  await server.close().catch(() => {});
}
