"""Lesion ROI volume from CT segmentation masks + DICOM spacing."""

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

import numpy as np

from app.services.pathology_imaging_client import collect_dicom_files, get_ct_results, normalize_ct_api_payload
from app.services.platform_annotation_dataset import (
    ANNOTATION_ROOT,
    _build_dicom_index,
    _decode_b64_image,
    _dicom_meta_from_bytes,
    extract_binary_mask,
    load_annotation_manifest,
)


def _spacing_from_meta(meta: dict[str, Any]) -> tuple[float, float, float]:
    ps = meta.get("PixelSpacing") or []
    row_mm = 1.0
    col_mm = 1.0
    if isinstance(ps, list) and len(ps) >= 2:
        try:
            row_mm = float(ps[0])
            col_mm = float(ps[1])
        except (TypeError, ValueError):
            pass
    try:
        thick = float(meta.get("SliceThickness") or 0)
    except (TypeError, ValueError):
        thick = 0.0
    if thick <= 0:
        thick = 1.0
    return row_mm, col_mm, thick


def _z_positions(meta_list: list[dict[str, Any]]) -> list[float]:
    out: list[float] = []
    for meta in meta_list:
        try:
            z = float(meta.get("SliceLocation"))
            out.append(z)
        except (TypeError, ValueError):
            out.append(float(len(out)))
    return out


def _median_z_step(zs: list[float]) -> float:
    if len(zs) < 2:
        return 1.0
    diffs = sorted(abs(b - a) for a, b in zip(zs, zs[1:]) if abs(b - a) > 1e-6)
    if not diffs:
        return 1.0
    return float(np.median(diffs))


def compute_roi_volume_from_ct_segmentation(
    api_payload: dict[str, Any],
    file_items: list[tuple[str, bytes]] | None,
) -> dict[str, Any]:
    """Sum lesion mask volume (mm³ / ml) across CT module annotated slices."""
    api_payload = normalize_ct_api_payload(api_payload)
    results = get_ct_results(api_payload)
    if not results:
        return {"status": "skipped", "message": "无 CT 分割结果，无法计算 ROI 体积"}

    dicom_index = _build_dicom_index(file_items or [])
    slice_rows: list[dict[str, Any]] = []
    meta_list: list[dict[str, Any]] = []

    for idx, item in enumerate(results):
        if not isinstance(item, dict):
            continue
        filename = str(item.get("filename") or f"slice_{idx}.dcm")
        result_b64 = item.get("resultBase64") or item.get("result_base64") or ""
        preview_b64 = item.get("pngBase64") or item.get("png_base64") or ""
        if not isinstance(result_b64, str) or len(result_b64.strip()) < 80:
            continue

        annotated_bytes = _decode_b64_image(result_b64)
        preview_bytes = (
            _decode_b64_image(preview_b64) if isinstance(preview_b64, str) and preview_b64.strip() else None
        )
        mask, lesion_pixels = extract_binary_mask(annotated_bytes, preview_bytes)
        if lesion_pixels <= 0:
            continue

        dicom_bytes = dicom_index.get(Path(filename).name.lower())
        meta = _dicom_meta_from_bytes(dicom_bytes) if dicom_bytes else {"matched": False, "filename": filename}
        meta_list.append(meta)
        row_mm, col_mm, thick_mm = _spacing_from_meta(meta)
        pixel_area_mm2 = row_mm * col_mm
        slice_rows.append(
            {
                "index": idx,
                "filename": filename,
                "mask_pixels": int(lesion_pixels),
                "row_spacing_mm": row_mm,
                "col_spacing_mm": col_mm,
                "slice_thickness_mm": thick_mm,
                "slice_location": meta.get("SliceLocation"),
                "volume_mm3": float(lesion_pixels * pixel_area_mm2 * thick_mm),
            }
        )

    if not slice_rows:
        return {
            "status": "ok",
            "message": "分割完成，但未检测到病灶 ROI 像素（mask 为空）",
            "total_volume_mm3": 0.0,
            "total_volume_ml": 0.0,
            "slices_with_lesion": 0,
            "slice_volumes": [],
        }

    zs = _z_positions(meta_list)
    z_step = _median_z_step(zs)
    used_z_step = False
    for row, meta in zip(slice_rows, meta_list):
        thick = float(row.get("slice_thickness_mm") or 1.0)
        if thick <= 1.0 and meta.get("SliceThickness") in (None, 0, "0", ""):
            row["slice_thickness_mm"] = z_step
            row["volume_mm3"] = float(row["mask_pixels"] * row["row_spacing_mm"] * row["col_spacing_mm"] * z_step)
            used_z_step = True

    total_mm3 = sum(float(r["volume_mm3"]) for r in slice_rows)
    spacing_note = "DICOM PixelSpacing + SliceThickness"
    if used_z_step:
        spacing_note += f"；层厚缺失时用 SliceLocation 中位间距 {z_step:.3f} mm"

    return {
        "status": "ok",
        "message": f"ROI 总体积 {total_mm3 / 1000:.2f} ml（{len(slice_rows)} 层含病灶）",
        "total_volume_mm3": round(total_mm3, 2),
        "total_volume_ml": round(total_mm3 / 1000.0, 3),
        "total_lesion_voxels": int(sum(r["mask_pixels"] for r in slice_rows)),
        "slices_with_lesion": len(slice_rows),
        "slice_volumes": [
            {
                "index": r["index"],
                "filename": r["filename"],
                "volume_mm3": round(float(r["volume_mm3"]), 2),
                "volume_ml": round(float(r["volume_mm3"]) / 1000.0, 4),
                "mask_pixels": r["mask_pixels"],
            }
            for r in slice_rows
        ],
        "spacing_note": spacing_note,
        "method": "segmentation_mask_dicom_spacing",
    }


def compute_roi_volume_from_annotation_dataset(dataset_id: str) -> dict[str, Any]:
    """Recompute ROI volume from saved annotation dataset on disk."""
    manifest = load_annotation_manifest(dataset_id)
    safe_id = re.sub(r"[^\w.\-]+", "_", str(manifest.get("dataset_id") or dataset_id).strip())
    root = ANNOTATION_ROOT / safe_id
    if not root.is_dir():
        raise FileNotFoundError(f"标注数据集目录不存在：{dataset_id}")

    slices = manifest.get("slices") or []
    slice_rows: list[dict[str, Any]] = []
    meta_list: list[dict[str, Any]] = []
    from PIL import Image

    for rec in slices:
        if not isinstance(rec, dict):
            continue
        mask_rel = rec.get("mask_png")
        if not mask_rel:
            continue
        mask_path = root / str(mask_rel)
        if not mask_path.is_file():
            continue
        mask_arr = np.array(Image.open(mask_path).convert("L"))
        lesion_pixels = int((mask_arr > 127).sum())
        if lesion_pixels <= 0:
            continue
        meta_path = root / str(rec.get("dicom_meta_json") or "")
        meta: dict[str, Any] = {}
        if meta_path.is_file():
            try:
                meta = json.loads(meta_path.read_text(encoding="utf-8"))
            except (OSError, json.JSONDecodeError):
                meta = {}
        meta_list.append(meta)
        row_mm, col_mm, thick_mm = _spacing_from_meta(meta)
        vol = float(lesion_pixels * row_mm * col_mm * thick_mm)
        slice_rows.append(
            {
                "index": int(rec.get("index") or 0),
                "filename": str(rec.get("filename") or ""),
                "mask_pixels": lesion_pixels,
                "row_spacing_mm": row_mm,
                "col_spacing_mm": col_mm,
                "slice_thickness_mm": thick_mm,
                "volume_mm3": vol,
            }
        )

    if not slice_rows:
        return {
            "status": "ok",
            "message": "标注数据集中无有效病灶 mask",
            "total_volume_mm3": 0.0,
            "total_volume_ml": 0.0,
            "slices_with_lesion": 0,
            "slice_volumes": [],
            "dataset_id": safe_id,
        }

    zs = _z_positions(meta_list)
    z_step = _median_z_step(zs)
    for row, meta in zip(slice_rows, meta_list):
        if float(row.get("slice_thickness_mm") or 1.0) <= 1.0 and not meta.get("SliceThickness"):
            row["slice_thickness_mm"] = z_step
            row["volume_mm3"] = float(row["mask_pixels"] * row["row_spacing_mm"] * row["col_spacing_mm"] * z_step)

    total_mm3 = sum(float(r["volume_mm3"]) for r in slice_rows)
    return {
        "status": "ok",
        "message": f"ROI 总体积 {total_mm3 / 1000:.2f} ml（标注集 {safe_id}）",
        "total_volume_mm3": round(total_mm3, 2),
        "total_volume_ml": round(total_mm3 / 1000.0, 3),
        "total_lesion_voxels": int(sum(r["mask_pixels"] for r in slice_rows)),
        "slices_with_lesion": len(slice_rows),
        "slice_volumes": [
            {
                "index": r["index"],
                "filename": r["filename"],
                "volume_mm3": round(float(r["volume_mm3"]), 2),
                "volume_ml": round(float(r["volume_mm3"]) / 1000.0, 4),
                "mask_pixels": r["mask_pixels"],
            }
            for r in slice_rows
        ],
        "dataset_id": safe_id,
        "method": "annotation_dataset_mask",
    }
