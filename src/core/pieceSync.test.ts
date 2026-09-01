import { describe, expect, it } from 'vitest';
import {
  buildPieceSyncMessage,
  parsePieceSyncMessage,
  PIECE_SYNC_SCHEMA_VERSION,
} from './pieceSync.js';
import type { PieceTransform } from './pieceSync.js';

const king: PieceTransform = {
  id: 'king',
  position: [0, 0.15, -6],
  quaternion: [0, 0, 0, 1],
};
const kubb0: PieceTransform = {
  id: 'kubb-0',
  position: [-1.2, 0.075, -6],
  quaternion: [0, 0, 0, 1],
};

describe('buildPieceSyncMessage', () => {
  it('stamps the current schema version', () => {
    const message = buildPieceSyncMessage([king, kubb0]);
    expect(message.version).toBe(PIECE_SYNC_SCHEMA_VERSION);
    expect(message.pieces).toEqual([king, kubb0]);
  });

  it('accepts an empty piece list', () => {
    expect(buildPieceSyncMessage([]).pieces).toEqual([]);
  });
});

describe('parsePieceSyncMessage (untrusted network boundary)', () => {
  it('round-trips a message built by buildPieceSyncMessage', () => {
    const message = buildPieceSyncMessage([king, kubb0]);
    expect(parsePieceSyncMessage(message)).toEqual(message);
  });

  it('rejects non-object garbage', () => {
    expect(parsePieceSyncMessage('not an object')).toBeNull();
    expect(parsePieceSyncMessage(null)).toBeNull();
    expect(parsePieceSyncMessage(42)).toBeNull();
  });

  it('rejects a mismatched schema version', () => {
    const message = buildPieceSyncMessage([king]);
    expect(parsePieceSyncMessage({ ...message, version: 999 })).toBeNull();
  });

  it('rejects a piece with a missing id', () => {
    const malformed = {
      version: PIECE_SYNC_SCHEMA_VERSION,
      pieces: [{ position: [0, 0, 0], quaternion: [0, 0, 0, 1] }],
    };
    expect(parsePieceSyncMessage(malformed)).toBeNull();
  });

  it('rejects a piece with a wrong-length quaternion', () => {
    const malformed = {
      version: PIECE_SYNC_SCHEMA_VERSION,
      pieces: [{ id: 'king', position: [0, 0, 0], quaternion: [0, 0, 0] }],
    };
    expect(parsePieceSyncMessage(malformed)).toBeNull();
  });
});
