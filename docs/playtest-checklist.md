# Play-session checklist (emulator)

My own play sessions in the managed IWSDK browser with the emulated
Quest 3 (docs/superpowers/specs/2026-10-31-bot-match-and-play-sessions-design.md).
Done after every visual change and once per larger feature, time-boxed.

Setup: `npx iwsdk dev up` (managed browser open), wait for
`browserCommandReady: true`, accept the XR session. For an opponent,
run the protocol bot as player B (`npm run botmatch -- --scenario room`
leaves it seated for a minute, or connect `ProtocolBot` from a
scratch script). Text tools first (`scene_get_hierarchy`, `ecs_query`,
console logs); screenshots small (`browser_screenshot` at ≤ 512 px)
and only where the look is the question.

1. **Spawn**: view from the near baseline: court, kubbs, king, HUD
   sign readable, nothing inside the player.
2. **Look around 360°**: trees, sky, ground; no holes, z-fighting,
   floating or sunken props, no seams in the grass.
3. **Walk** (left thumbstick): the walk limit holds at the line and at
   the garden edge; snap turn (right thumbstick) feels clean.
4. **Grab and throw a stick** (squeeze, then `xr_animate_to` for the
   swing, see the iwsdk-grab skill): it flies, spins, lands; the HUD
   counts it.
5. **A whole turn**: six sticks; the sin bin fills beside the court
   without overlap; the turn passes.
6. **Menu**: every tab (Spel, Alternativ, Statistik) in Swedish and
   English; no overflowing or clipped text, buttons react once.
7. **Court switch**: lines, kubbs and rack move; nothing left behind.
8. **Advantage line**: shown in the right place when field kubbs remain;
   the teleport lands on it.
9. **Opponent avatar**: body, head, hands and colour; stands behind
   its line; no clash with the own colour.
10. **Frame time**: `scene_get_render_stats`: draw calls and triangles,
    compared with the last session (note them below).

## Session log

| Date | Build | Found (fixed) | Ideas (→ IMPROVEMENTS.md) | Draw calls / tris |
| ---- | ----- | ------------- | ------------------------- | ----------------- |
