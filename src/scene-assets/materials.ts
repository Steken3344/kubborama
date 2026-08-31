/**
 * Shared material instances for procedural pieces. Reused across
 * assets (never one-off per piece) so placements share texture binds.
 * Evaluated in both the runtime and editor realms — no World/DOM access.
 */
import {
  DoubleSide,
  MeshStandardMaterial,
  RepeatWrapping,
  SRGBColorSpace,
  Texture,
  TextureLoader,
} from '@iwsdk/core';

const textureLoader = new TextureLoader();

function textureUrl(fileName: string): string {
  return `${import.meta.env.BASE_URL}textures/${fileName}`;
}

function loadTexture(
  fileName: string,
  { repeat, srgb }: { repeat?: [number, number]; srgb?: boolean } = {},
): Texture {
  const texture = textureLoader.load(textureUrl(fileName));
  if (repeat) {
    texture.wrapS = RepeatWrapping;
    texture.wrapT = RepeatWrapping;
    texture.repeat.set(repeat[0], repeat[1]);
  }
  if (srgb) {
    texture.colorSpace = SRGBColorSpace;
  }
  return texture;
}

/** Ground grass — tiled ~15x15 per docs/PLAN.md §3. */
export const grassMaterial = new MeshStandardMaterial({
  map: loadTexture('grass004-diff-1k.jpg', { repeat: [15, 15], srgb: true }),
  normalMap: loadTexture('grass004-nor-gl-1k.jpg', { repeat: [15, 15] }),
  roughness: 0.85,
});

/** Pale birch-like wood, shared across sticks, kubbs, and stakes. */
export const woodMaterial = new MeshStandardMaterial({
  map: loadTexture('ash-veneer-diff-1k.jpg', { srgb: true }),
  normalMap: loadTexture('ash-veneer-nor-gl-1k.jpg'),
  roughness: 0.8,
});

/** Darker wood for the king, tinted per docs/PLAN.md §3. */
export const kingWoodMaterial = new MeshStandardMaterial({
  map: loadTexture('japanese-cedar-planks-diff-1k.jpg', { srgb: true }),
  normalMap: loadTexture('japanese-cedar-planks-nor-gl-1k.jpg'),
  roughness: 0.8,
  color: '#8a7358',
});

/** Crown paint (king) and stake tips — real kubb sets often paint both red. */
export const accentRedMaterial = new MeshStandardMaterial({
  color: '#b5342a',
  roughness: 0.6,
});

/** Optional court boundary lines (settings toggle, off by default — real
 * courts have no lines, docs/PLAN.md §2). Pale field-marking paint. */
export const courtLineMaterial = new MeshStandardMaterial({
  color: '#f2f0e6',
  roughness: 0.9,
});

/** MP1 co-presence placeholder avatar (docs/PLAN.md §10) — a plain
 * flat color, deliberately not matching any game-piece material, so a
 * remote player's head/hands are never mistaken for a kubb/king/stick.
 * Real character avatars are a later MP1 step (Quaternius packs, per
 * the plan); this is the "prove the transport works" placeholder. */
export const avatarMaterial = new MeshStandardMaterial({
  color: '#4a90d9',
  roughness: 0.5,
});

/** Wind-indicator leaves (docs/PLAN.md §13's "cheapest possible" flourish
 * — direction/strength readable at a glance). Warm autumn gold rather
 * than green — matches the garden's existing autumn tree/bush dressing
 * AND reads far better against the grass than green-on-green did (a
 * first attempt confirmed live: nearly invisible at normal viewing
 * distance). Double-sided: a thin flat shape tumbling in the air is
 * seen edge-on and face-on alike. */
export const leafMaterial = new MeshStandardMaterial({
  color: '#d1892f',
  roughness: 0.7,
  side: DoubleSide,
});
