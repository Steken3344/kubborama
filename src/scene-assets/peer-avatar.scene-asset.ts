import {
  BoxGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  SphereGeometry,
} from '@iwsdk/core';
import { avatar } from '../config.js';
import { avatarMaterial } from './materials.js';

/**
 * MP3b peer avatar (Erik, 2026-09-05: "mer än bara 3 bollar"): a
 * procedural body built ONLY from what is tracked — head + two hands —
 * with the torso, shoulders and straight arms derived by
 * core/avatarPose.ts at runtime. No legs, no elbow IK (see the spec).
 *
 * Every part is named so PeerAvatarSystem can find it inside a freshly
 * instantiated clone via getObjectByName — a fresh clone per remote
 * peer, never the prototype itself. The arms are UNIT-length cylinders
 * along +Y; the system scales `scale.y` to the solved arm length. All
 * body parts share `avatarMaterial` here; the system swaps in a
 * per-instance clone tinted with that player's chosen palette color.
 * The visor keeps its own dark material so gaze stays readable in any
 * body color.
 *
 * Dimensions come from src/data/avatar.json via config.ts — assets may
 * import config (deterministic, side-effect free; see CLAUDE.md on the
 * two JS realms this module is evaluated in).
 */
const dims = avatar;

const visorMaterial = new MeshStandardMaterial({
  color: '#1c1c22',
  roughness: 0.25,
  metalness: 0.2,
});

const root = new Group();
root.name = 'PeerAvatar';

const head = new Mesh(
  new SphereGeometry(dims.headRadiusM, 16, 12),
  avatarMaterial,
);
head.name = 'head';
root.add(head);

// A dark band across the -Z face of the head: the direction the other
// player is looking, which the sphere alone never shows. A spherical
// CAP, not a box — a flat box can't both sit on a sphere and stay
// visible (the first attempt, moved inward, ended up 63 % hidden inside
// the head; second review, 2026-09-05). three.js SphereGeometry puts
// phi = π/2 at +Z, so the band is centred on phi = 3π/2 to face -Z, a
// hair above the equator, and 3 mm proud of the head surface.
const VISOR_WIDTH_RAD = 1.6;
const VISOR_HEIGHT_RAD = 0.5;
const visor = new Mesh(
  new SphereGeometry(
    dims.headRadiusM + 0.003,
    16,
    6,
    (3 * Math.PI) / 2 - VISOR_WIDTH_RAD / 2,
    VISOR_WIDTH_RAD,
    Math.PI / 2 - VISOR_HEIGHT_RAD * 0.6,
    VISOR_HEIGHT_RAD,
  ),
  visorMaterial,
);
visor.name = 'visor';
head.add(visor);

const torso = new Mesh(
  new BoxGeometry(dims.torsoWidthM, dims.torsoHeightM, dims.torsoDepthM),
  avatarMaterial,
);
torso.name = 'torso';
root.add(torso);

for (const side of ['left', 'right'] as const) {
  const arm = new Mesh(
    new CylinderGeometry(dims.armRadiusM, dims.armRadiusM, 1, 10),
    avatarMaterial,
  );
  arm.name = `${side}Arm`;
  root.add(arm);

  // A rounded-off mitten rather than a sphere: flat, slightly longer
  // than wide, so the hand's orientation (the controller's) reads.
  const hand = new Mesh(
    new BoxGeometry(dims.handSizeM, dims.handSizeM * 0.5, dims.handSizeM * 1.2),
    avatarMaterial,
  );
  hand.name = `${side}Hand`;
  root.add(hand);
}

export default root;
