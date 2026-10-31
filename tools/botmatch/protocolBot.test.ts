import { describe, expect, it } from 'vitest';
import { parseClientMessage } from '../../src/core/serverProtocol.js';
import { joinMessage, presenceFor, throwMessage } from './protocolBot.js';

describe('protocol bot messages', () => {
  it('builds a join the server accepts', () => {
    expect(parseClientMessage(joinMessage('botmatch-guest-01'))).not.toBeNull();
  });

  it('builds a throw the server accepts', () => {
    const message = throwMessage({
      pieceId: 'stick-0',
      from: [0.2, 1, -7.7],
      velocity: [0, 3.5, 6.5],
      spin: [22, 0, 0],
    });
    expect(parseClientMessage(message)).not.toBeNull();
  });

  it('stands the guest behind the far baseline, facing the court', () => {
    const message = presenceFor('guest', -8);
    expect(parseClientMessage(message)).not.toBeNull();
    if (message.type !== 'presence') throw new Error('not presence');
    expect(message.message.head.position[2]).toBeLessThan(-8);
    expect(message.message.head.position[1]).toBeGreaterThan(1.5);
  });
});
