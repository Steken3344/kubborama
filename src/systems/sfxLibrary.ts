/**
 * SFX category → file paths, the audio counterpart to src/assets.ts.
 * Plain data (no IWSDK imports needed), kept next to the systems that
 * play it rather than in core/ — this is asset wiring, not game logic.
 * Sourced from Kenney's Impact Sounds / UI Audio packs (CC0) — see
 * ASSETS.md for which variants and why.
 */
export const SFX_CATEGORY = {
  stickSoft: [
    'audio/impact/impactSoft_medium_0.ogg',
    'audio/impact/impactSoft_medium_1.ogg',
    'audio/impact/impactSoft_medium_2.ogg',
  ],
  stickLight: [
    'audio/impact/impactWood_light_0.ogg',
    'audio/impact/impactWood_light_1.ogg',
    'audio/impact/impactWood_light_2.ogg',
  ],
  stickMedium: [
    'audio/impact/impactWood_medium_0.ogg',
    'audio/impact/impactWood_medium_1.ogg',
    'audio/impact/impactWood_medium_2.ogg',
  ],
  kingImpact: [
    'audio/impact/impactWood_heavy_0.ogg',
    'audio/impact/impactWood_heavy_1.ogg',
    'audio/impact/impactWood_heavy_2.ogg',
  ],
  kubbImpact: [
    'audio/impact/impactSoft_medium_0.ogg',
    'audio/impact/impactSoft_medium_1.ogg',
    'audio/impact/impactSoft_medium_2.ogg',
  ],
  kubbFelled: [
    'audio/impact/impactSoft_heavy_0.ogg',
    'audio/impact/impactSoft_heavy_1.ogg',
    'audio/impact/impactSoft_heavy_2.ogg',
  ],
  foley: [
    'audio/impact/impactGeneric_light_0.ogg',
    'audio/impact/impactGeneric_light_1.ogg',
    'audio/impact/impactGeneric_light_2.ogg',
  ],
  uiClick: [
    'audio/ui/click_0.ogg',
    'audio/ui/click_1.ogg',
    'audio/ui/click_2.ogg',
  ],
} as const;

export type SfxCategoryName = keyof typeof SFX_CATEGORY;

export const AMBIENCE_SRC = 'audio/ambience/forest-ambience.ogg';
export const MUSIC_SRC = 'audio/music/gone-fishin.ogg';
