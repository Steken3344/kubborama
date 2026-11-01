/**
 * The match clock for the optional time limit (Erik approved, 2026-11-01,
 * after 6 of 20 bot-series matches ran past 30 minutes). The server owns
 * the elapsed time; clients only show what it sends. Seconds, SI.
 */
export function remainingS(limitS: number, elapsedS: number): number {
  return Math.max(0, limitS - elapsedS);
}

/** `m:ss`, rounded UP so "0:00" only shows once time is really out. */
export function clockText(seconds: number): string {
  const whole = Math.max(0, Math.ceil(seconds));
  const m = Math.floor(whole / 60);
  const s = whole % 60;
  return `${String(m)}:${String(s).padStart(2, '0')}`;
}
