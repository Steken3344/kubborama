import { AssetType, defineAssets } from '@iwsdk/core';
import courtLineLong from './scene-assets/court-line-long.scene-asset.js';
import courtLineShort from './scene-assets/court-line-short.scene-asset.js';
import ground from './scene-assets/ground.scene-asset.js';
import king from './scene-assets/king.scene-asset.js';
import kubb from './scene-assets/kubb.scene-asset.js';
import leaf from './scene-assets/leaf.scene-asset.js';
import stake from './scene-assets/stake.scene-asset.js';
import stick from './scene-assets/stick.scene-asset.js';
import stickRack from './scene-assets/stick-rack.scene-asset.js';

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
  leaf,
  'stick-rack': stickRack,
  'court-line-long': courtLineLong,
  'court-line-short': courtLineShort,
  'reset-menu': {
    type: AssetType.UIKitML as const,
    url: publicAssetUrl('ui/reset-menu.uikitml'),
    name: 'Reset menu',
  },
  hud: {
    type: AssetType.UIKitML as const,
    url: publicAssetUrl('ui/hud.uikitml'),
    name: 'HUD scoreboard',
  },
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
  'rock-large-d': gltfAsset('rock_large_d', 'Garden rock (large)'),
  'rock-small-c': gltfAsset('rock_small_c', 'Garden rock (small)'),
  'rock-tall-g': gltfAsset('rock_tall_g', 'Garden rock (tall)'),
  'rock-small-g': gltfAsset('rock_small_g', 'Garden rock (small)'),
  'rock-large-b': gltfAsset('rock_large_b', 'Garden rock (large)'),
  'tree-oak-fall': gltfAsset('tree_oak_fall', 'Garden tree (autumn, oak)'),
  'tree-tall-fall': gltfAsset('tree_tall_fall', 'Garden tree (autumn, tall)'),
  'tree-pine-tall': gltfAsset('tree_pine_tall_a', 'Garden tree (pine, tall)'),
  'rock-large-e': gltfAsset('rock_large_e', 'Garden rock (large)'),
  'rock-tall-h': gltfAsset('rock_tall_h', 'Garden rock (tall)'),
  'rock-small-flat-a': gltfAsset('rock_small_flat_a', 'Garden rock (flat)'),
  'cliff-block': gltfAsset('cliff_block_rock', 'Hillside cliff (block)'),
  'cliff-large': gltfAsset('cliff_large_rock', 'Hillside cliff (large)'),
  'cliff-top': gltfAsset('cliff_top_rock', 'Hillside cliff (top edge)'),
  'cliff-diagonal': gltfAsset(
    'cliff_diagonal_rock',
    'Hillside cliff (diagonal)',
  ),
  'cliff-half': gltfAsset('cliff_half_rock', 'Hillside cliff (half)'),
  'cliff-corner': gltfAsset('cliff_corner_rock', 'Hillside cliff (corner)'),
  campfire: gltfAsset('campfire_stones', 'Campsite campfire'),
  tent: gltfAsset('tent_detailed_open', 'Campsite tent'),
  'log-bench': gltfAsset('log', 'Campsite log bench'),
  'log-pile': gltfAsset('log_stack', 'Campsite firewood pile'),
  'stump-seat': gltfAsset('stump_round', 'Campsite stump seat'),
  'tree-default-fall': gltfAsset('tree_default_fall', 'Hillside tree (autumn)'),
  'tree-simple-fall': gltfAsset('tree_simple_fall', 'Hillside tree (autumn)'),
  'tree-blocks-fall': gltfAsset('tree_blocks_fall', 'Hillside tree (autumn)'),
  'tree-detailed-fall': gltfAsset(
    'tree_detailed_fall',
    'Hillside tree (autumn)',
  ),
  'tree-pine-round-a': gltfAsset('tree_pine_round_a', 'Hillside pine'),
  'tree-pine-round-c': gltfAsset('tree_pine_round_c', 'Hillside pine'),
  'tree-pine-small': gltfAsset('tree_pine_small_a', 'Hillside pine (small)'),
  'tree-pine-ground': gltfAsset('tree_pine_ground_a', 'Hillside pine (ground)'),
  bush: gltfAsset('plant_bush', 'Hillside bush'),
  'bush-detailed': gltfAsset('plant_bush_detailed', 'Hillside bush'),
  'bush-large': gltfAsset('plant_bush_large', 'Hillside bush (large)'),
  'bush-large-triangle': gltfAsset(
    'plant_bush_large_triangle',
    'Hillside bush (large)',
  ),
  'bush-small': gltfAsset('plant_bush_small', 'Hillside bush (small)'),
  'bush-triangle': gltfAsset('plant_bush_triangle', 'Hillside bush'),
});
