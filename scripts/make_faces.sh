#!/bin/sh
# Synthetic faces for the noise study and the example trial: FLUX.1 [schnell] (Apache-2.0)
# running locally through mflux; make_faces_hf.py runs the same prompts (faces.txt) on the
# Hugging Face Space instead. No real person is photographed or analysed anywhere in this
# project. Generated at 1088x1344 so the HD skin concerns apply (short side >= 1080 px).
set -e
cd "$(dirname "$0")/.."
GEN=".venv-img/bin/mflux-generate"
MODEL="dhairyashil/FLUX.1-schnell-mflux-4bit"
COMMON="$(sed -n 's/^common|//p' scripts/faces.txt)"

i=1
while IFS='|' read -r seed who; do
  out=$(printf "faces/face_%02d.png" "$i")
  if [ ! -f "$out" ]; then
    "$GEN" --model "$MODEL" --base-model schnell --steps 4 --seed "$seed" \
      --width 1088 --height 1344 --low-ram --vae-tiling \
      --prompt "$who, $COMMON" --output "$out"
  fi
  i=$((i + 1))
done <<EOF
$(grep -E '^[0-9]+\|' scripts/faces.txt)
EOF
