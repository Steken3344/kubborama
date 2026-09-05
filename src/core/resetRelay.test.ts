import { describe, expect, it } from 'vitest';
import {
  buildResetRequest,
  parseResetRequest,
  RESET_RELAY_SCHEMA_VERSION,
} from './resetRelay.js';

describe('resetRelay', () => {
  it('round-trips', () => {
    const m = buildResetRequest();
    expect(m.version).toBe(RESET_RELAY_SCHEMA_VERSION);
    expect(parseResetRequest(m)).toEqual(m);
  });
  it('rejects garbage and a wrong version', () => {
    expect(parseResetRequest(null)).toBeNull();
    expect(parseResetRequest({})).toBeNull();
    expect(parseResetRequest({ version: 99 })).toBeNull();
  });
});
