import { chromium } from 'playwright';
import type { Browser, Page } from 'playwright';
import type { Vec3 } from '../../src/core/vec3.js';
import type { GameMode } from './protocolBot.js';

/** The app's debug hook (src/index.ts), as far as the bot uses it. */
interface DevHook {
  gameEvents: { emit: (name: string, event: unknown) => void };
  debugContext: {
    pieceIdByEntityIndex: Map<number, string>;
    /** 'host' / 'guest' once the server seated this page. */
    role: string | null;
  };
  serverLink: () => {
    sendThrow: (
      pieceId: string,
      position: Vec3,
      quaternion: [number, number, number, number],
      linearVelocity: Vec3,
      angularVelocity: Vec3,
    ) => void;
  };
}

/** A stable id: a rerun reclaims the seat inside the server's 60 s
 * rejoin grace instead of finding the room full. */
const CLIENT_ID = 'botmatch-host-0001';

/** Quiet and muted (as check:server); the language is the caller's. */
const settingsFor = (language: 'sv' | 'en') =>
  JSON.stringify({
    version: 1,
    language,
    gameMode: 'simple',
    musicVolumePercent: 0,
    sfxVolumePercent: 0,
    hapticsEnabled: true,
    hapticsIntensityPercent: 70,
    courtLinesVisible: false,
    profileName: null,
    micMuted: true,
    avatarColorIndex: 1,
    debugRelay: true,
    roomId: null,
    serverChoice: 'auto',
  });

/**
 * Player A of the bot match: the real app in a browser, joined at once
 * (`?player=1`) with the debug relay on, driven through the app's own
 * event bus (`globalThis.__kubbDev`) so the client side — HUD, avatars,
 * gate probes, notices — runs for real.
 */
export class BrowserPlayer {
  private constructor(
    private readonly browser: Browser,
    readonly page: Page,
    readonly errors: string[],
  ) {}

  static async open(
    baseUrl: string,
    language: 'sv' | 'en' = 'sv',
  ): Promise<BrowserPlayer> {
    const browser = await chromium.launch({
      // Headless Chromium renders this scene at a few frames a second.
      headless: !process.env['DISPLAY'],
      args: [
        '--ignore-certificate-errors',
        '--use-fake-ui-for-media-stream',
        '--use-fake-device-for-media-stream',
      ],
    });
    const ctx = await browser.newContext({
      ignoreHTTPSErrors: true,
      viewport: { width: 960, height: 540 },
    });
    await ctx.addInitScript(
      ({ clientId, settings }) => {
        localStorage.setItem('kubborama.clientId', clientId);
        localStorage.setItem('kubborama.settings.v1', settings);
      },
      { clientId: CLIENT_ID, settings: settingsFor(language) },
    );
    const page = await ctx.newPage();
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    const url = new URL(baseUrl);
    url.searchParams.set('player', '1');
    url.searchParams.set('debug', '1');
    await page.goto(url.href, { waitUntil: 'load', timeout: 60000 });
    await page.waitForFunction(
      () => {
        const dev = (globalThis as { __kubbDev?: DevHook }).__kubbDev;
        return (dev?.debugContext.pieceIdByEntityIndex.size ?? 0) > 0;
      },
      null,
      { timeout: 90000 },
    );
    // Seated (the server's welcome), so it takes side A before the bot.
    await page.waitForFunction(
      () => {
        const role = (globalThis as { __kubbDev?: DevHook }).__kubbDev
          ?.debugContext.role;
        return role === 'host' || role === 'guest';
      },
      null,
      { timeout: 90000 },
    );
    return new BrowserPlayer(browser, page, errors);
  }

  /** A stick through `Thrown`, as ThrowingSystem emits it on release. */
  async throwStick(
    pieceId: string,
    from: Vec3,
    velocity: Vec3,
    spin: Vec3,
  ): Promise<void> {
    await this.page.evaluate(
      (t) => {
        const dev = (globalThis as unknown as { __kubbDev: DevHook }).__kubbDev;
        const entry = [...dev.debugContext.pieceIdByEntityIndex].find(
          ([, id]) => id === t.pieceId,
        );
        if (!entry) return;
        dev.gameEvents.emit('Thrown', {
          stickId: String(entry[0]),
          handId: 'right',
          releaseSpeedMps: Math.hypot(...t.velocity),
          releaseVelocity: t.velocity,
          angularVelocity: t.spin,
          releasePosition: t.from,
          style: 'underhand',
          flipQualityScore: 90,
          presetId: 'A',
          timeS: 0,
        });
      },
      { pieceId, from, velocity, spin },
    );
  }

  /** An inkast kubb straight through the server link, as InkastSystem does. */
  async tossKubb(pieceId: string, from: Vec3, velocity: Vec3): Promise<void> {
    await this.page.evaluate(
      (t) => {
        const dev = (globalThis as unknown as { __kubbDev: DevHook }).__kubbDev;
        dev
          .serverLink()
          .sendThrow(t.pieceId, t.from, [0, 0, 0, 1], t.velocity, [0, 0, 0]);
      },
      { pieceId, from, velocity },
    );
  }

  /** "Ny runda" / a court switch, through the events the menu emits. */
  async room(
    action:
      | { kind: 'reset' }
      | { kind: 'court'; gameMode: GameMode }
      | { kind: 'timeLimit'; minutes: number },
  ): Promise<void> {
    await this.page.evaluate((a) => {
      const dev = (globalThis as unknown as { __kubbDev: DevHook }).__kubbDev;
      if (a.kind === 'reset') {
        dev.gameEvents.emit('ServerResetRequested', {});
      } else if (a.kind === 'timeLimit') {
        dev.gameEvents.emit('ServerTimeLimitRequested', {
          minutes: a.minutes,
        });
      } else {
        dev.gameEvents.emit('ServerGameModeRequested', {
          gameMode: a.gameMode,
        });
      }
    }, action);
  }

  async screenshot(path: string): Promise<void> {
    await this.page.screenshot({ path, type: 'jpeg', quality: 60 });
  }

  close(): Promise<void> {
    return this.browser.close();
  }
}
