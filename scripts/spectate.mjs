// Watch a match as a spectator during a playtest, for debugging and for
// judging the TV director. Usage:
//   node scripts/spectate.mjs [--url https://192.168.1.147:8443/]
//                             [--out <dir>] [--every 15] [--on-cut]
// Opens the game in a browser outside VR (it joins as a spectator, never
// a seat), with the debug relay on so its lines (camera cuts, players,
// scoreboard) land in the same log as the headsets'. Saves a small JPEG
// every --every seconds to --out (keep it out of the repo) and prints
// page errors; with --on-cut also one at every camera cut. Runs headed when DISPLAY is set — headless Chromium
// renders the scene at a few frames per second. Stop with Ctrl+C.
import { mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { URL } from 'node:url';
import { chromium } from 'playwright';

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};
const base = arg('url', 'https://192.168.1.147:8443/');
const out = arg('out', join(tmpdir(), 'kubb-spectate'));
const everyS = Number(arg('every', '15'));
const onCut = process.argv.includes('--on-cut');
mkdirSync(out, { recursive: true });

const url = new URL(base);
url.searchParams.set('debug', '1');
url.searchParams.set('watch', '1'); // needed on the Vite dev server only

const browser = await chromium.launch({
  headless: !process.env.DISPLAY,
  args: [
    '--ignore-certificate-errors',
    '--autoplay-policy=no-user-gesture-required',
  ],
});
const ctx = await browser.newContext({
  ignoreHTTPSErrors: true,
  viewport: { width: 1280, height: 720 },
});
const stamp = () => new Date().toTimeString().slice(0, 8);

let page = null;
async function open() {
  page = await ctx.newPage();
  page.on('pageerror', (e) => console.log(`${stamp()} pageerror ${String(e)}`));
  page.on('console', (m) => {
    if (m.type() === 'error') console.log(`${stamp()} console ${m.text()}`);
    if (onCut && m.text().includes('camera cut')) {
      shot += 1;
      const file = join(
        out,
        `${stamp().replaceAll(':', '')}-${String(shot).padStart(4, '0')}-cut.jpg`,
      );
      // A moment later, so the new shot has rendered a frame or two.
      setTimeout(() => {
        page
          ?.screenshot({ path: file, type: 'jpeg', quality: 60 })
          .catch(() => {});
      }, 400);
    }
  });
  page.on('close', () => {
    page = null;
  });
  await page.goto(url.href, { waitUntil: 'load', timeout: 60000 });
  console.log(`${stamp()} watching ${url.href}`);
}

let stopping = false;
let shot = 0;
const stop = () => {
  if (stopping) return;
  stopping = true;
  console.log(`${stamp()} stopped; ${shot} screenshots in ${out}`);
  browser.close().finally(() => process.exit(0));
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);

while (!stopping) {
  try {
    if (!page) await open();
    await new Promise((r) => setTimeout(r, everyS * 1000));
    if (page && !stopping) {
      shot += 1;
      const file = join(
        out,
        `${stamp().replaceAll(':', '')}-${String(shot).padStart(4, '0')}.jpg`,
      );
      await page.screenshot({ path: file, type: 'jpeg', quality: 60 });
    }
  } catch (e) {
    if (stopping) break;
    // The server restarting or a page crash: open a fresh page.
    console.log(`${stamp()} retry after ${String(e).slice(0, 120)}`);
    await page?.close().catch(() => {});
    page = null;
    await new Promise((r) => setTimeout(r, 5000));
  }
}
