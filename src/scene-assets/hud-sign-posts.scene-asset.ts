import { CylinderGeometry, Group, Mesh } from '@iwsdk/core';
import { woodMaterial } from './materials.js';

const POST_RADIUS_M = 0.035;
// Reaches the HUD panel's underside — tuned against the panel's actual
// rendered size (UIKit content size × the hud-panel scene node's own
// scale), verified live rather than computed, since UIKitML auto-layout
// height isn't available at authoring time. A few cm taller than the
// measured underside so the post visibly overlaps the board instead of
// stopping just short of it.
const POST_HEIGHT_M = 0.8;
// Inset from center, narrower than the panel's half-width so the board
// overhangs its posts a little (Erik's feedback, 2026-08-30: the HUD
// read as a dashboard floating in mid-air — this frames it as a real
// signpost instead). Placed as a sibling scene node sharing hud-panel's
// exact position/rotation (see main.iwsdk.scene.json), so posts need no
// rotation math of their own — only this local X inset and height.
const POST_INSET_M = 1.15;
// UIKitML panels are single-sided, facing local +Z (see
// .claude/rules/uikitml.md) — set the posts a little behind that face
// so they read as support behind the board, not as poles crossing in
// front of its text.
const POST_Z_OFFSET_M = -0.05;

const posts = new Group();
posts.name = 'Skylttstolpar';

for (const xSign of [-1, 1] as const) {
  const post = new Mesh(
    new CylinderGeometry(POST_RADIUS_M, POST_RADIUS_M, POST_HEIGHT_M, 8),
    woodMaterial,
  );
  post.position.set(xSign * POST_INSET_M, POST_HEIGHT_M / 2, POST_Z_OFFSET_M);
  posts.add(post);
}

export default posts;
