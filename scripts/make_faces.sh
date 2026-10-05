#!/bin/sh
# Synthetic faces for the noise study and the example trial: FLUX.1 [schnell] (Apache-2.0)
# running locally through mflux. No real person is photographed or analysed anywhere in this
# project. Generated at 1088x1344 so the HD skin concerns apply (short side >= 1080 px).
set -e
cd "$(dirname "$0")/.."
GEN=".venv-img/bin/mflux-generate"
MODEL="dhairyashil/FLUX.1-schnell-mflux-4bit"
COMMON="natural skin texture with visible pores, bare face with no makeup, neutral expression, looking straight at the camera, hair pulled back, soft even daylight from a window, plain light grey background, sharp focus, professional dermatology-style frontal portrait photo"

i=1
while IFS='|' read -r seed who; do
  out=$(printf "faces/face_%02d.png" "$i")
  if [ ! -f "$out" ]; then
    "$GEN" --model "$MODEL" --base-model schnell --steps 4 --seed "$seed" \
      --width 1088 --height 1344 --low-ram --vae-tiling \
      --prompt "$who, $COMMON" --output "$out"
  fi
  i=$((i + 1))
done <<'EOF'
11|a 34-year-old East Asian woman with mild redness on the cheeks
23|a 52-year-old white man with fine lines around the eyes and a few sun spots
37|a 27-year-old Black woman with a few small blemishes on the chin
41|a 45-year-old South Asian woman with uneven pigmentation on the cheeks
59|a 30-year-old Latino man with visible pores on the nose and oily skin
63|a 61-year-old white woman with wrinkles and dry skin
EOF
