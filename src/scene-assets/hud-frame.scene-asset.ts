import { BoxGeometry, Group, Mesh } from '@iwsdk/core';
import { kingWoodMaterial } from './materials.js';

// Erik's feedback, 2026-08-30: wanted the HUD to read as a mounted sign
// board ("en tavla"), not a bare floating panel. A single flat board in
// the darker king wood tone, peeking out from behind the UIKitML panel
// like a picture-frame mount. Sized against the panel's FIXED footprint:
// hud.uikitml is 220 × 160 UIKit units (cm) × hud-panel's node scale
// 1.3 = 2.86 m × 2.08 m. The panel used to auto-size and grew past the
// board once the match rows appeared (Erik, 2026-10-31) — keep these two
// in step with hud.uikitml's width/height.
const PANEL_WIDTH_M = 2.86;
const PANEL_HEIGHT_M = 2.08;
const FRAME_MARGIN_M = 0.12;
const FRAME_THICKNESS_M = 0.03;

// UIKitML panels are single-sided, facing local +Z (see
// .claude/rules/uikitml.md) — sit a little behind that face so the
// frame reads as a mount behind the board, not as a slab in front of
// its text. Placed as a sibling scene node sharing hud-panel's exact
// transform (see main.iwsdk.scene.json). A bare Mesh root has its own
// transform overwritten by the placing scene node, so this offset must
// live on a child of a Group root instead (matching stick-rack's and
// hud-sign-posts' own convention) to actually take effect.
const FRAME_Z_OFFSET_M = -0.03;

const root = new Group();
root.name = 'HUD-ram';

const board = new Mesh(
  new BoxGeometry(
    PANEL_WIDTH_M + FRAME_MARGIN_M * 2,
    PANEL_HEIGHT_M + FRAME_MARGIN_M * 2,
    FRAME_THICKNESS_M,
  ),
  kingWoodMaterial,
);
board.position.z = FRAME_Z_OFFSET_M;
root.add(board);

export default root;
