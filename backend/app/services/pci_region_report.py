"""Per-region PCI + lesion volume (13-zone anatomy) and multi-lesion ROI extraction."""

from __future__ import annotations

from typing import Any

import numpy as np
from scipy import ndimage

from app.services.pathology_imaging_client import get_ct_results, normalize_ct_api_payload
from app.data.rpci_anatomy import RPCI_ANATOMY_REFERENCE, RPCI_CITATION
from app.services.pci_scoring_client import list_pci_region_defs, try_parse_pci_from_ct_slices
from app.services.platform_annotation_dataset import (
    _build_dicom_index,
    _decode_b64_image,
    _dicom_meta_from_bytes,
    extract_binary_mask,
)
from app.services.roi_volume import _median_z_step, _spacing_from_meta, _z_positions
from pathlib import Path

ANATOMY_REFERENCE = f"{RPCI_ANATOMY_REFERENCE} {RPCI_CITATION}"


def _slice_score_rows(pci_result: dict[str, Any] | None, api_payload: dict[str, Any] | None) -> list[dict[str, Any]]:
    if pci_result and isinstance(pci_result.get("slice_scores"), list):
        rows = [s for s in pci_result["slice_scores"] if isinstance(s, dict)]
        if rows:
            return rows
    if api_payload:
        parsed = try_parse_pci_from_ct_slices(api_payload)
        if parsed and parsed.get("slice_scores"):
            return parsed["slice_scores"]
    return []


def _volume_by_index(roi_volume: dict[str, Any] | None) -> dict[int, dict[str, Any]]:
    out: dict[int, dict[str, Any]] = {}
    if not roi_volume:
        return out
    for row in roi_volume.get("slice_volumes") or []:
        if not isinstance(row, dict):
            continue
        idx = int(row.get("index", -1))
        if idx >= 0:
            out[idx] = row
    return out


def _region_scores_from_pci(pci_result: dict[str, Any] | None) -> dict[int, int | None]:
    defs = list_pci_region_defs()
    scores: dict[int, int | None] = {d["index"]: None for d in defs}
    if not pci_result:
        return scores
    for r in pci_result.get("regions") or []:
        if not isinstance(r, dict):
            continue
        idx = r.get("index")
        if idx is None:
            continue
        idx = int(idx)
        if 0 <= idx <= 12:
            sc = r.get("score")
            scores[idx] = int(sc) if sc is not None else None
    return scores


def build_pci_region_anatomy_report(
    *,
    pci_result: dict[str, Any] | None,
    roi_volume: dict[str, Any] | None,
    slice_manifest: list[dict[str, Any]] | None = None,
    api_payload: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Merge PCI scores and ROI volume into 13 anatomical PCI zones."""
    defs = list_pci_region_defs()
    region_pci = _region_scores_from_pci(pci_result)
    slice_scores = _slice_score_rows(pci_result, api_payload)
    vol_by_idx = _volume_by_index(roi_volume)

    # index -> region from manifest / slice scores
    region_by_index: dict[int, int | None] = {}
    for row in slice_scores:
        idx = int(row.get("index", -1))
        reg = row.get("region")
        if idx >= 0 and reg is not None and 0 <= int(reg) <= 12:
            region_by_index[idx] = int(reg)
    if slice_manifest:
        for entry in slice_manifest:
            if not isinstance(entry, dict):
                continue
            idx = int(entry.get("index", -1))
            reg = entry.get("region")
            if idx >= 0 and reg is not None and 0 <= int(reg) <= 12:
                region_by_index.setdefault(idx, int(reg))

    # Recompute region max PCI from slices if missing
    region_max_sc: dict[int, int] = {}
    for row in slice_scores:
        sc = row.get("sc")
        reg = row.get("region")
        if sc is None or reg is None:
            continue
        try:
            e, s = int(reg), int(sc)
        except (TypeError, ValueError):
            continue
        if 0 <= e <= 12:
            region_max_sc[e] = max(region_max_sc.get(e, 0), s)
    for idx, sc in region_max_sc.items():
        if region_pci.get(idx) is None:
            region_pci[idx] = sc

    region_vol_mm3: dict[int, float] = {i: 0.0 for i in range(13)}
    region_slice_count: dict[int, int] = {i: 0 for i in range(13)}
    unassigned_mm3 = 0.0

    indices = set(vol_by_idx) | set(region_by_index)
    for idx in indices:
        vol_row = vol_by_idx.get(idx)
        vol = float(vol_row.get("volume_mm3") or 0) if vol_row else 0.0
        if vol <= 0:
            continue
        reg = region_by_index.get(idx)
        if reg is not None and 0 <= reg <= 12:
            region_vol_mm3[reg] += vol
            region_slice_count[reg] += 1
        else:
            unassigned_mm3 += vol

    regions_out: list[dict[str, Any]] = []
    for d in defs:
        i = d["index"]
        v_mm3 = region_vol_mm3.get(i, 0.0)
        regions_out.append(
            {
                "index": i,
                "key": d["key"],
                "label": d["label"],
                "structures": d.get("structures", ""),
                "boundaries": d.get("boundaries", ""),
                "pci_score": region_pci.get(i),
                "volume_mm3": round(v_mm3, 2),
                "volume_ml": round(v_mm3 / 1000.0, 4),
                "slice_count": region_slice_count.get(i, 0),
            }
        )

    total_pci = pci_result.get("pci_score") if pci_result else None
    if total_pci is None:
        scored = [s for s in region_pci.values() if s is not None]
        total_pci = sum(int(s) for s in scored) if scored else None

    total_ml = roi_volume.get("total_volume_ml") if roi_volume else None
    if total_ml is None:
        total_mm3 = sum(region_vol_mm3.values()) + unassigned_mm3
        total_ml = round(total_mm3 / 1000.0, 3) if total_mm3 > 0 else 0.0

    return {
        "status": "ok",
        "message": "分区 PCI + 体积报告已生成",
        "total_pci_score": total_pci,
        "total_volume_ml": total_ml,
        "total_volume_mm3": roi_volume.get("total_volume_mm3") if roi_volume else None,
        "regions": regions_out,
        "unassigned_volume_ml": round(unassigned_mm3 / 1000.0, 4),
        "anatomy_reference": ANATOMY_REFERENCE,
    }


def extract_lesion_rois_from_ct(
    api_payload: dict[str, Any],
    file_items: list[tuple[str, bytes]] | None,
    *,
    slice_scores: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    """Label connected components on each slice mask → per-lesion ROI volume."""
    api_payload = normalize_ct_api_payload(api_payload)
    results = get_ct_results(api_payload)
    if not results:
        return {"status": "skipped", "message": "无分割结果", "lesions": [], "lesion_count": 0}

    region_by_index: dict[int, int | None] = {}
    for row in slice_scores or []:
        idx = int(row.get("index", -1))
        reg = row.get("region")
        if idx >= 0 and reg is not None:
            region_by_index[idx] = int(reg) if 0 <= int(reg) <= 12 else None

    dicom_index = _build_dicom_index(file_items or [])
    lesions: list[dict[str, Any]] = []
    lesion_counter = 0

    for idx, item in enumerate(results):
        if not isinstance(item, dict):
            continue
        result_b64 = item.get("resultBase64") or item.get("result_base64") or ""
        if not isinstance(result_b64, str) or len(result_b64.strip()) < 80:
            continue
        preview_b64 = item.get("pngBase64") or item.get("png_base64") or ""
        annotated_bytes = _decode_b64_image(result_b64)
        preview_bytes = (
            _decode_b64_image(preview_b64) if isinstance(preview_b64, str) and preview_b64.strip() else None
        )
        mask, _ = extract_binary_mask(annotated_bytes, preview_bytes)
        if mask.size == 0:
            continue
        binary = (mask > 127).astype(np.uint8)
        if binary.sum() == 0:
            continue

        labeled, n_comp = ndimage.label(binary)
        if n_comp <= 0:
            continue

        filename = str(item.get("filename") or f"slice_{idx}.dcm")
        dicom_bytes = dicom_index.get(Path(filename).name.lower())
        meta = _dicom_meta_from_bytes(dicom_bytes) if dicom_bytes else {}
        row_mm, col_mm, thick_mm = _spacing_from_meta(meta)
        pixel_area = row_mm * col_mm
        reg = region_by_index.get(idx)

        for comp_id in range(1, n_comp + 1):
            comp_mask = labeled == comp_id
            pixels = int(comp_mask.sum())
            if pixels < 4:
                continue
            ys, xs = np.where(comp_mask)
            bbox = [int(xs.min()), int(ys.min()), int(xs.max()), int(ys.max())]
            vol_mm3 = float(pixels * pixel_area * thick_mm)
            lesion_counter += 1
            lesions.append(
                {
                    "lesion_id": f"L{lesion_counter:04d}",
                    "slice_index": idx,
                    "filename": filename,
                    "region": reg,
                    "mask_pixels": pixels,
                    "volume_mm3": round(vol_mm3, 2),
                    "volume_ml": round(vol_mm3 / 1000.0, 4),
                    "bbox_xyxy": bbox,
                }
            )

    # Optional z-step fix for thickness (batch)
    if lesions and file_items:
        meta_list = []
        for item in results:
            if not isinstance(item, dict):
                continue
            fn = str(item.get("filename") or "")
            db = dicom_index.get(Path(fn).name.lower())
            meta_list.append(_dicom_meta_from_bytes(db) if db else {})
        z_step = _median_z_step(_z_positions(meta_list))
        for les in lesions:
            si = int(les["slice_index"])
            fn = les["filename"]
            db = dicom_index.get(Path(fn).name.lower())
            meta = _dicom_meta_from_bytes(db) if db else {}
            _, _, thick = _spacing_from_meta(meta)
            if thick <= 1.0 and not meta.get("SliceThickness"):
                pixels = les["mask_pixels"]
                row_mm, col_mm, _ = _spacing_from_meta(meta)
                vol = float(pixels * row_mm * col_mm * z_step)
                les["volume_mm3"] = round(vol, 2)
                les["volume_ml"] = round(vol / 1000.0, 4)

    total_ml = sum(float(x["volume_ml"]) for x in lesions)
    return {
        "status": "ok",
        "message": f"提取 {len(lesions)} 个病灶 ROI（跨层连通域）",
        "lesion_count": len(lesions),
        "total_lesion_volume_ml": round(total_ml, 3),
        "lesions": lesions,
    }


def imaging_feature_vector(
    pci_region_report: dict[str, Any] | None,
    lesion_pack: dict[str, Any] | None,
    roi_volume: dict[str, Any] | None,
) -> dict[str, float]:
    """Flat features for imaging-grade classifier."""
    feats: dict[str, float] = {
        "total_volume_ml": float((roi_volume or {}).get("total_volume_ml") or 0),
        "total_pci_score": float((pci_region_report or {}).get("total_pci_score") or 0),
        "lesion_count": float((lesion_pack or {}).get("lesion_count") or 0),
        "unassigned_volume_ml": float((pci_region_report or {}).get("unassigned_volume_ml") or 0),
    }
    for r in (pci_region_report or {}).get("regions") or []:
        if not isinstance(r, dict):
            continue
        i = int(r.get("index", -1))
        if 0 <= i <= 12:
            feats[f"pci_r{i}_score"] = float(r.get("pci_score") or 0)
            feats[f"pci_r{i}_volume_ml"] = float(r.get("volume_ml") or 0)
    if lesion_pack and lesion_pack.get("lesions"):
        vols = [float(x.get("volume_ml") or 0) for x in lesion_pack["lesions"] if isinstance(x, dict)]
        feats["max_lesion_volume_ml"] = max(vols) if vols else 0.0
        feats["mean_lesion_volume_ml"] = float(np.mean(vols)) if vols else 0.0
    else:
        feats["max_lesion_volume_ml"] = 0.0
        feats["mean_lesion_volume_ml"] = 0.0
    return feats
