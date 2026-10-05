#!/usr/bin/env python3
"""Synthetic faces for the noise study and the example trial, from FLUX.1 [schnell]
(Apache-2.0) on its public Hugging Face Space: the prompts and seeds in faces.txt, generated
on the Space's GPU so the laptop never loads the model. make_faces.sh does the same locally.
No real person is photographed or analysed anywhere in this project.

    .venv-img/bin/python scripts/make_faces_hf.py     # writes faces/face_01.png ... face_06.png
"""

from pathlib import Path

from gradio_client import Client
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SPACE = "black-forest-labs/FLUX.1-schnell"
WIDTH, HEIGHT = 1088, 1344  # short side >= 1080 px, so the HD skin concerns apply


def prompts():
    common, faces = "", []
    for line in (ROOT / "scripts/faces.txt").read_text().splitlines():
        if not line.strip() or line.startswith("#"):
            continue
        key, text = line.split("|", 1)
        if key == "common":
            common = text
        else:
            faces.append((int(key), text))
    return [(seed, f"{who}, {common}") for seed, who in faces]


def main() -> None:
    out_dir = ROOT / "faces"
    out_dir.mkdir(exist_ok=True)
    client = None
    for i, (seed, prompt) in enumerate(prompts(), 1):
        out = out_dir / f"face_{i:02d}.png"
        if out.exists():
            continue
        client = client or Client(SPACE, verbose=False)
        path, _ = client.predict(prompt=prompt, seed=seed, randomize_seed=False, width=WIDTH, height=HEIGHT,
                                 num_inference_steps=4, api_name="/infer")
        Image.open(path).convert("RGB").save(out)
        print(out.name, Image.open(out).size, flush=True)


if __name__ == "__main__":
    main()
