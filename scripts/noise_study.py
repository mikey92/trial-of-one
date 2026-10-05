"""How much do skin scores move when only the photo changes?

Each synthetic face in faces/ is scored as generated and after edits a real phone photo can
plausibly have from one week to the next: a bit darker or brighter, warmer or cooler light, a
small tilt, heavier JPEG compression, a closer framing, slight softness. The skin is identical
in every version, so any spread in a score is measurement noise. That spread becomes the
population "capture noise" prior the app starts every trial with.

Every edit stays inside what the app's photo check accepts (see src/quality.ts), so the
spread is what a trial can still see after that check. An HD analysis of 9-12 concerns costs
20 units, so each face gets three edits rather than all eight: one to the light, one to the
framing and one to the camera, rotated across faces so every edit is seen on two or three.

    python scripts/noise_study.py --dry-run    # how many new analyses a run would pay for
    python scripts/noise_study.py              # writes study/results.json and src/study.json
"""

import io
import json
import math
import statistics
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter

sys.path.insert(0, str(Path(__file__).resolve().parent))
from youcam import CONCERNS, analyze, cached, to_jpeg  # noqa: E402

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

# (light, framing, camera) for the first, second, ... face; extra faces start over.
ROTATION = [
    ("15% darker", "tilted 3°", "heavier JPEG"),
    ("warmer light", "closer framing", "slightly soft focus"),
    ("15% brighter", "tilted 3°", "slightly soft focus"),
    ("cooler light", "closer framing", "heavier JPEG"),
    ("15% darker", "closer framing", "heavier JPEG"),
    ("warmer light", "tilted 3°", "slightly soft focus"),
]


def edits_for(i: int) -> list[str]:
    return ["as generated", *ROTATION[i % len(ROTATION)]]


# The app's photo check (measure() and compare() in src/quality.ts, same limits), so the
# study can report the noise a trial is left with after it.
LUMA_RATIO, WARMTH, SHARP_RATIO = 0.15, 0.12, 0.5


def _face(w: int, h: int) -> np.ndarray:
    yy, xx = np.mgrid[0:h, 0:w]
    return ((xx - w / 2) / (w * 0.3)) ** 2 + ((yy - h * 0.47) / (h * 0.36)) ** 2 <= 1


def _copy(img: Image.Image, side: int) -> np.ndarray:
    s = min(1.0, side / max(img.size))
    return np.asarray(img.resize((max(1, round(img.width * s)), max(1, round(img.height * s))), Image.BILINEAR), dtype=np.float64)


def quality(img: Image.Image) -> dict:
    a = _copy(img, 256)
    face = _face(a.shape[1], a.shape[0])
    r, g, b = a[..., 0][face], a[..., 1][face], a[..., 2][face]
    luma = 0.2126 * r + 0.7152 * g + 0.0722 * b
    big = _copy(img, 1024)
    y = 0.2126 * big[..., 0] + 0.7152 * big[..., 1] + 0.0722 * big[..., 2]
    lap = y[1:-1, :-2] + y[1:-1, 2:] + y[:-2, 1:-1] + y[2:, 1:-1] - 4 * y[1:-1, 1:-1]
    inner = _face(big.shape[1], big.shape[0])[1:-1, 1:-1]
    return {"luma": float(luma.mean()), "warmth": float(math.log((r.sum() + 1) / (b.sum() + 1))),
            "clipped": float(((luma > 250) | (luma < 5)).mean()), "sharpness": float(lap[inner].var())}


def passes(q: dict, ref: dict) -> bool:
    return (abs(q["luma"] / ref["luma"] - 1) <= LUMA_RATIO and abs(q["warmth"] - ref["warmth"]) <= WARMTH
            and q["sharpness"] >= ref["sharpness"] * SHARP_RATIO)


def decoded(jpeg: bytes) -> Image.Image:
    return Image.open(io.BytesIO(jpeg)).convert("RGB")


def main() -> None:
    faces = sorted((ROOT / "faces").glob("face_*.png"))
    if not faces:
        sys.exit("No faces in faces/ (run scripts/make_faces.sh first)")
    if "--dry-run" in sys.argv:
        new = 0
        for i, face in enumerate(faces):
            img = Image.open(face).convert("RGB")
            new += sum(not cached(to_jpeg(EDITS[e][0](img), EDITS[e][1])) for e in edits_for(i))
        sys.exit(f"{new} new analyses ({new * 20} units at the HD price for 9-12 concerns)")
    rows = []  # (face, edit, concern, score)
    rejected = set()  # (face, edit) photos the app's check would send back
    for i, face in enumerate(faces):
        img = Image.open(face).convert("RGB")
        ref = None
        for name in edits_for(i):
            edit, q = EDITS[name]
            jpeg = to_jpeg(edit(img), q)
            scores = analyze(jpeg)
            qual = quality(decoded(jpeg))
            ref = ref or qual
            if not passes(qual, ref):
                rejected.add((face.stem, name))
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
        sd = pooled_sd(per_face.values())
        kept = pooled_sd([{e: x for e, x in v.items() if (f, e) not in rejected} for f, v in per_face.items()])
        by_edit = {}
        for e in EDITS:
            shifts = [v[e] - v["as generated"] for v in per_face.values() if e in v and "as generated" in v]
            if shifts and e != "as generated":
                by_edit[e] = round(statistics.mean(shifts), 2)
        for f, v in per_face.items():
            for e, s in v.items():
                gap = abs(s - v["as generated"])
                if e != "as generated" and (naive is None or gap > naive["gap"]):
                    naive = {"concern": c, "before": v["as generated"], "after": s, "edit": e, "gap": gap, "face": f}
        summary.append({"concern": c, "capture": round(kept, 2), "unchecked": round(sd, 2), "day": 3.0, "byEdit": by_edit})
        noise[c] = {"capture": round(max(kept, 0.5), 2), "day": 3.0}

    out = {
        "faces": len(faces),
        "scans": len({(f, e) for f, e, _, _ in rows}),
        "edits": [e for e in EDITS if e != "as generated"],
        "facesPerEdit": {e: len({f for f, ee, _, _ in rows if ee == e}) for e in EDITS if e != "as generated"},
        "rejected": sorted({e for _, e in rejected}),
        "noise": noise,
        "rows": sorted(summary, key=lambda r: -r["unchecked"]),
        "naive": {k: naive[k] for k in ("concern", "before", "after", "edit")} if naive else None,
    }
    (ROOT / "study").mkdir(exist_ok=True)
    (ROOT / "study" / "results.json").write_text(json.dumps({"summary": out, "rows": rows, "rejected": sorted(rejected)}, indent=1))
    (ROOT / "src" / "study.json").write_text(json.dumps(out, indent=1))
    print("rejected by the photo check:", sorted(rejected))
    for r in out["rows"]:
        print(f"{r['concern']:<12} SD {r['capture']:>5.2f} (all edits {r['unchecked']:>5.2f})"
              f"   one-photo MDC {1.96 * math.sqrt(2) * r['capture']:>5.1f}")


def pooled_sd(faces) -> float:
    """Pooled within-face SD: squared deviations from each face's own mean, over the degrees
    of freedom left after estimating those means."""
    groups = [list(v.values()) for v in faces if len(v) > 1]
    ss = sum(sum((x - statistics.mean(g)) ** 2 for x in g) for g in groups)
    return math.sqrt(ss / sum(len(g) - 1 for g in groups))


if __name__ == "__main__":
    main()
