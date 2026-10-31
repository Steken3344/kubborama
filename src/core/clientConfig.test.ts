import { describe, expect, it } from 'vitest';
import { parseClientConfig } from './clientConfig.js';

describe('parseClientConfig', () => {
  it('accepts the server config', () => {
    const c = { server: true, protocol: 2, room: 'kubborama-dev', debug: true };
    expect(parseClientConfig(c)).toEqual(c);
  });
  it('rejects anything else (an HTML 404 page, a partial object)', () => {
    expect(parseClientConfig('<html>')).toBeNull();
    expect(parseClientConfig({ server: false })).toBeNull();
    expect(
      parseClientConfig({ server: true, protocol: 2, room: '', debug: true }),
    ).toBeNull();
  });
});
