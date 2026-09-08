"""Persist CT annotated slice PNGs for browser pagination (keyed by upload fingerprint)."""

from __future__ import annotations

import base64
import json
import re
from pathlib import Path
from typing import Any

from app.services.pathology_imaging_client import get_ct_results, normalize_ct_api_payload
from app.services.pci_scoring_client import _SLICE_REGION_KEYS, _SLICE_SC_KEYS, _pick_item_scalar, _to_int

SLICE_ROOT = Path(__file__).resolve().parents[2] / "data" / "pathology_slices"


def _decode_b64_image(text: str) -> bytes:
    s = text.strip()
    if s.startswith("data:image"):
        s = s.split(",", 1)[-1]
    s = s.replace("\n", "").replace("\r", "").replace(" ", "")
    return base64.b64decode(s)


def _store_dir(fingerprint: str) -> Path:
    safe = re.sub(r"[^\w.\-]+", "_", fingerprint.strip())
    return SLICE_ROOT / safe


def build_slice_manifest(api_payload: dict[str, Any] | None) -> list[dict[str, Any]]:
    """Metadata-only manifest for all annotated slices (no base64)."""
    if not isinstance(api_payload, dict):
        return []
    results = get_ct_results(normalize_ct_api_payload(api_payload))
    manifest: list[dict[str, Any]] = []
    for idx, item in enumerate(results):
        if not isinstance(item, dict):
            continue
        result_b64 = item.get("resultBase64") or item.get("result_base64") or ""
        if not isinstance(result_b64, str) or len(result_b64.strip()) < 80:
            continue
        sc_raw = _pick_item_scalar(item, _SLICE_SC_KEYS)
        region_raw = _pick_item_scalar(item, _SLICE_REGION_KEYS)
        manifest.append(
            {
                "index": idx,
                "filename": str(item.get("filename") or f"slice_{idx}.dcm"),
                "sc": _to_int(sc_raw) if sc_raw is not None else None,
                "region": _to_int(region_raw) if region_raw is not None else None,
            }
        )
    return manifest


def load_slice_manifest(fingerprint: str) -> list[dict[str, Any]]:
    path = _store_dir(fingerprint) / "manifest.json"
    if not path.is_file():
        return []
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return []
    slices = data.get("slices")
    return slices if isinstance(slices, list) else []


def first_annotated_slice_base64(api_payload: dict[str, Any] | None) -> str:
    """Representative annotated PNG (base64) for preview when top-level field is empty."""
    if not isinstance(api_payload, dict):
        return ""
    manifest = build_slice_manifest(api_payload)
    if not manifest:
        return ""
    results = get_ct_results(normalize_ct_api_payload(api_payload))
    for entry in manifest:
        idx = int(entry["index"])
        if idx >= len(results) or not isinstance(results[idx], dict):
            continue
        item = results[idx]
        result_b64 = item.get("resultBase64") or item.get("result_base64") or ""
        if isinstance(result_b64, str) and len(result_b64.strip()) >= 80:
            return result_b64.strip()
    return ""


def save_slice_store(fingerprint: str, api_payload: dict[str, Any]) -> dict[str, Any]:
    """Write annotated PNGs + manifest.json. Returns summary stats."""
    manifest = build_slice_manifest(api_payload)
    if not manifest:
        return {"slice_count": 0, "slices_with_mask": 0}

    root = _store_dir(fingerprint)
    root.mkdir(parents=True, exist_ok=True)
    results = get_ct_results(normalize_ct_api_payload(api_payload))

    saved = 0
    for entry in manifest:
        idx = int(entry["index"])
        item = results[idx] if idx < len(results) and isinstance(results[idx], dict) else {}
        result_b64 = item.get("resultBase64") or item.get("result_base64") or ""
        if not isinstance(result_b64, str) or not result_b64.strip():
            continue
        try:
            png_bytes = _decode_b64_image(result_b64)
        except Exception:
            continue
        (root / f"{idx:04d}.png").write_bytes(png_bytes)
        saved += 1

    payload = {
        "fingerprint": fingerprint,
        "slice_count": len(manifest),
        "slices_saved": saved,
        "slices": manifest,
    }
    (root / "manifest.json").write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")
    return {"slice_count": len(manifest), "slices_saved": saved}


def get_slice_image_bytes(fingerprint: str, index: int) -> bytes | None:
    path = _store_dir(fingerprint) / f"{index:04d}.png"
    if not path.is_file():
        return None
    try:
        return path.read_bytes()
    except OSError:
        return None


def slice_store_ready(fingerprint: str) -> bool:
    return (_store_dir(fingerprint) / "manifest.json").is_file()
