# KubbOrama — asset license log

All assets are CC0 (public domain). `fetch-assets.sh` downloads raw
sources into `assets/raw/` (git-ignored, never committed); only the
optimized runtime files actually used in `public/` are committed.

## Runtime assets (committed, in `public/`)

| File                                                  | Source                                           | License | Notes                                                                                                                            |
| ----------------------------------------------------- | ------------------------------------------------ | ------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `textures/ash-veneer-{diff,nor-gl}-1k.jpg`            | https://polyhaven.com/a/ash_veneer               | CC0     | Kubb/stick wood                                                                                                                  |
| `textures/japanese-cedar-planks-{diff,nor-gl}-1k.jpg` | https://polyhaven.com/a/japanese_cedar_planks    | CC0     | King wood (tinted darker in-material)                                                                                            |
| `textures/brown-planks-03-{diff,nor-gl}-1k.jpg`       | https://polyhaven.com/a/brown_planks_03          | CC0     | Fence/rack wood                                                                                                                  |
| `textures/grass004-{diff,nor-gl}-1k.jpg`              | https://ambientcg.com/view?id=Grass004           | CC0     | Ground; AO/roughness/displacement maps dropped per plan §3                                                                       |
| `textures/autumn-park-1k.hdr`                         | https://polyhaven.com/a/autumn_park              | CC0     | Sky (DomeTexture) + IBL (IBLTexture) — `subfolder: 'textures'` is required by both components' FilePath field                    |
| `gltf/tree_plateau/tree_plateau.glb`                  | https://kenney.nl/assets/nature-kit (Nature Kit) | CC0     | Garden treeline                                                                                                                  |
| `gltf/tree_fat_fall/tree_fat_fall.glb`                | https://kenney.nl/assets/nature-kit (Nature Kit) | CC0     | Garden treeline (autumn variant)                                                                                                 |
| `gltf/tree_small_fall/tree_small_fall.glb`            | https://kenney.nl/assets/nature-kit (Nature Kit) | CC0     | Garden treeline (autumn variant)                                                                                                 |
| `gltf/tree_cone_fall/tree_cone_fall.glb`              | https://kenney.nl/assets/nature-kit (Nature Kit) | CC0     | Garden treeline (autumn variant)                                                                                                 |
| `gltf/tree_thin_dark/tree_thin_dark.glb`              | https://kenney.nl/assets/nature-kit (Nature Kit) | CC0     | Garden treeline                                                                                                                  |
| `gltf/fence_planks/fence_planks.glb`                  | https://kenney.nl/assets/nature-kit (Nature Kit) | CC0     | Boundary fence behind the player                                                                                                 |
| `gltf/rock_large_d/rock_large_d.glb`                  | https://kenney.nl/assets/nature-kit (Nature Kit) | CC0     | Garden dressing (M2 feedback: court surroundings felt bare)                                                                      |
| `gltf/rock_small_c/rock_small_c.glb`                  | https://kenney.nl/assets/nature-kit (Nature Kit) | CC0     | Garden dressing                                                                                                                  |
| `gltf/rock_tall_g/rock_tall_g.glb`                    | https://kenney.nl/assets/nature-kit (Nature Kit) | CC0     | Garden dressing                                                                                                                  |
| `gltf/rock_small_g/rock_small_g.glb`                  | https://kenney.nl/assets/nature-kit (Nature Kit) | CC0     | Garden dressing                                                                                                                  |
| `gltf/rock_large_b/rock_large_b.glb`                  | https://kenney.nl/assets/nature-kit (Nature Kit) | CC0     | Garden dressing                                                                                                                  |
| `audio/impact/impactWood_medium_{0,1,2}.ogg`          | https://kenney.nl/assets/impact-sounds           | CC0     | Stick impact, high force — THE klonk (stick vs kubb, the common case)                                                            |
| `audio/impact/impactWood_heavy_{0,1,2}.ogg`           | https://kenney.nl/assets/impact-sounds           | CC0     | King impact — deeper klonk; also used for the KingFelled event                                                                   |
| `audio/impact/impactWood_light_{0,1,2}.ogg`           | https://kenney.nl/assets/impact-sounds           | CC0     | Stick impact, mid force — lighter clack (approximates stick vs stick)                                                            |
| `audio/impact/impactSoft_medium_{0,1,2}.ogg`          | https://kenney.nl/assets/impact-sounds           | CC0     | Stick impact, low force — soft thud (approximates stick vs ground)                                                               |
| `audio/impact/impactSoft_heavy_{0,1,2}.ogg`           | https://kenney.nl/assets/impact-sounds           | CC0     | Kubb impact / KubbFelled — no dedicated tumble/roll sound in this pack, documented substitute                                    |
| `audio/impact/impactGeneric_light_{0,1,2}.ogg`        | https://kenney.nl/assets/impact-sounds           | CC0     | Grab/release foley, played at low volume                                                                                         |
| `audio/ui/click_{0,1,2}.ogg`                          | https://kenney.nl/assets/ui-audio                | CC0     | Settings-panel button clicks                                                                                                     |
| `audio/ambience/forest-ambience.ogg`                  | https://opengameart.org/content/forest-ambience  | CC0     | Garden ambience loop, by Rick Hoppmann (published as TinyWorlds), 2014; mp3→ogg via ffmpeg                                       |
| `audio/music/gone-fishin.ogg`                         | https://opengameart.org/content/gone-fishin      | CC0     | Background music loop, banjo/bluegrass, by You're Perfect Studio; dual CC-BY 4.0/OGA-BY 3.0/CC0 — CC0 chosen; mp3→ogg via ffmpeg |

## Raw downloads (not committed — `assets/raw/`, fetched by `fetch-assets.sh`)

| File                                  | Source                                          | License |
| ------------------------------------- | ----------------------------------------------- | ------- |
| `ash_veneer_diff_1k.jpg`              | https://polyhaven.com/a/ash_veneer              | CC0     |
| `ash_veneer_nor_gl_1k.jpg`            | https://polyhaven.com/a/ash_veneer              | CC0     |
| `japanese_cedar_planks_diff_1k.jpg`   | https://polyhaven.com/a/japanese_cedar_planks   | CC0     |
| `japanese_cedar_planks_nor_gl_1k.jpg` | https://polyhaven.com/a/japanese_cedar_planks   | CC0     |
| `brown_planks_03_diff_1k.jpg`         | https://polyhaven.com/a/brown_planks_03         | CC0     |
| `brown_planks_03_nor_gl_1k.jpg`       | https://polyhaven.com/a/brown_planks_03         | CC0     |
| `Grass004_1K-JPG.zip`                 | https://ambientcg.com/view?id=Grass004          | CC0     |
| `autumn_park_1k.hdr`                  | https://polyhaven.com/a/autumn_park             | CC0     |
| `ballawley_park_1k.hdr`               | https://polyhaven.com/a/ballawley_park          | CC0     | Alternative sky, unused for now                    |
| `autumn_park_2k.hdr`                  | https://polyhaven.com/a/autumn_park             | CC0     | Higher-res version, unused for now (1k in use)     |
| `kenney_nature-kit.zip`               | https://kenney.nl/assets/nature-kit             | CC0     | 330 low-poly models; trees/fence/rocks used so far |
| `kenney_impact-sounds.zip`            | https://kenney.nl/assets/impact-sounds          | CC0     | 130 sounds; klonk/thud/clack variants used         |
| `kenney_ui-audio.zip`                 | https://kenney.nl/assets/ui-audio               | CC0     | Button click variants used                         |
| `forest_ambience.mp3`                 | https://opengameart.org/content/forest-ambience | CC0     | Garden ambience loop                               |
| `gone_fishin.mp3`                     | https://opengameart.org/content/gone-fishin     | CC0     | Music loop; dual-licensed, CC0 chosen              |

M5 audio note: kenney.nl's asset pages are documented elsewhere in this
project (fetch-assets.sh) as needing a manual browser click for the
download link, since the URL contains a build hash that can rotate.
That's still true — the hashed URLs above were current as of
2026-08-28 (re-verify before reusing if `fetch-assets.sh` reports a 404).
Pixabay Music (PLAN.md's original suggestion) sits behind a Cloudflare
bot challenge and could not be fetched non-interactively at all;
OpenGameArt.org substituted for both ambience and music instead — both
CC0-verified on their own asset pages, not just the collection page
they were found through. mp3→ogg conversion used `ffmpeg-static`
installed as a one-off scratch tool (not a project dependency — nothing
in this repo needs ffmpeg at build or run time).
