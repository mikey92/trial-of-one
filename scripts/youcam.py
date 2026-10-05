"""Minimal YouCam Skin Analysis client for the study scripts (same flow as worker/youcam.ts).

The API key is read from the file named by YOUCAM_KEY_FILE (default ~/.config/trial-of-one/youcam-key,
mode 600). Results are cached on disk by image hash, so re-running a script never spends a unit twice.
"""

import hashlib
import io
import json
import os
import time
import urllib.request
from pathlib import Path

BASE = "https://yce-api-01.makeupar.com/s2s/v2.0"
CACHE = Path(__file__).resolve().parents[1] / "study" / "cache"
CONCERNS = ["wrinkle", "texture", "pore", "acne", "redness", "oiliness", "moisture", "radiance",
            "age_spot", "dark_circle", "eye_bag", "firmness"]


def _key() -> str:
    path = Path(os.environ.get("YOUCAM_KEY_FILE", "~/.config/trial-of-one/youcam-key")).expanduser()
    return path.read_text().strip()


def _call(path: str, body: dict | None = None) -> dict:
    req = urllib.request.Request(
        BASE + path,
        data=json.dumps(body).encode() if body is not None else None,
        method="POST" if body is not None else "GET",
        headers={"Authorization": f"Bearer {_key()}", "Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=60) as r:
        data = json.load(r)
    if isinstance(data.get("status"), int) and data["status"] >= 400:
        raise RuntimeError(f"YouCam error: {data}")
    return data.get("data", data)


def analyze(jpeg: bytes, tier: str = "hd", concerns: list[str] = CONCERNS) -> dict:
    """Scores for one JPEG: {concern: {"ui": float, "raw": float}}."""
    digest = hashlib.sha256(jpeg + tier.encode() + ",".join(concerns).encode()).hexdigest()
    hit = CACHE / f"{digest}.json"
    if hit.exists():
        return json.loads(hit.read_text())
    files = _call("/file", {"files": [{"content_type": "image/jpeg", "file_name": "scan.jpg", "file_size": len(jpeg)}]})
    f = files["files"][0]
    put = f["requests"][0]
    req = urllib.request.Request(put["url"], data=jpeg, method=put.get("method", "PUT"), headers=put.get("headers", {}))
    urllib.request.urlopen(req, timeout=120).read()
    actions = [f"hd_{c}" if tier == "hd" else c for c in concerns]
    task = _call("/task/skin-analysis", {"src_file_id": f["file_id"], "dst_actions": actions,
                                         "miniserver_args": {"enable_mask_overlay": False}, "format": "json"})
    task_id = task["task_id"]
    wait = 1.0
    for _ in range(90):
        time.sleep(wait)
        data = _call(f"/task/skin-analysis/{task_id}")
        status = data.get("task_status") or data.get("status")
        if status == "success":
            out = {}
            for item in data["results"]["output"]:
                name = item["type"].removeprefix("hd_")
                out[name] = {"ui": item["ui_score"], "raw": item.get("raw_score", item["ui_score"])}
            CACHE.mkdir(parents=True, exist_ok=True)
            hit.write_text(json.dumps(out))
            return out
        if status == "error":
            raise RuntimeError(f"analysis failed: {data}")
        wait = min(wait * 1.4, 4.0)
    raise TimeoutError(task_id)


def to_jpeg(img, quality: int = 92) -> bytes:
    buf = io.BytesIO()
    img.convert("RGB").save(buf, "JPEG", quality=quality)
    return buf.getvalue()
