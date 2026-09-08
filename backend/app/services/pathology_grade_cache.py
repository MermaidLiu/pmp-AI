"""Disk cache for pathology grade results — same upload returns instantly."""

from __future__ import annotations

import hashlib
import json
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

CACHE_ROOT = Path(__file__).resolve().parents[2] / "data" / "pathology_grade_cache"
MAX_AGE_DAYS = 14
# 仅哈希文件名+大小+头部采样，避免 501 层 ZIP 在请求前哈希全量内容耗时数分钟
_FINGERPRINT_SAMPLE_BYTES = int(os.environ.get("PATHOLOGY_CACHE_FINGERPRINT_SAMPLE", "65536"))


def compute_upload_fingerprint(file_items: list[tuple[str, bytes]]) -> str:
    """Stable hash from upload names/sizes (+ small content sample). Fast for large ZIPs."""
    h = hashlib.sha256()
    sample = max(4096, _FINGERPRINT_SAMPLE_BYTES)
    for name, content in sorted(file_items, key=lambda x: Path(x[0]).name.lower()):
        h.update(Path(name).name.lower().encode())
        h.update(len(content).to_bytes(8, "big"))
        if content:
            h.update(content[:sample])
            if len(content) > sample:
                h.update(content[-min(8192, len(content)) :])
    return h.hexdigest()


def slim_result_for_cache(result: dict[str, Any]) -> dict[str, Any]:
    """Omit large base64 blobs — cache write can take minutes for 501-layer PNG."""
    slim = dict(result)
    if slim.get("result_image_base64"):
        slim["result_image_base64"] = ""
    pci = slim.get("pci")
    if isinstance(pci, dict):
        pci_slim = dict(pci)
        if pci_slim.get("report_image_base64"):
            pci_slim["report_image_base64"] = ""
        slim["pci"] = pci_slim
    raw = slim.get("raw")
    if isinstance(raw, dict):
        slim["raw"] = {k: v for k, v in raw.items() if k not in ("slim_payload",)}
    return slim


def _cache_path(fingerprint: str) -> Path:
    return CACHE_ROOT / f"{fingerprint}.json"


def load_grade_cache(fingerprint: str) -> dict[str, Any] | None:
    path = _cache_path(fingerprint)
    if not path.is_file():
        return None
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None
    created = data.get("created_at")
    if isinstance(created, str):
        try:
            dt = datetime.fromisoformat(created.replace("Z", "+00:00"))
            age_days = (datetime.now(timezone.utc) - dt).days
            if age_days > MAX_AGE_DAYS:
                return None
        except ValueError:
            pass
    result = data.get("result")
    return result if isinstance(result, dict) else None


def save_grade_cache(
    fingerprint: str,
    result: dict[str, Any],
    *,
    upload_names: list[str] | None = None,
) -> None:
    CACHE_ROOT.mkdir(parents=True, exist_ok=True)
    payload = {
        "fingerprint": fingerprint,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "upload_names": upload_names or [],
        "result": result,
    }
    _cache_path(fingerprint).write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")
