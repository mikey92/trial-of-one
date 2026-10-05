"""How much do skin scores move when only the photo changes?

Each synthetic face in faces/ is scored as generated and after edits a real phone photo can
plausibly have from one week to the next: a bit darker or brighter, warmer or cooler light, a
small tilt, heavier JPEG compression, a closer framing, slight softness. The skin is identical
in every version, so any spread in a score is measurement noise. That spread becomes the
population "capture noise" prior the app starts every trial with.

    python scripts/noise_study.py              # writes study/results.json and src/study.json
"""

import json
import math
import statistics
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter

sys.path.insert(0, str(Path(__file__).resolve().parent))
from youcam import CONCERNS, analyze, to_jpeg  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]


def _linear(img: Image.Image) -> np.ndarray:
    a = np.asarray(img.convert("RGB"), dtype=np.float32) / 255.0
    return np.where(a <= 0.04045, a / 12.92, ((a + 0.055) / 1.055) ** 2.4)


def _srgb(lin: np.ndarray) -> Image.Image:
    lin = np.clip(lin, 0, 1)
    a = np.where(lin <= 0.0031308, lin * 12.92, 1.055 * lin ** (1 / 2.4) - 0.055)
    return Image.fromarray((a * 255 + 0.5).astype(np.uint8))


def exposure(f: float):
    return lambda img: _srgb(_linear(img) * f)


def white_balance(r: float, b: float):
    return lambda img: _srgb(_linear(img) * np.array([r, 1.0, b], dtype=np.float32))


def tilt(deg: float):
    def run(img: Image.Image) -> Image.Image:
        w, h = img.size
        rot = img.rotate(deg, resample=Image.BICUBIC, expand=False)
        m = int(max(w, h) * math.sin(math.radians(abs(deg)))) + 2
        return rot.crop((m, m, w - m, h - m)).resize((w, h), Image.LANCZOS)
    return run


def zoom(f: float):
    def run(img: Image.Image) -> Image.Image:
        w, h = img.size
        cw, ch = int(w * f), int(h * f)
        x, y = (w - cw) // 2, (h - ch) // 2
        return img.crop((x, y, x + cw, y + ch)).resize((w, h), Image.LANCZOS)
    return run


def soften(radius: float):
    return lambda img: img.filter(ImageFilter.GaussianBlur(radius))


EDITS = {
    "as generated": (lambda img: img, 92),
    "15% darker": (exposure(0.85), 92),
    "15% brighter": (exposure(1.15), 92),
    "warmer light": (white_balance(1.04, 0.94), 92),
    "cooler light": (white_balance(0.96, 1.06), 92),
    "tilted 3°": (tilt(3), 92),
    "closer framing": (zoom(0.92), 92),
    "heavier JPEG": (lambda img: img, 70),
    "slightly soft focus": (soften(1.2), 92),
}


def main() -> None:
    faces = sorted((ROOT / "faces").glob("face_*.png"))
    if not faces:
        sys.exit("No faces in faces/ (run scripts/make_faces.sh first)")
    rows = []  # (face, edit, concern, score)
    for face in faces:
        img = Image.open(face).convert("RGB")
        for name, (edit, q) in EDITS.items():
            scores = analyze(to_jpeg(edit(img), q))
            for c, v in scores.items():
                rows.append((face.stem, name, c, v["ui"]))
            print(face.stem, name, {c: v["ui"] for c, v in scores.items()}, flush=True)

    summary = []
    noise = {}
    naive = None
    for c in CONCERNS:
        per_face = {}
        for f, e, cc, s in rows:
            if cc == c:
                per_face.setdefault(f, {})[e] = s
        if not per_face:
            continue
        variances = [statistics.pvariance(v.values()) for v in per_face.values() if len(v) > 1]
        sd = math.sqrt(sum(variances) / len(variances))
        by_edit = {}
        for e in EDITS:
            shifts = [v[e] - v["as generated"] for v in per_face.values() if e in v and "as generated" in v]
            if shifts:
                by_edit[e] = round(statistics.mean(shifts), 2)
        for f, v in per_face.items():
            for e, s in v.items():
                gap = abs(s - v["as generated"])
                if e != "as generated" and (naive is None or gap > naive["gap"]):
                    naive = {"concern": c, "before": v["as generated"], "after": s, "edit": e, "gap": gap, "face": f}
        summary.append({"concern": c, "capture": round(sd, 2), "day": 3.0, "byEdit": by_edit})
        noise[c] = {"capture": round(max(sd, 0.5), 2), "day": 3.0}

    out = {
        "faces": len(faces),
        "scans": len({(f, e) for f, e, _, _ in rows}),
        "edits": [e for e in EDITS if e != "as generated"],
        "noise": noise,
        "rows": sorted(summary, key=lambda r: -r["capture"]),
        "naive": {k: naive[k] for k in ("concern", "before", "after", "edit")} if naive else None,
    }
    (ROOT / "study").mkdir(exist_ok=True)
    (ROOT / "study" / "results.json").write_text(json.dumps({"summary": out, "rows": rows}, indent=1))
    (ROOT / "src" / "study.json").write_text(json.dumps(out, indent=1))
    for r in out["rows"]:
        print(f"{r['concern']:<12} SD {r['capture']:>5.2f}   one-photo MDC {1.96 * math.sqrt(2) * r['capture']:>5.1f}")


if __name__ == "__main__":
    main()
