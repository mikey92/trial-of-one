"""Build the example trial shown at #/demo.

One synthetic face goes through a simulated 12-week trial of an azelaic acid serum. The
"effect" is an edit: the flush on the cheeks fades a little more each week (nothing happens
in weeks 1-3, then a gradual change, the shape the azelaic acid trials report). The edit
only lowers the red-green (a*) channel where the cheeks are redder than the face's typical
skin, so skin tone, lips and everything else stay as they were; at full strength it moved
YouCam's redness score from 66 to 82 and no other score by more than a point. Every photo
also gets the kind of week-to-week variation real photos have (small exposure and white
balance drift, a slight tilt, JPEG quality), so the example shows the noise a real trial has
to see through. Every image is then scored by the real YouCam API.

One photo per sitting, as the app asks, and two missed check-ins (weeks 5 and 9), as real
trials have: 3 baseline photos and 10 check-ins, 13 analyses (260 units).

    python scripts/demo_trial.py faces/face_01.png --dry-run   # units a run would spend
    python scripts/demo_trial.py faces/face_01.png             # writes src/demo.json
"""

import json
import random
import sys
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter

sys.path.insert(0, str(Path(__file__).resolve().parent))
from noise_study import _linear, _srgb, decoded, quality, tilt  # noqa: E402
from youcam import CONCERNS, analyze, cached, to_jpeg  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
START = datetime(2026, 7, 6, 8, 0, tzinfo=timezone.utc)
MISSED = {5, 9}  # check-in weeks the example person skipped


_M = np.array([[0.4124, 0.3576, 0.1805], [0.2126, 0.7152, 0.0722], [0.0193, 0.1192, 0.9505]])
_WHITE = np.array([0.95047, 1.0, 1.08883])


def _f(t):
    return np.where(t > (6 / 29) ** 3, np.cbrt(t), t / (3 * (6 / 29) ** 2) + 4 / 29)


def _finv(t):
    return np.where(t > 6 / 29, t ** 3, 3 * (6 / 29) ** 2 * (t - 4 / 29))


def _lab(lin: np.ndarray) -> np.ndarray:
    xyz = lin @ _M.T / _WHITE
    fx, fy, fz = _f(xyz[..., 0]), _f(xyz[..., 1]), _f(xyz[..., 2])
    return np.stack([116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)], -1)


def _linear_from_lab(lab: np.ndarray) -> np.ndarray:
    fy = (lab[..., 0] + 16) / 116
    xyz = np.stack([_finv(fy + lab[..., 1] / 500), _finv(fy), _finv(fy - lab[..., 2] / 200)], -1) * _WHITE
    return xyz @ np.linalg.inv(_M).T


def calm_redness(img: Image.Image, strength: float) -> Image.Image:
    """Fade the cheek flush: lower a* towards the face's median skin a*, on the cheeks only."""
    if strength <= 0:
        return img
    w, h = img.size
    lab = _lab(_linear(img))
    yy, xx = np.mgrid[0:h, 0:w]
    face = ((xx - w / 2) / (w * 0.3)) ** 2 + ((yy - h * 0.47) / (h * 0.36)) ** 2 <= 1
    skin = np.median(lab[..., 1][face])
    cheeks = np.zeros((h, w))
    for cx in (0.285, 0.73):
        cheeks = np.maximum(cheeks, ((((xx - cx * w) / (0.15 * w)) ** 2 + ((yy - 0.47 * h) / (0.11 * h)) ** 2) <= 1) * 1.0)
    cheeks = np.asarray(Image.fromarray((cheeks * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(w * 0.03)),
                        dtype=np.float64) / 255
    excess = lab[..., 1] - skin
    lab[..., 1] -= cheeks * np.clip(excess / 6, 0, 1) * strength * excess
    return _srgb(_linear_from_lab(lab))


def photo_variation(img: Image.Image, rng: random.Random) -> tuple[Image.Image, int]:
    lin = _linear(img) * rng.uniform(0.95, 1.05)
    lin = lin * np.array([rng.uniform(0.985, 1.015), 1.0, rng.uniform(0.985, 1.015)], dtype=np.float32)
    out = _srgb(lin)
    deg = rng.uniform(-1.5, 1.5)
    if abs(deg) > 0.3:
        out = tilt(deg)(out)
    return out, rng.choice([86, 90, 94])


def effect(week: int) -> float:
    """Simulated treatment effect: none until week 3, then rising to its full strength by week 10."""
    return float(np.clip((week - 3) / 7, 0, 1)) * 0.6


def main() -> None:
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    dry = "--dry-run" in sys.argv
    face = Path(args[0] if args else ROOT / "faces" / "face_01.png")
    img = Image.open(face).convert("RGB")
    rng = random.Random(20261005)
    scans = []
    new = 0

    def sitting(at: datetime, phase: str, strength: float, photos: int = 1) -> None:
        nonlocal new
        session = str(uuid.uuid4())
        for i in range(photos):
            shot, q = photo_variation(calm_redness(img, strength), rng)
            jpeg = to_jpeg(shot, q)
            if dry:
                new += not cached(jpeg)
                continue
            res = analyze(jpeg)
            scans.append({
                "id": str(uuid.uuid4()), "takenAt": (at + timedelta(minutes=i)).isoformat().replace("+00:00", "Z"),
                "sessionId": session, "phase": phase,
                "scores": {c: v["ui"] for c, v in res.items()}, "raw": {c: v["raw"] for c, v in res.items()},
                "quality": {"width": shot.width, "height": shot.height, **quality(decoded(jpeg))},
            })
            print(phase, at.date(), i, res.get("redness"), flush=True)

    for d in range(3):
        sitting(START - timedelta(days=6 - 2 * d), "baseline", 0.0)
    for week in range(1, 13):
        if week not in MISSED:
            sitting(START + timedelta(weeks=week), "trial", effect(week))
    if dry:
        sys.exit(f"{new} new analyses ({new * 20} units at the HD price for 9-12 concerns)")

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
            "baseline": {"sessions": 3, "photosPerSession": 1},
            "checkIn": {"everyDays": 7, "photosPerSession": 1},
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
