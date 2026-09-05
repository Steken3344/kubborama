# Avatars (MP3b) — design

Date: 2026-09-05. Status: approved by Erik in brainstorming (approach and
§1 explicitly; §2-4 follow from the same decisions). Follows MP3a.

## Why

Erik (2026-09-05, after the 2-headset test): "Jag vill se mer än bara 3
bollar på motståndaren" — today's peer avatar is a head sphere and two hand
spheres in one fixed color (`src/scene-assets/peer-avatar.scene-asset.ts`).

## Decisions (Erik, brainstorming 2026-09-05)

| Question       | Decision                                                                                                                                                                                                                                                     |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Kind of avatar | Procedural body that follows ONLY what is tracked: head (with a visor for gaze), torso + shoulders derived from the head, straight arms shoulder→hand, mitten hands. No legs. Three.js primitives in a scene-asset, no downloaded characters, no avatar SDK. |
| Identity       | Player-chosen avatar color, persisted in settings, synced over the network.                                                                                                                                                                                  |
| Color picker   | A fixed palette of 6 readable colors, one settings button that cycles them (the menu's existing pattern).                                                                                                                                                    |
| Same color     | Allowed — the players stand at opposite ends. _(autonomous default, Erik did not object)_                                                                                                                                                                    |
| Architecture   | Pure `core/avatarPose.ts` + a new `PeerAvatarSystem`; `MultiplayerSystem` stops owning avatars and only forwards presence as bus events.                                                                                                                     |

Locked assumptions: straight arms (no elbow IK — "spaghetti arms" are the
standard for VR avatars without arm tracking and read better than guessed
elbows); no legs; all dimensions in `src/data/avatar.json`, never literals.

## 1. Pure core

`src/core/quat.ts` (new, tiny): `rotateVectorByQuaternion(v, q)`,
`quaternionFromYaw(yawRad)` (about +Y), `quaternionAligningY(dir)` (the
rotation taking +Y onto a unit direction; identity for +Y, 180° about X for
−Y), `yawFromQuaternion(q)` (yaw of the forward vector, 0 = facing −Z,
positive = turning left). Closed-form, no three.js.

`src/core/avatarPose.ts` (new):

```ts
interface AvatarDims { neckM; torsoHeightM; torsoWidthM; torsoDepthM;
  shoulderWidthM; armRadiusM; headRadiusM; handSizeM; yawSmoothingS }
interface Segment { position: Vec3; quaternion: Quat; lengthM: number }
interface AvatarPose { torso: Pose; leftShoulder: Vec3; rightShoulder: Vec3;
  leftArm: Segment; rightArm: Segment }
solveAvatarPose(input: { head: Pose; leftHand: Pose; rightHand: Pose;
  torsoYawRad: number }, dims: AvatarDims): AvatarPose
```

- Torso: straight below the head along world −Y by `neckM + torsoHeightM/2`
  (head tilt must not move the body); rotated only by `torsoYawRad`.
- Shoulders: at height `head.y − neckM`, torso center ± `shoulderWidthM/2`
  along the torso's right axis `(cos yaw, 0, −sin yaw)`.
- Arms: one straight segment per side from shoulder to hand — position =
  midpoint, `lengthM` = distance (min `armRadiusM`), quaternion =
  `quaternionAligningY(dir)`.
- `torsoYawRad` is an INPUT: derived from the head by `yawFromQuaternion`
  and exponentially smoothed in the system (`yawSmoothingS`) — bodies turn
  slower than heads; the pure function stays stateless.

`src/data/avatar.json`: `neckM 0.12, torsoHeightM 0.45, torsoWidthM 0.36,
torsoDepthM 0.18, shoulderWidthM 0.40, armRadiusM 0.04, headRadiusM 0.11,
handSizeM 0.09, yawSmoothingS 0.25` — starting values, tuned in the headset.

`src/data/avatar-palette.json`: 6 entries `{ id, hex }` — red, blue, orange,
purple, teal, white (no green: it vanishes against the grass). i18n names
`avatarColor<Id>` in sv/en for the button label.

## 2. Systems

- **Settings**: `avatarColorIndex: z.number().int().min(0).default(0)`
  (`.default` for migration, like `micMuted`); `SettingsSystem.
setAvatarColorIndex()`; menu button `avatar-color-button` cycling the
  palette ("Färg: Röd"), label refreshed like the others.
- **Presence v2** (`core/presence.ts`): `colorIndex: z.number().int().min(0).max(15)`
  added; version 1 → 2 (both headsets run the same deploy; a mismatch is a
  dropped message, as today). The receiver clamps to the palette length.
- **`MultiplayerSystem`**: no longer creates, poses or removes avatars. On a
  valid presence message it emits `PeerPresence { peerId, message }`; on
  peer leave `PeerLeft { peerId }`; on room-empty the existing
  `MultiplayerPeerDisconnected`. `peerAvatars`, `peerAvatarsInFlight`,
  `applyPeerPresence`, `applyPoseToPart`, `createPeerAvatar`,
  `removePeerAvatar` and the `Object3D`/`Vector3`/`Quaternion` imports used
  only by them move out. `destroy()` no longer disposes avatars.
- **`PeerAvatarSystem`** (new, `src/systems/peerAvatar.ts`): owns
  `Map<peerId, { entity, object3D, material, smoothedYaw }>`; on
  `PeerPresence` instantiates the avatar (same in-flight guard + peer-gone
  check as today), clones the material per instance and sets the palette
  color from `colorIndex`, smooths yaw, calls `solveAvatarPose`, applies
  the result to named parts (`head`, `visor` is a child of head, `torso`,
  `leftArm`, `rightArm`, `leftHand`, `rightHand`) — position/quaternion
  copy plus `scale.y = lengthM` on the arm capsules (unit-length geometry).
  On `PeerLeft` disposes the entity and the cloned material. No allocation
  in `update()` — there is no `update()`; everything is event-driven with
  preallocated scratch objects.
- **Scene asset** (`peer-avatar.scene-asset.ts`): head sphere + a dark
  visor box on its −Z face; torso as a rounded box (`torsoWidthM ×
torsoHeightM × torsoDepthM`); two arm capsules of unit length (scaled at
  runtime); two mitten hands (rounded box `handSizeM`). All parts share one
  `avatarMaterial` in the prototype — the system clones it per instance.
  Dimensions read from `avatar.json` via `config.ts` (assets may import
  config — it is deterministic and side-effect free).
- **HUD**: the score `A - B` becomes two spans (`match-score-a`, `match-
score-b`) colored with each player's palette hex; local color from
  settings, remote from the last `PeerPresence`. Hidden rows unchanged.

## 3. Testing

- Core: `quat.ts` (rotate by identity/90°-Y/180°-X; `quaternionAligningY`
  for ±Y, +X, a diagonal — verify by rotating +Y and comparing; `yawFrom-
Quaternion` round-trips `quaternionFromYaw` for several yaws);
  `avatarPose.ts` (torso below head regardless of head tilt; shoulders
  symmetric; arm length = distance; arm quaternion maps +Y to the
  direction; yaw 0 vs π mirrors shoulders); presence v2 round trip + v1
  rejection + colorIndex bounds; settings default and migration for
  `avatarColorIndex`.
- Emulator (solo): scene loads, zero errors; `PeerAvatarSystem`
  registered; settings button cycles the label; HUD unchanged in solo.
  The avatar itself cannot be seen without a peer — render the asset once
  with `scene_render_file` on a scratch scene for a visual check.
- Headset gate (Erik, 2 Quests): the opponent has a body, arms follow the
  hands, the visor shows gaze, the chosen color shows on the other headset
  and in the HUD score.

## Out of scope

Elbow IK, legs, hand-tracking finger poses, name tags, custom textures.
