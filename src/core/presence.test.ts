import { describe, expect, it } from 'vitest';
import {
  buildPresenceMessage,
  defaultPose,
  parsePresenceMessage,
  PRESENCE_SCHEMA_VERSION,
} from './presence.js';
import type { Pose } from './presence.js';

const headPose: Pose = { position: [0, 1.6, 0], quaternion: [0, 0, 0, 1] };
const leftPose: Pose = {
  position: [-0.2, 1.3, -0.3],
  quaternion: [0, 0, 0, 1],
};
const rightPose: Pose = {
  position: [0.2, 1.3, -0.3],
  quaternion: [0, 0, 0, 1],
};

describe('buildPresenceMessage', () => {
  it('stamps the current schema version', () => {
    const message = buildPresenceMessage({
      head: headPose,
      leftHand: leftPose,
      rightHand: rightPose,
    });
    expect(message.version).toBe(PRESENCE_SCHEMA_VERSION);
    expect(message.head).toEqual(headPose);
  });
});

describe('parsePresenceMessage (untrusted network boundary)', () => {
  it('round-trips a message built by buildPresenceMessage', () => {
    const message = buildPresenceMessage({
      head: headPose,
      leftHand: leftPose,
      rightHand: rightPose,
    });
    expect(parsePresenceMessage(message)).toEqual(message);
  });

  it('rejects non-object garbage', () => {
    expect(parsePresenceMessage('not an object')).toBeNull();
    expect(parsePresenceMessage(null)).toBeNull();
    expect(parsePresenceMessage(42)).toBeNull();
    expect(parsePresenceMessage(undefined)).toBeNull();
  });

  it('rejects an empty object', () => {
    expect(parsePresenceMessage({})).toBeNull();
  });

  it('rejects a mismatched schema version', () => {
    const message = buildPresenceMessage({
      head: headPose,
      leftHand: leftPose,
      rightHand: rightPose,
    });
    expect(parsePresenceMessage({ ...message, version: 999 })).toBeNull();
  });

  it('rejects a pose with a wrong-length position tuple', () => {
    const malformed = {
      version: PRESENCE_SCHEMA_VERSION,
      head: { position: [0, 1.6], quaternion: [0, 0, 0, 1] },
      leftHand: leftPose,
      rightHand: rightPose,
    };
    expect(parsePresenceMessage(malformed)).toBeNull();
  });

  it('rejects a pose with non-numeric fields', () => {
    const malformed = {
      version: PRESENCE_SCHEMA_VERSION,
      head: { position: ['nope', 1.6, 0], quaternion: [0, 0, 0, 1] },
      leftHand: leftPose,
      rightHand: rightPose,
    };
    expect(parsePresenceMessage(malformed)).toBeNull();
  });
});

describe('defaultPose', () => {
  it('is the identity pose', () => {
    expect(defaultPose()).toEqual({
      position: [0, 0, 0],
      quaternion: [0, 0, 0, 1],
    });
  });

  it('returns a fresh object each call (no shared-reference footgun)', () => {
    expect(defaultPose()).not.toBe(defaultPose());
  });
});
