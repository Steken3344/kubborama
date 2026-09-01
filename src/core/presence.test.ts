import { describe, expect, it } from 'vitest';
import {
  buildPresenceMessage,
  defaultPose,
  mirrorPoseToFarBaseline,
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

describe('mirrorPoseToFarBaseline (Erik, 2026-09-01: other headset spawns at the far baseline)', () => {
  const farZ = -6;

  it('mirrors an identity pose (facing -Z) to face +Z at the far baseline', () => {
    const identity: Pose = { position: [0, 0, 0], quaternion: [0, 0, 0, 1] };
    const mirrored = mirrorPoseToFarBaseline(identity, farZ);
    expect(mirrored.position).toEqual([0, 0, farZ]);
    // The 180°-around-Y quaternion itself — mirroring "facing -Z" gives
    // "facing +Z".
    expect(mirrored.quaternion).toEqual([0, 1, 0, 0]);
  });

  it('flips X and translates Z relative to the far baseline, keeps Y', () => {
    const pose: Pose = {
      position: [1, 1.6, -0.5],
      quaternion: [0, 0, 0, 1],
    };
    const mirrored = mirrorPoseToFarBaseline(pose, farZ);
    expect(mirrored.position).toEqual([-1, 1.6, farZ - -0.5]);
  });

  it('preserves quaternion unit length for a non-trivial rotation', () => {
    const halfSqrt2 = Math.SQRT1_2;
    const pose: Pose = {
      position: [0, 0, 0],
      quaternion: [0, halfSqrt2, 0, halfSqrt2],
    };
    const mirrored = mirrorPoseToFarBaseline(pose, farZ);
    const [x, y, z, w] = mirrored.quaternion;
    expect(x * x + y * y + z * z + w * w).toBeCloseTo(1);
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
