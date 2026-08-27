# KubbOrama — asset license log

All assets are CC0 (public domain). `fetch-assets.sh` downloads raw
sources into `assets/raw/` (git-ignored, never committed); only the
optimized runtime files actually used in `public/` are committed.

## Runtime assets (committed, in `public/`)

| File                                                  | Source                                           | License | Notes                                                                                                         |
| ----------------------------------------------------- | ------------------------------------------------ | ------- | ------------------------------------------------------------------------------------------------------------- |
| `textures/ash-veneer-{diff,nor-gl}-1k.jpg`            | https://polyhaven.com/a/ash_veneer               | CC0     | Kubb/stick wood                                                                                               |
| `textures/japanese-cedar-planks-{diff,nor-gl}-1k.jpg` | https://polyhaven.com/a/japanese_cedar_planks    | CC0     | King wood (tinted darker in-material)                                                                         |
| `textures/brown-planks-03-{diff,nor-gl}-1k.jpg`       | https://polyhaven.com/a/brown_planks_03          | CC0     | Fence/rack wood                                                                                               |
| `textures/grass004-{diff,nor-gl}-1k.jpg`              | https://ambientcg.com/view?id=Grass004           | CC0     | Ground; AO/roughness/displacement maps dropped per plan §3                                                    |
| `textures/autumn-park-1k.hdr`                         | https://polyhaven.com/a/autumn_park              | CC0     | Sky (DomeTexture) + IBL (IBLTexture) — `subfolder: 'textures'` is required by both components' FilePath field |
| `gltf/tree_plateau/tree_plateau.glb`                  | https://kenney.nl/assets/nature-kit (Nature Kit) | CC0     | Garden treeline                                                                                               |
| `gltf/tree_fat_fall/tree_fat_fall.glb`                | https://kenney.nl/assets/nature-kit (Nature Kit) | CC0     | Garden treeline (autumn variant)                                                                              |
| `gltf/tree_small_fall/tree_small_fall.glb`            | https://kenney.nl/assets/nature-kit (Nature Kit) | CC0     | Garden treeline (autumn variant)                                                                              |
| `gltf/tree_cone_fall/tree_cone_fall.glb`              | https://kenney.nl/assets/nature-kit (Nature Kit) | CC0     | Garden treeline (autumn variant)                                                                              |
| `gltf/tree_thin_dark/tree_thin_dark.glb`              | https://kenney.nl/assets/nature-kit (Nature Kit) | CC0     | Garden treeline                                                                                               |
| `gltf/fence_planks/fence_planks.glb`                  | https://kenney.nl/assets/nature-kit (Nature Kit) | CC0     | Boundary fence behind the player                                                                              |

## Raw downloads (not committed — `assets/raw/`, fetched by `fetch-assets.sh`)

| File                                  | Source                                        | License |
| ------------------------------------- | --------------------------------------------- | ------- |
| `ash_veneer_diff_1k.jpg`              | https://polyhaven.com/a/ash_veneer            | CC0     |
| `ash_veneer_nor_gl_1k.jpg`            | https://polyhaven.com/a/ash_veneer            | CC0     |
| `japanese_cedar_planks_diff_1k.jpg`   | https://polyhaven.com/a/japanese_cedar_planks | CC0     |
| `japanese_cedar_planks_nor_gl_1k.jpg` | https://polyhaven.com/a/japanese_cedar_planks | CC0     |
| `brown_planks_03_diff_1k.jpg`         | https://polyhaven.com/a/brown_planks_03       | CC0     |
| `brown_planks_03_nor_gl_1k.jpg`       | https://polyhaven.com/a/brown_planks_03       | CC0     |
| `Grass004_1K-JPG.zip`                 | https://ambientcg.com/view?id=Grass004        | CC0     |
| `autumn_park_1k.hdr`                  | https://polyhaven.com/a/autumn_park           | CC0     |
| `ballawley_park_1k.hdr`               | https://polyhaven.com/a/ballawley_park        | CC0     | Alternative sky, unused for now                   |
| `autumn_park_2k.hdr`                  | https://polyhaven.com/a/autumn_park           | CC0     | Higher-res version, unused for now (1k in use)    |
| `kenney_nature-kit.zip`               | https://kenney.nl/assets/nature-kit           | CC0     | 330 low-poly models; only trees/fence used so far |

Pending (M5): Kenney Impact Sounds (klonk variants) and a Pixabay music
loop — not fetched yet, out of scope for M1.
