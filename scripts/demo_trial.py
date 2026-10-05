"""Build the example trial shown at #/demo.

One synthetic face goes through a simulated 12-week trial of an azelaic acid serum. The
"effect" is an edit: cheek redness is reduced a little more each week (nothing happens in
weeks 1-3, then a gradual change, the shape the azelaic acid trials report). Every photo
also gets the kind of week-to-week variation real photos have (small exposure and white
balance drift, a slight tilt), so the example shows the noise a real trial has to see
through. Every image is then scored by the real YouCam API.

    python scripts/demo_trial.py faces/face_03.png      # writes src/demo.json
"""

import json
import random
import sys
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path

import numpy as np
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
from noise_study import _linear, _srgb, tilt  # noqa: E402
from youcam import CONCERNS, analyze, to_jpeg  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
START = datetime(2026, 7, 6, 8, 0, tzinfo=timezone.utc)


def calm_redness(img: Image.Image, strength: float) -> Image.Image:
    """Pull reddish skin towards its neighbourhood's neutral tone, weighted by how red it is."""
    if strength <= 0:
        return img
    lin = _linear(img)
    r, g, b = lin[..., 0], lin[..., 1], lin[..., 2]
    redness = np.clip((r - (g + b) / 2) / (r + 1e-4) - 0.18, 0, None)  # skin is mildly red; flushed skin more so
    w = np.clip(redness * 4, 0, 1)[..., None] * strength
    target = lin.copy()
    target[..., 0] = (g + b) / 2 + (r - (g + b) / 2) * 0.55
    return _srgb(lin * (1 - w) + target * w)


def photo_variation(img: Image.Image, rng: random.Random) -> tuple[Image.Image, int]:
    lin = _linear(img) * rng.uniform(0.95, 1.05)
    lin = lin * np.array([rng.uniform(0.985, 1.015), 1.0, rng.uniform(0.985, 1.015)], dtype=np.float32)
    out = _srgb(lin)
    deg = rng.uniform(-1.5, 1.5)
    if abs(deg) > 0.3:
        out = tilt(deg)(out)
    return out, rng.choice([86, 90, 94])


def effect(week: int) -> float:
    """Simulated treatment effect: none until week 3, then rising to full strength by week 10."""
    return float(np.clip((week - 3) / 7, 0, 1)) * 0.9


def main() -> None:
    face = Path(sys.argv[1] if len(sys.argv) > 1 else ROOT / "faces" / "face_01.png")
    img = Image.open(face).convert("RGB")
    rng = random.Random(20261005)
    scans = []

    def sitting(at: datetime, phase: str, strength: float, photos: int = 2) -> None:
        session = str(uuid.uuid4())
        for i in range(photos):
            shot, q = photo_variation(calm_redness(img, strength), rng)
            res = analyze(to_jpeg(shot, q))
            scans.append({
                "id": str(uuid.uuid4()), "takenAt": (at + timedelta(minutes=i)).isoformat().replace("+00:00", "Z"),
                "sessionId": session, "phase": phase,
                "scores": {c: v["ui"] for c, v in res.items()}, "raw": {c: v["raw"] for c, v in res.items()},
                "quality": {"width": shot.width, "height": shot.height, "luma": 0, "warmth": 0, "clipped": 0, "sharpness": 100},
            })
            print(phase, at.date(), i, res.get("redness"), flush=True)

    for d in range(3):
        sitting(START - timedelta(days=6 - 2 * d), "baseline", 0.0)
    for week in range(1, 13):
        sitting(START + timedelta(weeks=week), "trial", effect(week))

    trial = {
        "id": "demo",
        "createdAt": (START - timedelta(days=7)).isoformat().replace("+00:00", "Z"),
        "plan": {
            "product": "Azelaic acid 15% serum (example)",
            "actives": [{"id": "azelaic_acid", "name": "Azelaic acid",
                         "evidence": "Thiboutot et al., J Am Acad Dermatol 2003: 15% azelaic acid gel improved rosacea redness and lesions over 12 weeks."}],
            "targets": ["redness"],
            "tracked": ["redness"] + [c for c in CONCERNS if c != "redness"],
            "onsetWeeks": 4, "fairWeeks": 12, "earlyEffects": [], "tier": "hd",
            "baseline": {"sessions": 3, "photosPerSession": 2},
            "checkIn": {"everyDays": 7, "photosPerSession": 2},
            "startedAt": START.isoformat().replace("+00:00", "Z"),
            "verdictDue": (START + timedelta(weeks=12)).date().isoformat(),
            "rules": [],
        },
        "scans": scans,
        "changes": [{"at": (START + timedelta(weeks=5, days=2)).isoformat().replace("+00:00", "Z"), "what": "slept badly / stressed"}],
        "notes": [],
    }
    (ROOT / "src" / "demo.json").write_text(json.dumps(trial, indent=1))
    print("wrote src/demo.json with", len(scans), "scans")


if __name__ == "__main__":
    main()
