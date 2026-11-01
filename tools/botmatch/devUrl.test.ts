import { describe, expect, it } from 'vitest';
import { localUrlFrom } from './devUrl.js';

describe('localUrlFrom', () => {
  it('reads the running session’s local URL', () => {
    expect(
      localUrlFrom({
        data: { state: { session: { localUrl: 'https://localhost:8083/' } } },
      }),
    ).toBe('https://localhost:8083/');
  });

  it('is null without a session', () => {
    expect(localUrlFrom({ data: { state: {} } })).toBeNull();
    expect(localUrlFrom(null)).toBeNull();
  });
});
