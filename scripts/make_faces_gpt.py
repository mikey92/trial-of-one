#!/usr/bin/env python3
"""Synthetic faces from GPT image generation, through the same Responses relay the app's notes use:
the prompts in faces.txt, for any face_NN.png still missing (the FLUX Space has a daily quota).
GPT images are 1024x1536, so each is enlarged by 6% to 1088x1632 to reach the HD concerns'
1080 px short side. No real person is photographed or analysed anywhere in this project.

    LLM_RELAY_URL=http://127.0.0.1:8812 LLM_RELAY_KEY_FILE=/path/to/relay-key \
      .venv-img/bin/python scripts/make_faces_gpt.py
"""

import base64
import io
import json
import os
import urllib.request
from pathlib import Path

from PIL import Image

from make_faces_hf import ROOT, prompts

SIZE = (1088, 1632)


def generate(prompt: str) -> Image.Image:
    key = Path(os.environ["LLM_RELAY_KEY_FILE"]).expanduser().read_text().strip()
    body = {
        "model": "gpt-5.5",
        "reasoning": {"effort": "low"},
        "store": False,
        "stream": True,
        "instructions": "Generate exactly the photograph described, with the image tool. Do not add text or borders.",
        "input": [{"role": "user", "content": [{"type": "input_text", "text": f"Photorealistic photo: {prompt}"}]}],
        "tools": [{"type": "image_generation", "size": "1024x1536", "quality": "high", "output_format": "png"}],
        "tool_choice": {"type": "image_generation"},
    }
    req = urllib.request.Request(os.environ["LLM_RELAY_URL"].rstrip("/") + "/responses", data=json.dumps(body).encode(),
                                 method="POST", headers={"content-type": "application/json", "x-relay-key": key,
                                                         "x-relay-collect": "1"})
    with urllib.request.urlopen(req, timeout=300) as r:
        answer = json.load(r)
    for item in answer.get("output", []):
        if item.get("type") == "image_generation_call" and item.get("result"):
            return Image.open(io.BytesIO(base64.b64decode(item["result"]))).convert("RGB")
    raise RuntimeError(f"no image in the answer: {[i.get('type') for i in answer.get('output', [])]}")


def main() -> None:
    for i, (_, prompt) in enumerate(prompts(), 1):
        out = ROOT / "faces" / f"face_{i:02d}.png"
        if out.exists():
            continue
        generate(prompt).resize(SIZE, Image.LANCZOS).save(out)
        print(out.name, SIZE, flush=True)


if __name__ == "__main__":
    main()
