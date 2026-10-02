#!/usr/bin/env bash
# Converte os glTF baixados por fetch_models.py em GLB otimizados (Draco + WebP).
#   bash build_models.sh <pasta-cache>
# Saída: assets/3d/models/props/<id>.glb
set -euo pipefail
CACHE="$1"
OUT="$(cd "$(dirname "$0")/../models" 2>/dev/null || mkdir -p "$(dirname "$0")/../models" && cd "$(dirname "$0")/../models"; pwd)/props"
mkdir -p "$OUT"
# id  tamanho-máx-textura  proporção-de-vértices (1 = sem simplificar)
while read -r id tex ratio; do
  [ -z "$id" ] && continue
  args=(--compress draco --texture-compress webp --texture-size "$tex" --palette false)
  if [ "$ratio" != "1" ]; then args+=(--simplify true --simplify-ratio "$ratio" --simplify-error 0.002); else args+=(--simplify false); fi
  npx --yes @gltf-transform/cli@4 optimize "$CACHE/$id/$id.gltf" "$OUT/$id.glb" "${args[@]}" > /dev/null
  echo "$id $(du -k "$OUT/$id.glb" | cut -f1) KB"
done <<'LIST'
modern_arm_chair_01 1024 1
mid_century_lounge_chair 1024 1
coffee_table_round_01 1024 1
modern_wooden_cabinet 1024 0.5
side_table_01 512 1
potted_plant_01 1024 0.25
potted_plant_02 1024 0.3
potted_plant_04 512 1
modern_ceiling_lamp_01 512 1
desk_lamp_arm_01 512 0.35
book_encyclopedia_set_01 512 0.12
ceramic_vase_01 512 1
ceramic_vase_03 512 1
wooden_display_shelves_01 1024 1
wicker_basket_01 512 0.3
standing_picture_frame_01 512 1
LIST
