import { AssetType, defineAssets } from '@iwsdk/core';
import ground from './scene-assets/ground.scene-asset.js';
import king from './scene-assets/king.scene-asset.js';
import kubb from './scene-assets/kubb.scene-asset.js';
import stake from './scene-assets/stake.scene-asset.js';
import stick from './scene-assets/stick.scene-asset.js';

const publicAssetUrl = (filePath: string): string =>
  `${import.meta.env.BASE_URL}${filePath.replace(/^\/+/u, '')}`;

const gltfAsset = (id: string, name: string) => ({
  type: AssetType.GLTF as const,
  url: publicAssetUrl(`gltf/${id}/${id}.glb`),
  name,
});

export default defineAssets({
  ground,
  kubb,
  king,
  stick,
  stake,
  'tree-plateau': gltfAsset('tree_plateau', 'Garden tree (round)'),
  'tree-fat-fall': gltfAsset('tree_fat_fall', 'Garden tree (autumn, full)'),
  'tree-small-fall': gltfAsset(
    'tree_small_fall',
    'Garden tree (autumn, small)',
  ),
  'tree-cone-fall': gltfAsset(
    'tree_cone_fall',
    'Garden tree (autumn, conical)',
  ),
  'tree-thin-dark': gltfAsset('tree_thin_dark', 'Garden tree (thin, dark)'),
  'fence-planks': gltfAsset('fence_planks', 'Boundary fence section'),
});
