"""CT training samples from annotation manifests + imaging cohort labels (rPCI / grade)."""

from __future__ import annotations

import io
import json
import zipfile
from pathlib import Path
from typing import Any, Iterator

import numpy as np
import pydicom
from PIL import Image

from app.services.platform_annotation_dataset import ANNOTATION_ROOT, load_annotation_manifest

COHORT_ROOT = Path(__file__).resolve().parents[2] / "data" / "imaging_cohort"
FEATURES_JSONL = COHORT_ROOT / "features.jsonl"

# Soft-tissue window for CT (HU)
HU_WINDOW_CENTER = 40.0
HU_WINDOW_WIDTH = 400.0


def _window_hu(hu: np.ndarray) -> np.ndarray:
    lo = HU_WINDOW_CENTER - HU_WINDOW_WIDTH / 2
    hi = HU_WINDOW_CENTER + HU_WINDOW_WIDTH / 2
    x = np.clip(hu, lo, hi)
    return ((x - lo) / (hi - lo)).astype(np.float32)


def dicom_bytes_to_hu(content: bytes) -> np.ndarray:
    ds = pydicom.dcmread(io.BytesIO(content), force=True)
    arr = ds.pixel_array.astype(np.float32)
    slope = float(getattr(ds, "RescaleSlope", 1) or 1)
    intercept = float(getattr(ds, "RescaleIntercept", 0) or 0)
    return arr * slope + intercept


def load_slice_image_and_mask(dataset_id: str, slice_rec: dict[str, Any]) -> tuple[np.ndarray, np.ndarray] | None:
    """Return (HU windowed [H,W] float32, mask [H,W] 0/1)."""
    root = ANNOTATION_ROOT / dataset_id
    dcm_rel = slice_rec.get("source_dcm") or ""
    mask_rel = slice_rec.get("mask_png") or ""
    if not mask_rel:
        return None
    mask_path = root / str(mask_rel)
    if not mask_path.is_file():
        return None
    mask = (np.array(Image.open(mask_path).convert("L")) > 127).astype(np.float32)

    if dcm_rel:
        dcm_path = root / str(dcm_rel)
        if dcm_path.is_file():
            hu = dicom_bytes_to_hu(dcm_path.read_bytes())
            if hu.shape != mask.shape:
                # resize mask to DICOM grid
                mask_img = Image.fromarray((mask * 255).astype(np.uint8)).resize(
                    (hu.shape[1], hu.shape[0]), Image.NEAREST
                )
                mask = (np.array(mask_img) > 127).astype(np.float32)
            return _window_hu(hu), mask

    preview_rel = slice_rec.get("preview_png") or slice_rec.get("annotated_png") or ""
    if preview_rel:
        prev_path = root / str(preview_rel)
        if prev_path.is_file():
            gray = np.array(Image.open(prev_path).convert("L"), dtype=np.float32) / 255.0
            if gray.shape != mask.shape:
                mask = np.array(
                    Image.fromarray((mask * 255).astype(np.uint8)).resize(
                        (gray.shape[1], gray.shape[0]), Image.NEAREST
                    )
                ).astype(np.float32)
                mask = (mask > 127).astype(np.float32)
            return gray.astype(np.float32), mask
    return None


def iter_annotation_studies() -> Iterator[dict[str, Any]]:
    if not ANNOTATION_ROOT.is_dir():
        return
    for child in sorted(ANNOTATION_ROOT.iterdir()):
        if not child.is_dir():
            continue
        manifest_path = child / "manifest.json"
        if not manifest_path.is_file():
            continue
        try:
            manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            continue
        manifest["_root"] = str(child)
        yield manifest


def study_rpci_labels_from_manifest(manifest: dict[str, Any]) -> dict[str, Any]:
    """Per-study rPCI: max sc per region 0–12 (Tops-Welten rPCI scoring rule)."""
    region_max: dict[int, int] = {}
    slice_rows: list[dict[str, Any]] = []
    for rec in manifest.get("slices") or []:
        if not isinstance(rec, dict):
            continue
        sc = rec.get("sc")
        region = rec.get("region")
        if sc is None:
            continue
        try:
            s = int(sc)
            e = int(region) if region is not None else None
        except (TypeError, ValueError):
            continue
        slice_rows.append({"sc": s, "region": e})
        if e is not None and 0 <= e <= 12:
            region_max[e] = max(region_max.get(e, 0), s)

    scores = [region_max.get(i) for i in range(13)]
    has_any = any(v is not None for v in scores)
    total = sum(v for v in scores if v is not None) if has_any else None
    return {
        "region_scores": scores,
        "total_pci": total,
        "slice_labeled_count": len(slice_rows),
        "has_rpci_labels": has_any,
    }


def cohort_grade_by_dataset_id() -> dict[str, int]:
    """Map case_id / zip stem → grade_binary from features.jsonl."""
    out: dict[str, int] = {}
    if not FEATURES_JSONL.is_file():
        return out
    for line in FEATURES_JSONL.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            row = json.loads(line)
        except json.JSONDecodeError:
            continue
        cid = str(row.get("case_id") or "").strip()
        gb = row.get("grade_binary")
        if cid and gb in (0, 1):
            out[cid] = int(gb)
    return out


def collect_seg_samples(*, require_mask: bool = True) -> list[dict[str, Any]]:
    samples: list[dict[str, Any]] = []
    for manifest in iter_annotation_studies():
        did = str(manifest.get("dataset_id") or "")
        for rec in manifest.get("slices") or []:
            if not isinstance(rec, dict):
                continue
            if require_mask and not rec.get("has_overlay") and not rec.get("mask_png"):
                continue
            pair = load_slice_image_and_mask(did, rec)
            if pair is None:
                continue
            img, mask = pair
            if require_mask and mask.sum() <= 0:
                continue
            samples.append(
                {
                    "dataset_id": did,
                    "index": int(rec.get("index") or 0),
                    "image": img,
                    "mask": mask,
                    "sc": rec.get("sc"),
                    "region": rec.get("region"),
                }
            )
    return samples


def collect_study_grade_samples() -> list[dict[str, Any]]:
    """One row per study: rPCI vector + optional pathology grade."""
    grade_map = cohort_grade_by_dataset_id()
    studies: list[dict[str, Any]] = []
    for manifest in iter_annotation_studies():
        did = str(manifest.get("dataset_id") or "")
        rpci = study_rpci_labels_from_manifest(manifest)
        if not rpci["has_rpci_labels"] and did not in grade_map:
            continue
        exam = str(manifest.get("exam_id") or "").strip()
        gb = (
            grade_map.get(did)
            or grade_map.get(did.replace("ann_", ""))
            or (grade_map.get(exam) if exam else None)
        )
        studies.append(
            {
                "dataset_id": did,
                "region_scores": rpci["region_scores"],
                "total_pci": rpci["total_pci"],
                "grade_binary": gb,
                "manifest": manifest,
            }
        )
    return studies
