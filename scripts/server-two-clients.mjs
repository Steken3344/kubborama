// Two headless players against the dev server's game server (MP5+).
// Usage: npm run check:server   (dev server must be running)
// Both join with ?player=1 (A Simple, B Advanced — B must adopt A's
// court), A throws stick-0 through the app's own event bus, and the
// debug relay log must show both clients reporting the SAME stick
// position for every server tick they both sampled. Exit code 1 on
// failure. See docs/superpowers/specs/2026-09-26-authoritative-server-design.md.
import { existsSync, readFileSync, renameSync } from 'node:fs';
import { chromium } from 'playwright';

const LOG = '.iwsdk/runtime/logs/kubb-debug.ndjson';
const BASE = process.env.KUBB_URL ?? 'https://localhost:8081/';
if (existsSync(LOG))
  renameSync(LOG, LOG.replace('.ndjson', `.${Date.now()}.ndjson`));

const settings = (gameMode) =>
  JSON.stringify({
    version: 1,
    language: 'sv',
    gameMode,
    musicVolumePercent: 0,
    sfxVolumePercent: 0,
    hapticsEnabled: true,
    hapticsIntensityPercent: 70,
    courtLinesVisible: false,
    profileName: null,
    micMuted: true,
    avatarColorIndex: 1,
    debugRelay: false,
    roomId: null,
    serverChoice: 'auto',
  });
const browser = await chromium.launch({
  args: [
    '--ignore-certificate-errors',
    '--use-fake-ui-for-media-stream',
    '--use-fake-device-for-media-stream',
  ],
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function player(gameMode) {
  const ctx = await browser.newContext({ ignoreHTTPSErrors: true });
  await ctx.addInitScript((s) => {
    if (!sessionStorage.getItem('seeded')) {
      localStorage.setItem('kubborama.settings.v1', s);
      sessionStorage.setItem('seeded', '1');
    }
  }, settings(gameMode));
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(`${BASE}?room=check-${Date.now()}&player=1`, {
    waitUntil: 'load',
    timeout: 60000,
  });
  return { page, errors };
}
const a = await player('simple');
await sleep(8000);
const b = await player('advanced');
await sleep(8000);
await a.page.waitForFunction(
  () => globalThis.__kubbDev?.debugContext.pieceIdByEntityIndex.size > 0,
  null,
  { timeout: 30000 },
);
await a.page.evaluate(async () => {
  const { gameEvents, debugContext } = globalThis.__kubbDev;
  const idx = [...debugContext.pieceIdByEntityIndex].find(
    ([, p]) => p === 'stick-0',
  )[0];
  gameEvents.emit('Thrown', {
    stickId: String(idx),
    handId: 'right',
    releaseSpeedMps: 6.8,
    releaseVelocity: [0, 3.2, -6],
    angularVelocity: [-22, 0, 0],
    releasePosition: [0.2, 1, -0.3],
    style: 'underhand',
    flipQualityScore: 90,
    presetId: 'A',
    timeS: 0,
  });
});
await sleep(6000);
await browser.close();

const entries = readFileSync(LOG, 'utf8')
  .split('\n')
  .filter(Boolean)
  .map((l) => JSON.parse(l));
const welcomes = entries
  .filter((e) => e.message === 'joined game server')
  .map((e) => e.data);
const byTick = new Map();
for (const e of entries.filter((x) => x.message === 'server snapshot')) {
  const p = e.data.sticks
    .find((s) => s.id === 'stick-0')
    .position.map((v) => v.toFixed(3))
    .join(',');
  const row = byTick.get(e.data.tick) ?? new Map();
  row.set(e.client, p);
  byTick.set(e.data.tick, row);
}
const common = [...byTick.values()].filter((row) => row.size === 2);
const identical = common.every((row) => new Set(row.values()).size === 1);
const final = common.at(-1) ? [...common.at(-1).values()][0] : null;
const ok =
  a.errors.length + b.errors.length === 0 &&
  welcomes
    .map((w) => w.side)
    .sort()
    .join() === 'guest,host' &&
  welcomes.every((w) => w.gameMode === 'simple') &&
  common.length >= 5 &&
  identical &&
  final !== null &&
  Number(final.split(',')[2]) < -4;
console.log(
  JSON.stringify({
    ok,
    welcomes,
    commonTicks: common.length,
    identical,
    finalStick0: final,
    pageErrors: [...a.errors, ...b.errors],
  }),
);
process.exit(ok ? 0 : 1);
