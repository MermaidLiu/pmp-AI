"""PyRadiomics feature extraction from annotation datasets, DICOM slices, or NIfTI pairs."""

from __future__ import annotations

import io
import json
import logging
import re
import tempfile
from pathlib import Path
from typing import Any

import numpy as np
import pydicom
from PIL import Image

from app.services.platform_annotation_dataset import ANNOTATION_ROOT, load_annotation_manifest

logger = logging.getLogger(__name__)

_PYRADIOMICS_AVAILABLE = False
_PYRADIOMICS_IMPORT_ERROR = ""

try:
    import SimpleITK as sitk
except ImportError as exc:  # pragma: no cover - optional dependency
    sitk = None  # type: ignore[assignment,misc]
    _PYRADIOMICS_IMPORT_ERROR = str(exc)

try:
    from radiomics import featureextractor

    _PYRADIOMICS_AVAILABLE = True
except ImportError as exc:  # pragma: no cover - optional dependency
    featureextractor = None  # type: ignore[assignment,misc]
    if not _PYRADIOMICS_IMPORT_ERROR:
        _PYRADIOMICS_IMPORT_ERROR = str(exc)


def pyradiomics_available() -> bool:
    return _PYRADIOMICS_AVAILABLE or sitk is not None


def pyradiomics_unavailable_reason() -> str:
    if sitk is None:
        return _PYRADIOMICS_IMPORT_ERROR or "SimpleITK not installed"
    if not _PYRADIOMICS_AVAILABLE:
        return f"PyRadiomics 未安装（将使用简化 firstorder 特征）：{_PYRADIOMICS_IMPORT_ERROR}"
    return ""


def _build_extractor() -> Any:
    if not _PYRADIOMICS_AVAILABLE:
        raise RuntimeError(
            "PyRadiomics 未安装。请执行: pip install pyradiomics SimpleITK"
        )
    extractor = featureextractor.RadiomicsFeatureExtractor()
    extractor.disableAllFeatures()
    for cls in (
        "firstorder",
        "shape",
        "glcm",
        "glrlm",
        "glszm",
        "ngtdm",
        "gldm",
    ):
        try:
            extractor.enableFeatureClassByName(cls)
        except Exception:
            logger.debug("PyRadiomics feature class unavailable: %s", cls)
    extractor.settings.update(
        {
            "binWidth": 25,
            "label": 1,
            "force2D": False,
            "normalize": True,
            "normalizeScale": 100,
        }
    )
    return extractor


def _clean_feature_dict(raw: dict[str, Any]) -> dict[str, float]:
    out: dict[str, float] = {}
    for key, val in raw.items():
        if not str(key).startswith("original_"):
            continue
        if str(key).endswith("_") or "diagnostics" in str(key).lower():
            continue
        try:
            fval = float(val)
        except (TypeError, ValueError):
            continue
        if not np.isfinite(fval):
            continue
        out[str(key).replace("original_", "", 1)] = fval
    return out


def _read_dicom_pixel_array(content: bytes) -> tuple[np.ndarray, tuple[float, float, float]]:
    ds = pydicom.dcmread(io.BytesIO(content), force=True)
    arr = ds.pixel_array.astype(np.float32)
    if arr.ndim == 3:
        arr = arr[..., 0]
    slope = float(getattr(ds, "RescaleSlope", 1) or 1)
    intercept = float(getattr(ds, "RescaleIntercept", 0) or 0)
    arr = arr * slope + intercept
    ps = getattr(ds, "PixelSpacing", None)
    if ps is not None and len(ps) >= 2:
        spacing = (float(ps[0]), float(ps[1]), 1.0)
    else:
        spacing = (1.0, 1.0, 1.0)
    return arr, spacing


def _read_grayscale_png(path: Path) -> np.ndarray:
    return np.array(Image.open(path).convert("L"), dtype=np.float32)


def _read_mask_png(path: Path) -> np.ndarray:
    arr = np.array(Image.open(path).convert("L"))
    return (arr > 127).astype(np.uint8)


def _sort_slices(records: list[dict[str, Any]], root: Path) -> list[dict[str, Any]]:
    def sort_key(rec: dict[str, Any]) -> tuple[float, float, int]:
        meta_path = root / str(rec.get("dicom_meta_json") or "")
        z = float(rec.get("index") or 0)
        inst = float(rec.get("index") or 0)
        if meta_path.is_file():
            try:
                meta = json.loads(meta_path.read_text(encoding="utf-8"))
                z = float(meta.get("SliceLocation") or meta.get("InstanceNumber") or z)
                inst = float(meta.get("InstanceNumber") or inst)
            except (OSError, json.JSONDecodeError, TypeError, ValueError):
                pass
        return (z, inst, int(rec.get("index") or 0))

    return sorted(records, key=sort_key)


def _spacing_from_records(records: list[dict[str, Any]], root: Path) -> tuple[float, float, float]:
    for rec in records:
        meta_path = root / str(rec.get("dicom_meta_json") or "")
        if not meta_path.is_file():
            continue
        try:
            meta = json.loads(meta_path.read_text(encoding="utf-8"))
            ps = meta.get("PixelSpacing") or []
            st = float(meta.get("SliceThickness") or 0) or 1.0
            if isinstance(ps, list) and len(ps) >= 2:
                return (float(ps[0]), float(ps[1]), st)
        except (OSError, json.JSONDecodeError, TypeError, ValueError):
            continue
    return (1.0, 1.0, 1.0)


def _z_spacing_from_records(sorted_records: list[dict[str, Any]], root: Path) -> float:
    zs: list[float] = []
    for rec in sorted_records:
        meta_path = root / str(rec.get("dicom_meta_json") or "")
        if not meta_path.is_file():
            continue
        try:
            meta = json.loads(meta_path.read_text(encoding="utf-8"))
            z = meta.get("SliceLocation")
            if z is not None:
                zs.append(float(z))
        except (OSError, json.JSONDecodeError, TypeError, ValueError):
            continue
    if len(zs) >= 2:
        diffs = [abs(b - a) for a, b in zip(zs, zs[1:]) if abs(b - a) > 1e-6]
        if diffs:
            return float(np.median(diffs))
    return _spacing_from_records(sorted_records, root)[2]


def build_volume_from_annotation_dataset(dataset_id: str) -> tuple[Any, Any, dict[str, Any]]:
    """Stack annotation dataset slices into SimpleITK image + mask."""
    if not _PYRADIOMICS_AVAILABLE:
        raise RuntimeError(pyradiomics_unavailable_reason())

    manifest = load_annotation_manifest(dataset_id)
    safe_id = re.sub(r"[^\w.\-]+", "_", str(manifest.get("dataset_id") or dataset_id).strip())
    root = ANNOTATION_ROOT / safe_id
    if not root.is_dir():
        raise FileNotFoundError(f"标注数据集目录不存在：{dataset_id}")

    slices = manifest.get("slices")
    if not isinstance(slices, list) or not slices:
        raise ValueError("标注 manifest 无 slices")

    sorted_slices = _sort_slices([s for s in slices if isinstance(s, dict)], root)
    intensity_slices: list[np.ndarray] = []
    mask_slices: list[np.ndarray] = []
    used = 0

    for rec in sorted_slices:
        mask_path = root / str(rec.get("mask_png") or "")
        if not mask_path.is_file():
            continue
        mask2d = _read_mask_png(mask_path)
        if mask2d.sum() == 0:
            continue

        intensity2d: np.ndarray | None = None
        source_dcm = rec.get("source_dcm")
        if source_dcm:
            dcm_path = root / str(source_dcm)
            if dcm_path.is_file():
                try:
                    intensity2d, _ = _read_dicom_pixel_array(dcm_path.read_bytes())
                except Exception as exc:
                    logger.warning("DICOM read failed %s: %s", dcm_path.name, exc)

        if intensity2d is None:
            preview_rel = rec.get("preview_png")
            if preview_rel:
                preview_path = root / str(preview_rel)
                if preview_path.is_file():
                    intensity2d = _read_grayscale_png(preview_path)
            if intensity2d is None:
                annotated_path = root / str(rec.get("annotated_png") or "")
                if annotated_path.is_file():
                    intensity2d = _read_grayscale_png(annotated_path)

        if intensity2d is None:
            continue
        if intensity2d.shape != mask2d.shape:
            intensity2d = np.array(
                Image.fromarray(intensity2d).resize((mask2d.shape[1], mask2d.shape[0])),
                dtype=np.float32,
            )
        intensity_slices.append(intensity2d)
        mask_slices.append(mask2d)
        used += 1

    if not intensity_slices:
        raise ValueError("未找到含 mask 且可读取强度的切片（需 DICOM 或 preview/annotated PNG）")

    volume = np.stack(intensity_slices, axis=0)
    mask_volume = np.stack(mask_slices, axis=0)
    sx, sy, _ = _spacing_from_records(sorted_slices, root)
    sz = _z_spacing_from_records(sorted_slices, root)

    image = sitk.GetImageFromArray(volume)
    mask = sitk.GetImageFromArray(mask_volume.astype(np.uint8))
    image.SetSpacing((sx, sy, sz))
    mask.SetSpacing((sx, sy, sz))

    meta = {
        "dataset_id": safe_id,
        "slices_used": used,
        "volume_shape": list(volume.shape),
        "spacing": [sx, sy, sz],
        "source": "annotation_dataset",
    }
    return image, mask, meta


def _extract_basic_firstorder(volume: np.ndarray, mask: np.ndarray) -> dict[str, float]:
    """Fallback when PyRadiomics wheel is unavailable."""
    vals = volume[mask > 0].astype(np.float64)
    if vals.size < 8:
        raise ValueError("ROI 体素过少，无法提取组学特征")
    hist, _ = np.histogram(vals, bins=32)
    prob = hist / max(hist.sum(), 1)
    prob = prob[prob > 0]
    entropy = float(-(prob * np.log2(prob)).sum())
    return {
        "firstorder_Mean": float(np.mean(vals)),
        "firstorder_Median": float(np.median(vals)),
        "firstorder_Std": float(np.std(vals)),
        "firstorder_Minimum": float(np.min(vals)),
        "firstorder_Maximum": float(np.max(vals)),
        "firstorder_Energy": float(np.sum(vals**2) / vals.size),
        "firstorder_Entropy": entropy,
        "shape_VoxelVolume": float(vals.size),
        "shape_LesionVolume": float(vals.size),
    }


def extract_from_sitk(image: Any, mask: Any) -> dict[str, float]:
    if _PYRADIOMICS_AVAILABLE:
        extractor = _build_extractor()
        raw = extractor.execute(image, mask, label=1)
        features = _clean_feature_dict(dict(raw))
        if features:
            return features
    vol = sitk.GetArrayFromImage(image).astype(np.float32)
    msk = sitk.GetArrayFromImage(mask)
    if msk.ndim == vol.ndim + 1:
        msk = msk[..., 0]
    msk_bin = (msk > 0).astype(np.uint8)
    return _extract_basic_firstorder(vol, msk_bin)


def extract_from_annotation_dataset(dataset_id: str) -> tuple[dict[str, float], dict[str, Any]]:
    image, mask, meta = build_volume_from_annotation_dataset(dataset_id)
    features = extract_from_sitk(image, mask)
    if not features:
        raise ValueError("PyRadiomics 未返回有效特征（mask 可能过小）")
    meta["feature_count"] = len(features)
    return features, meta


def extract_from_nifti_paths(image_path: Path, mask_path: Path) -> tuple[dict[str, float], dict[str, Any]]:
    if not _PYRADIOMICS_AVAILABLE:
        raise RuntimeError(pyradiomics_unavailable_reason())
    image = sitk.ReadImage(str(image_path))
    mask = sitk.ReadImage(str(mask_path))
    mask_arr = sitk.GetArrayFromImage(mask)
    mask_bin = sitk.GetImageFromArray((mask_arr > 0).astype(np.uint8))
    mask_bin.CopyInformation(mask)
    features = extract_from_sitk(image, mask_bin)
    meta = {
        "source": "nifti",
        "image_path": str(image_path.name),
        "mask_path": str(mask_path.name),
        "feature_count": len(features),
    }
    return features, meta


def _resolve_nifti_pair(paths: list[Path]) -> tuple[Path, Path]:
    ct: Path | None = None
    roi: Path | None = None
    for path in paths:
        name = path.name.lower()
        if any(h in name for h in ("roi", "seg", "mask", "label", "勾画", "分割")):
            roi = path
        elif any(h in name for h in ("ct", "image", "volume")):
            ct = path
    if roi and not ct:
        ct = next((p for p in paths if p != roi), None)
    if not roi or not ct:
        raise ValueError("需要一对 NIfTI：CT/影像 + ROI/seg/mask")
    return ct, roi


def extract_from_uploaded_nifti_files(file_items: list[tuple[str, bytes]]) -> tuple[dict[str, float], dict[str, Any]]:
    if not file_items:
        raise ValueError("未上传 NIfTI 文件")
    with tempfile.TemporaryDirectory(prefix="pmp_radiomics_") as tmp:
        paths: list[Path] = []
        for name, content in file_items:
            if not content:
                continue
            suffix = Path(name).suffix.lower()
            if suffix not in {".gz", ".nii"} and not name.lower().endswith(".nii.gz"):
                continue
            out = Path(tmp) / (Path(name).name or "volume.nii.gz")
            out.write_bytes(content)
            paths.append(out)
        if not paths:
            raise ValueError("未找到 .nii / .nii.gz 文件")
        ct, roi = _resolve_nifti_pair(paths)
        return extract_from_nifti_paths(ct, roi)


def top_feature_rows(
    features: dict[str, float],
    *,
    limit: int = 12,
) -> list[tuple[str, float]]:
    """Rank by absolute value for display when no cohort labels exist."""
    ranked = sorted(features.items(), key=lambda kv: abs(kv[1]), reverse=True)
    return ranked[:limit]
