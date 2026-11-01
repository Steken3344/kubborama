import { execFileSync } from 'node:child_process';

/** Where `--url` points when it is not given (the dev server's port has
 * moved 8081 → 8083 when an old one still held it). */
const FALLBACK_URL = 'https://localhost:8081/';

/** The running dev server's local URL from `npx iwsdk dev status`, or
 * the usual port when the status can't be read. */
export function devServerUrl(): string {
  try {
    const raw = execFileSync('npx', ['iwsdk', 'dev', 'status'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 30_000,
    });
    return localUrlFrom(JSON.parse(raw)) ?? FALLBACK_URL;
  } catch {
    return FALLBACK_URL;
  }
}

/** `data.state.session.localUrl` of a running session, if any. */
export function localUrlFrom(status: unknown): string | null {
  const data = (status as { data?: { state?: unknown } } | null)?.data;
  const session = (data?.state as { session?: { localUrl?: unknown } })
    ?.session;
  return typeof session?.localUrl === 'string' ? session.localUrl : null;
}
