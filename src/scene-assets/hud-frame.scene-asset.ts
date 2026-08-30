import { BoxGeometry, Group, Mesh } from '@iwsdk/core';
import { kingWoodMaterial } from './materials.js';

// Erik's feedback, 2026-08-30: wanted the HUD to read as a mounted sign
// board ("en tavla"), not a bare floating panel. A single flat board in
// the darker king wood tone, peeking out from behind the UIKitML panel
// like a picture-frame mount. Sized against the panel's actual rendered
// footprint (hud-panel's CSS width:220 UIKit-units × its node scale 1.3
// ≈ 2.86m wide, height estimated the same way ≈ 1.68m tall — verified
// live via screenshot, not computable at authoring time since UIKitML
// auto-layout height has no static answer).
const PANEL_WIDTH_M = 2.86;
const PANEL_HEIGHT_M = 1.68;
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
