import { beforeEach, describe, expect, it } from 'vitest';
import { getRecentLogs, log, MAX_LOG_ENTRIES } from './log.js';

describe('log', () => {
  beforeEach(() => {
    // Drain the ring buffer between tests.
    for (let i = 0; i < MAX_LOG_ENTRIES; i++) {
      log('debug', 'throw', '__drain__');
    }
  });

  it('records channel and message', () => {
    log('info', 'throw', 'release', { speedMps: 8.2 });
    const recent = getRecentLogs(1);
    expect(recent).toHaveLength(1);
    expect(recent[0]?.channel).toBe('throw');
    expect(recent[0]?.level).toBe('info');
    expect(recent[0]?.message).toBe('release');
    expect(recent[0]?.data).toEqual({ speedMps: 8.2 });
  });

  it('keeps only the most recent MAX_LOG_ENTRIES', () => {
    for (let i = 0; i < MAX_LOG_ENTRIES + 10; i++) {
      log('debug', 'physics', `entry-${i}`);
    }
    const recent = getRecentLogs(MAX_LOG_ENTRIES + 10);
    expect(recent.length).toBe(MAX_LOG_ENTRIES);
    expect(recent[recent.length - 1]?.message).toBe(
      `entry-${MAX_LOG_ENTRIES + 9}`,
    );
  });

  it('getRecentLogs(count) returns only the last N, newest last', () => {
    log('debug', 'grab', 'a');
    log('debug', 'grab', 'b');
    log('debug', 'grab', 'c');
    const recent = getRecentLogs(2);
    expect(recent.map((e) => e.message)).toEqual(['b', 'c']);
  });
});
