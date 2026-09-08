"""Persist full-slice CT annotation datasets: resultBase64 + DICOM meta + binary masks."""

from __future__ import annotations

import base64
import io
import json
import re
import shutil
import zipfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import numpy as np
import pydicom
from PIL import Image

from app.services.pathology_imaging_client import collect_dicom_files, normalize_ct_api_payload
from app.services.pci_scoring_client import _pick_item_scalar, _to_int, _SLICE_REGION_KEYS, _SLICE_SC_KEYS

ANNOTATION_ROOT = Path(__file__).resolve().parents[2] / "data" / "annotations"
MASK_DIFF_THRESHOLD = 12


def _decode_b64_image(text: str) -> bytes:
    s = text.strip()
    if s.startswith("data:image"):
        s = s.split(",", 1)[-1]
    s = s.replace("\n", "").replace("\r", "").replace(" ", "")
    return base64.b64decode(s)


def _safe_stem(filename: str, index: int) -> str:
    stem = Path(filename).name or f"slice_{index:04d}.dcm"
    safe = re.sub(r"[^\w.\-]+", "_", stem)
    return f"{index:04d}_{safe}"


def _dicom_meta_from_bytes(content: bytes) -> dict[str, Any]:
    try:
        ds = pydicom.dcmread(io.BytesIO(content), force=True)
    except Exception as exc:
        return {"parse_error": str(exc)}

    def _seq(val: Any) -> list[Any]:
        if val is None:
            return []
        try:
            return [float(x) for x in val]
        except (TypeError, ValueError):
            return [str(x) for x in val]

    return {
        "SOPInstanceUID": str(getattr(ds, "SOPInstanceUID", "") or ""),
        "StudyInstanceUID": str(getattr(ds, "StudyInstanceUID", "") or ""),
        "SeriesInstanceUID": str(getattr(ds, "SeriesInstanceUID", "") or ""),
        "InstanceNumber": int(getattr(ds, "InstanceNumber", 0) or 0),
        "SliceLocation": float(getattr(ds, "SliceLocation", 0) or 0),
        "ImagePositionPatient": _seq(getattr(ds, "ImagePositionPatient", None)),
        "ImageOrientationPatient": _seq(getattr(ds, "ImageOrientationPatient", None)),
        "PixelSpacing": _seq(getattr(ds, "PixelSpacing", None)),
        "SliceThickness": float(getattr(ds, "SliceThickness", 0) or 0),
        "Rows": int(getattr(ds, "Rows", 0) or 0),
        "Columns": int(getattr(ds, "Columns", 0) or 0),
        "Modality": str(getattr(ds, "Modality", "") or ""),
        "PatientID": str(getattr(ds, "PatientID", "") or ""),
    }


def _build_dicom_index(file_items: list[tuple[str, bytes]]) -> dict[str, bytes]:
    index: dict[str, bytes] = {}
    for name, content in collect_dicom_files(file_items):
        index[Path(name).name.lower()] = content
    return index


def extract_binary_mask(
    annotated_png: bytes,
    preview_png: bytes | None = None,
    *,
    diff_threshold: int = MASK_DIFF_THRESHOLD,
) -> tuple[np.ndarray, int]:
    """Return (mask uint8 0/255, lesion_pixel_count). Prefer diff(preview, annotated)."""
    anno_rgb = np.array(Image.open(io.BytesIO(annotated_png)).convert("RGB"))

    if preview_png:
        prev_rgb = np.array(Image.open(io.BytesIO(preview_png)).convert("RGB"))
        if prev_rgb.shape != anno_rgb.shape:
            prev_rgb = np.array(
                Image.open(io.BytesIO(preview_png)).convert("RGB").resize((anno_rgb.shape[1], anno_rgb.shape[0]))
            )
        diff = np.abs(prev_rgb.astype(np.int16) - anno_rgb.astype(np.int16)).max(axis=2)
        mask = (diff > diff_threshold).astype(np.uint8)
    else:
        gray = anno_rgb.mean(axis=2)
        saturation = anno_rgb.max(axis=2).astype(np.int16) - gray.astype(np.int16)
        mask = ((saturation > 18) & (gray > 20) & (gray < 245)).astype(np.uint8)

    pixel_count = int(mask.sum())
    return mask * 255, pixel_count


def save_annotation_dataset_from_api(
    api_payload: dict[str, Any],
    file_items: list[tuple[str, bytes]],
    *,
    exam_id: str = "",
    session_id: str = "",
) -> dict[str, Any]:
    """Save all CT module result slices to disk with DICOM metadata and binary masks."""
    api_payload = normalize_ct_api_payload(api_payload)
    results = api_payload.get("results")
    if not isinstance(results, list) or not results:
        raise ValueError("接口 results 为空，无法导出标注数据集")

    sid = session_id or str(api_payload.get("sessionId") or api_payload.get("session_id") or "")
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    dataset_id = exam_id.strip() if exam_id.strip() else (f"ann_{sid}" if sid else f"ann_{stamp}")
    dataset_id = re.sub(r"[^\w.\-]+", "_", dataset_id)

    root = ANNOTATION_ROOT / dataset_id
    slices_dir = root / "slices"
    slices_dir.mkdir(parents=True, exist_ok=True)

    dicom_index = _build_dicom_index(file_items)
    slice_records: list[dict[str, Any]] = []
    slices_with_mask = 0
    total_lesion_pixels = 0

    for idx, item in enumerate(results):
        if not isinstance(item, dict):
            continue
        filename = str(item.get("filename") or f"slice_{idx}.dcm")
        result_b64 = item.get("resultBase64") or item.get("result_base64") or ""
        preview_b64 = item.get("pngBase64") or item.get("png_base64") or ""
        if not isinstance(result_b64, str) or not result_b64.strip():
            continue

        stem = _safe_stem(filename, idx)
        annotated_bytes = _decode_b64_image(result_b64)
        preview_bytes = _decode_b64_image(preview_b64) if isinstance(preview_b64, str) and preview_b64.strip() else None

        annotated_path = slices_dir / f"{stem}_annotated.png"
        mask_path = slices_dir / f"{stem}_mask.png"
        meta_path = slices_dir / f"{stem}_meta.json"

        annotated_path.write_bytes(annotated_bytes)
        mask, lesion_pixels = extract_binary_mask(annotated_bytes, preview_bytes)
        Image.fromarray(mask, mode="L").save(mask_path, format="PNG")

        dicom_bytes = dicom_index.get(Path(filename).name.lower())
        dicom_meta = _dicom_meta_from_bytes(dicom_bytes) if dicom_bytes else {"matched": False, "filename": filename}
        if dicom_bytes:
            dicom_meta["matched"] = True

        sc_raw = _pick_item_scalar(item, _SLICE_SC_KEYS)
        region_raw = _pick_item_scalar(item, _SLICE_REGION_KEYS)
        sc_val = _to_int(sc_raw) if sc_raw is not None else None
        region_val = _to_int(region_raw) if region_raw is not None else None

        meta_path.write_text(json.dumps(dicom_meta, ensure_ascii=False, indent=2), encoding="utf-8")

        has_overlay = lesion_pixels > 0
        if has_overlay:
            slices_with_mask += 1
            total_lesion_pixels += lesion_pixels

        slice_records.append(
            {
                "index": idx,
                "filename": filename,
                "annotated_png": str(annotated_path.relative_to(root)),
                "mask_png": str(mask_path.relative_to(root)),
                "dicom_meta_json": str(meta_path.relative_to(root)),
                "mask_pixel_count": lesion_pixels,
                "has_overlay": has_overlay,
                "dicom_matched": bool(dicom_bytes),
                "sc": sc_val,
                "region": region_val,
            }
        )

    if not slice_records:
        shutil.rmtree(root, ignore_errors=True)
        raise ValueError("未找到含 resultBase64 的有效切片")

    manifest = {
        "dataset_id": dataset_id,
        "session_id": sid,
        "exam_id": exam_id or "",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "api_status": api_payload.get("status"),
        "api_count": api_payload.get("count"),
        "slice_count": len(slice_records),
        "slices_with_mask": slices_with_mask,
        "total_lesion_pixels": total_lesion_pixels,
        "mask_method": "diff(pngBase64, resultBase64)" if any(
            isinstance(r, dict) and (r.get("pngBase64") or r.get("png_base64")) for r in results
        ) else "color_overlay",
        "slices": slice_records,
    }
    manifest_path = root / "manifest.json"
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")

    zip_path = ""
    try:
        zip_path = str(build_annotation_zip(dataset_id))
    except Exception:
        zip_path = ""

    return {
        "dataset_id": dataset_id,
        "slice_count": len(slice_records),
        "slices_with_mask": slices_with_mask,
        "total_lesion_pixels": total_lesion_pixels,
        "manifest_path": str(manifest_path),
        "zip_path": zip_path,
    }


def list_annotation_datasets() -> list[dict[str, Any]]:
    if not ANNOTATION_ROOT.is_dir():
        return []
    out: list[dict[str, Any]] = []
    for child in sorted(ANNOTATION_ROOT.iterdir(), key=lambda p: p.stat().st_mtime, reverse=True):
        if not child.is_dir():
            continue
        manifest_file = child / "manifest.json"
        if not manifest_file.is_file():
            continue
        try:
            manifest = json.loads(manifest_file.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            continue
        out.append(
            {
                "dataset_id": manifest.get("dataset_id", child.name),
                "session_id": manifest.get("session_id", ""),
                "exam_id": manifest.get("exam_id", ""),
                "created_at": manifest.get("created_at", ""),
                "slice_count": manifest.get("slice_count", 0),
                "slices_with_mask": manifest.get("slices_with_mask", 0),
                "total_lesion_pixels": manifest.get("total_lesion_pixels", 0),
            }
        )
    return out


def load_annotation_manifest(dataset_id: str) -> dict[str, Any]:
    safe_id = re.sub(r"[^\w.\-]+", "_", dataset_id)
    manifest_path = ANNOTATION_ROOT / safe_id / "manifest.json"
    if not manifest_path.is_file():
        raise FileNotFoundError(f"标注数据集不存在：{dataset_id}")
    return json.loads(manifest_path.read_text(encoding="utf-8"))


def build_annotation_zip(dataset_id: str) -> Path:
    safe_id = re.sub(r"[^\w.\-]+", "_", dataset_id)
    root = ANNOTATION_ROOT / safe_id
    if not root.is_dir():
        raise FileNotFoundError(f"标注数据集不存在：{dataset_id}")

    zip_path = ANNOTATION_ROOT / f"{safe_id}.zip"
    if zip_path.is_file() and zip_path.stat().st_mtime >= (root / "manifest.json").stat().st_mtime:
        return zip_path

    with zipfile.ZipFile(zip_path, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        for path in sorted(root.rglob("*")):
            if path.is_file():
                zf.write(path, arcname=str(path.relative_to(root)))
    return zip_path
