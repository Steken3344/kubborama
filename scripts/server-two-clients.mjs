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
const throwStick = (page, stickIndex) =>
  page.evaluate((i) => {
    const { gameEvents, debugContext } = globalThis.__kubbDev;
    const idx = [...debugContext.pieceIdByEntityIndex].find(
      ([, p]) => p === `stick-${i}`,
    )[0];
    const far = debugContext.role === 'guest';
    gameEvents.emit('Thrown', {
      stickId: String(idx),
      handId: 'right',
      releaseSpeedMps: 6.8,
      releaseVelocity: [0, 3.2, far ? 6 : -6],
      angularVelocity: [far ? 22 : -22, 0, 0],
      releasePosition: [0.2 - i * 0.08, 1, far ? -5.7 : -0.3],
      style: 'underhand',
      flipQualityScore: 90,
      presetId: 'A',
      timeS: 0,
    });
  }, stickIndex);

// MP6: A's whole turn…
for (let i = 0; i < 6; i++) {
  await throwStick(a.page, i);
  await sleep(700);
}
await sleep(9000);
// …B's inkast (if A felled anything) through the server link…
const tossed = await b.page.evaluate(() => {
  const dev = globalThis.__kubbDev;
  const kubbId = dev.lastMatch?.inkastQueue[0]?.kubbId ?? null;
  if (kubbId) {
    dev
      .serverLink()
      .sendThrow(kubbId, [0, 0.6, -6.4], [0, 0, 0, 1], [0, 3, 6], [0, 0, 0]);
  }
  return kubbId;
});
await sleep(5000);
// …then B's first stick.
await throwStick(b.page, 0);
await sleep(4000);
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
  const p = JSON.stringify(
    e.data.sticks.map((s) => s.position.map((v) => v.toFixed(3))),
  );
  const row = byTick.get(e.data.tick) ?? new Map();
  row.set(e.client, p);
  byTick.set(e.data.tick, row);
}
const common = [...byTick.values()].filter((row) => row.size === 2);
const identical = common.every((row) => new Set(row.values()).size === 1);
const rounds = entries
  .filter((e) => e.message === 'round summary')
  .map((e) => ({
    side: e.data.mySide,
    byOpponent: e.data.byOpponent,
    statsRecorded: e.data.statsRecorded,
  }));
const phases = [
  ...new Set(
    entries
      .filter((e) => e.message === 'match state')
      .map((e) => `${e.data.turn}/${e.data.phase}`),
  ),
];
const serverGate = entries
  .filter((e) => e.role === 'server')
  .map((e) => `${e.message} ${JSON.stringify(e.data)}`);
const stickAccepted = phases.includes('guest/throwing');
const avatarsSeenBy = new Set(
  entries
    .filter((e) => e.message === 'peer avatar created')
    .map((e) => e.client),
);
const ok =
  a.errors.length + b.errors.length === 0 &&
  welcomes
    .map((w) => w.side)
    .sort()
    .join() === 'guest,host' &&
  welcomes.every((w) => w.gameMode === 'simple') &&
  common.length >= 5 &&
  identical &&
  rounds.some((r) => r.side === 'host' && !r.byOpponent && r.statsRecorded) &&
  rounds.some((r) => r.side === 'guest' && r.byOpponent && !r.statsRecorded) &&
  (tossed === null
    ? phases.includes('guest/throwing')
    : serverGate.some((l) => l.startsWith('inkast landed'))) &&
  stickAccepted &&
  avatarsSeenBy.size === 2;
console.log(
  JSON.stringify(
    {
      ok,
      welcomes,
      commonTicks: common.length,
      identical,
      rounds,
      phases,
      tossed,
      serverGate,
      pageErrors: [...a.errors, ...b.errors],
    },
    null,
    1,
  ),
);
process.exit(ok ? 0 : 1);
