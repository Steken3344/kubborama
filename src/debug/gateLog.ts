import { log } from '../core/log.js';
import { debugContext } from './debugContext.js';

/** A gate-report probe line (docs/superpowers/specs/2026-09-26-gate-
 * report-design.md) — a no-op unless the debug relay is on, so normal
 * play never pays for, or prints, gate lines. */
export function gateLog(message: string, data: Record<string, unknown>): void {
  if (debugContext.enabled) {
    log('info', 'gate', message, data);
  }
}
