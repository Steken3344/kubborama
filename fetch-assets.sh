#!/usr/bin/env bash
# KubbOrama — asset fetch script
# Downloads the CC0 assets chosen in IMPLEMENTATION_AND_ASSETS.txt.
# Run from the repo root on the dev machine (Linux): bash fetch-assets.sh
# Poly Haven URL pattern verified via their API 2026-08-26.
set -euo pipefail

RAW="assets/raw"
mkdir -p "$RAW/textures" "$RAW/hdri" "$RAW/audio" "$RAW/models"
LOG="ASSETS.md"
touch "$LOG"

log() {
  # Append a license log line unless the file is already logged
  grep -qF "$1" "$LOG" 2>/dev/null || echo "| $1 | $2 | $3 | $(date +%F) |" >> "$LOG"
}

dl() { # dl <url> <outfile> <source> <license>
  local url="$1" out="$2" src="$3" lic="$4"
  if [ -s "$out" ]; then echo "skip (exists): $out"; else
    echo "fetching: $url"
    curl -fSL --retry 3 --max-time 120 -o "$out" "$url"
  fi
  log "$(basename "$out")" "$src" "$lic"
}

PH_TEX="https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k"
PH_HDR="https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr"

echo "== Wood textures (Poly Haven, CC0) =="
for id in ash_veneer japanese_cedar_planks brown_planks_03; do
  for map in diff nor_gl; do
    dl "$PH_TEX/$id/${id}_${map}_1k.jpg" \
       "$RAW/textures/${id}_${map}_1k.jpg" \
       "https://polyhaven.com/a/$id" "CC0"
  done
done

echo "== Ground grass (ambientCG, CC0) =="
# Tileable ground grass — Poly Haven's grass assets are 3D models, not tiles.
dl "https://ambientcg.com/get?file=Grass004_1K-JPG.zip" \
   "$RAW/textures/Grass004_1K-JPG.zip" \
   "https://ambientcg.com/view?id=Grass004" "CC0"
( cd "$RAW/textures" && unzip -n -q Grass004_1K-JPG.zip -d Grass004 ) || \
  echo "NOTE: unzip failed — inspect $RAW/textures/Grass004_1K-JPG.zip manually"

echo "== Sky HDRIs (Poly Haven, CC0) — 1k for dev, 2k for final =="
for id in autumn_park ballawley_park; do
  dl "$PH_HDR/1k/${id}_1k.hdr" "$RAW/hdri/${id}_1k.hdr" \
     "https://polyhaven.com/a/$id" "CC0"
done
dl "$PH_HDR/2k/autumn_park_2k.hdr" "$RAW/hdri/autumn_park_2k.hdr" \
   "https://polyhaven.com/a/autumn_park" "CC0"

echo "== M5 audio (Kenney + OpenGameArt, CC0) =="
echo "kenney.nl's download link contains a build hash that can rotate —"
echo "if either fetch below 404s, open the asset page in a browser and"
echo "re-grab the 'Continue without donating' link's URL."
mkdir -p "$RAW/audio/impact" "$RAW/audio/ui" "$RAW/audio/ambience" "$RAW/audio/music"
dl "https://kenney.nl/media/pages/assets/impact-sounds/87b4ddecda-1677589768/kenney_impact-sounds.zip" \
   "$RAW/audio/kenney_impact-sounds.zip" \
   "https://kenney.nl/assets/impact-sounds" "CC0"
dl "https://kenney.nl/media/pages/assets/ui-audio/490d233f68-1677590494/kenney_ui-audio.zip" \
   "$RAW/audio/kenney_ui-audio.zip" \
   "https://kenney.nl/assets/ui-audio" "CC0"
dl "https://opengameart.org/sites/default/files/Forest_Ambience_0.mp3" \
   "$RAW/audio/ambience/forest_ambience.mp3" \
   "https://opengameart.org/content/forest-ambience" "CC0"
dl "https://opengameart.org/sites/default/files/gone_fishin_by_memoraphile_CC0.mp3" \
   "$RAW/audio/music/gone_fishin.mp3" \
   "https://opengameart.org/content/gone-fishin" "CC0"
echo "-> unzip the two Kenney zips, then convert the two mp3s to ogg and"
echo "   place the runtime subset in public/audio/ — see ASSETS.md for"
echo "   exactly which variants are committed and why."

echo ""
echo "== Manual downloads (2 clicks each — hashed/interactive URLs) =="
echo "  1. Kenney Nature Kit (CC0):      https://kenney.nl/assets/nature-kit"
echo "  2. (Later, avatars) Quaternius:  https://quaternius.com (CC0)"
echo "  Pixabay Music (PLAN.md's original M5 pick) sits behind a Cloudflare"
echo "  bot challenge and could not be scripted at all, even manually via"
echo "  curl — OpenGameArt.org substituted instead (both fetches above)."
echo ""
echo "Done. Raw assets in $RAW/ (git-ignored); only optimized runtime files"
echo "(KTX2/resized, via gltf-transform) get committed, per the start prompt."
