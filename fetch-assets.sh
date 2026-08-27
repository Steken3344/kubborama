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

echo ""
echo "== Manual downloads (2 clicks each — hashed/interactive URLs) =="
echo "  1. Kenney Nature Kit (CC0):      https://kenney.nl/assets/nature-kit"
echo "  2. Kenney Impact Sounds (CC0):   https://kenney.nl/assets/impact-sounds"
echo "     -> unzip both into $RAW/models/ and $RAW/audio/"
echo "  3. Music (pick by taste):        https://pixabay.com/music/search/calm%20acoustic/"
echo "     -> save into $RAW/audio/music/ and add a line to ASSETS.md"
echo "  4. (Later, avatars) Quaternius:  https://quaternius.com (CC0)"
echo ""
echo "Done. Raw assets in $RAW/ (git-ignored); only optimized runtime files"
echo "(KTX2/resized, via gltf-transform) get committed, per the start prompt."
