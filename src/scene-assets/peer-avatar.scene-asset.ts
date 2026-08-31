import { Group, Mesh, SphereGeometry } from '@iwsdk/core';
import { avatarMaterial } from './materials.js';

const HEAD_RADIUS_M = 0.11;
const HAND_RADIUS_M = 0.05;

/**
 * MP1 co-presence placeholder (docs/PLAN.md §10, Erik's 2 Quests):
 * head + two hands, nothing else — matches the plan's own avatar
 * design ("replicate only what is tracked... NO legs and NO IK").
 * Real character avatars are a later step; this only has to prove
 * the transport works. Each part is named so MultiplayerSystem can
 * find it inside a freshly instantiated clone via getObjectByName —
 * a fresh clone per remote peer, never the prototype itself (see
 * .claude/rules/assets-and-manifest.md).
 */
const avatar = new Group();
avatar.name = 'PeerAvatar';

const head = new Mesh(new SphereGeometry(HEAD_RADIUS_M, 12, 8), avatarMaterial);
head.name = 'head';
avatar.add(head);

const leftHand = new Mesh(
  new SphereGeometry(HAND_RADIUS_M, 10, 6),
  avatarMaterial,
);
leftHand.name = 'leftHand';
avatar.add(leftHand);

const rightHand = new Mesh(
  new SphereGeometry(HAND_RADIUS_M, 10, 6),
  avatarMaterial,
);
rightHand.name = 'rightHand';
avatar.add(rightHand);

export default avatar;
