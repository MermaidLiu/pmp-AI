"""Train pathology grade model from imaging cohort (high/low ZIP folders)."""

from __future__ import annotations

import asyncio
import json
import zipfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

_BACKEND_ROOT = Path(__file__).resolve().parents[2]
COHORT_ROOT = _BACKEND_ROOT / "data" / "imaging_cohort"
HIGH_DIR = COHORT_ROOT / "high_grade"
LOW_DIR = COHORT_ROOT / "low_grade"
FEATURES_JSONL = COHORT_ROOT / "features.jsonl"
MODEL_PATH = Path("models/pathology_imaging_grade.joblib")
META_PATH = Path("models/pathology_imaging_grade.meta.json")
LABEL_MAP = {"低级别": 0, "高级别": 1}
INV_LABEL_MAP = {0: "低级别", 1: "高级别"}


def cohort_directory_status() -> dict[str, Any]:
    high = sorted(HIGH_DIR.glob("*.zip")) if HIGH_DIR.is_dir() else []
    low = sorted(LOW_DIR.glob("*.zip")) if LOW_DIR.is_dir() else []
    feature_rows = load_feature_rows()
    meta: dict[str, Any] = {}
    if META_PATH.is_file():
        try:
            meta = json.loads(META_PATH.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            meta = {}
    return {
        "cohort_root": str(COHORT_ROOT),
        "high_grade_zips": len(high),
        "low_grade_zips": len(low),
        "high_grade_names": [p.name for p in high[:30]],
        "low_grade_names": [p.name for p in low[:30]],
        "features_extracted": len(feature_rows),
        "features_path": str(FEATURES_JSONL),
        "model_exists": MODEL_PATH.is_file(),
        "model_path": str(MODEL_PATH),
        "last_training": meta,
        "instructions": (
            "将 20 例高级别 ZIP 放入 data/imaging_cohort/high_grade/，"
            "20 例低级别放入 data/imaging_cohort/low_grade/，然后调用特征提取与训练 API。"
        ),
    }


def list_cohort_zip_jobs() -> list[tuple[Path, str, int]]:
    jobs: list[tuple[Path, str, int]] = []
    if HIGH_DIR.is_dir():
        for p in sorted(HIGH_DIR.glob("*.zip")):
            jobs.append((p, "高级别", 1))
    if LOW_DIR.is_dir():
        for p in sorted(LOW_DIR.glob("*.zip")):
            jobs.append((p, "低级别", 0))
    return jobs


def _read_zip_as_file_items(zip_path: Path) -> list[tuple[str, bytes]]:
    items: list[tuple[str, bytes]] = []
    with zipfile.ZipFile(zip_path, "r") as zf:
        for info in zf.infolist():
            if info.is_dir():
                continue
            name = info.filename
            lower = name.lower()
            if not (lower.endswith(".dcm") or lower.endswith(".dicom") or ".dcm" in lower):
                continue
            data = zf.read(info)
            base = Path(name).name
            items.append((base, data))
    return items


def load_feature_rows() -> list[dict[str, Any]]:
    if not FEATURES_JSONL.is_file():
        return []
    rows: list[dict[str, Any]] = []
    for line in FEATURES_JSONL.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            rows.append(json.loads(line))
        except json.JSONDecodeError:
            continue
    return rows


def append_feature_row(row: dict[str, Any]) -> None:
    COHORT_ROOT.mkdir(parents=True, exist_ok=True)
    with FEATURES_JSONL.open("a", encoding="utf-8") as f:
        f.write(json.dumps(row, ensure_ascii=False) + "\n")


async def extract_features_from_zip(zip_path: Path, *, grade_label: str, grade_binary: int) -> dict[str, Any]:
    from app.services.pathology_imaging_client import predict_grade_from_imaging
    from app.services.pci_scoring_client import predict_pci_after_segmentation, pci_result_has_scores
    from app.services.pci_region_report import (
        build_pci_region_anatomy_report,
        extract_lesion_rois_from_ct,
        imaging_feature_vector,
    )
    from app.services.roi_volume import compute_roi_volume_from_ct_segmentation

    file_items = _read_zip_as_file_items(zip_path)
    if not file_items:
        return {
            "status": "error",
            "case_id": zip_path.stem,
            "message": f"{zip_path.name} 内无 DICOM",
            "grade_label": grade_label,
        }

    raw = await predict_grade_from_imaging(file_items, run_pci=True, return_base64=True)
    api_payload = raw.pop("_api_payload", None)
    pci_result = raw.get("pci") if isinstance(raw.get("pci"), dict) else None
    if isinstance(api_payload, dict) and (not pci_result or not pci_result_has_scores(pci_result)):
        pci_result = await predict_pci_after_segmentation(
            api_payload,
            upload_names=[zip_path.name],
            segmentation_complete=True,
            ct_run_pci=True,
        )

    roi_vol = compute_roi_volume_from_ct_segmentation(api_payload or {}, file_items) if api_payload else {}
    slice_scores = (pci_result or {}).get("slice_scores") or []
    region_report = build_pci_region_anatomy_report(
        pci_result=pci_result,
        roi_volume=roi_vol,
        api_payload=api_payload if isinstance(api_payload, dict) else None,
    )
    lesions = (
        extract_lesion_rois_from_ct(api_payload, file_items, slice_scores=slice_scores)
        if api_payload
        else {"lesion_count": 0, "lesions": []}
    )
    feats = imaging_feature_vector(region_report, lesions, roi_vol)

    row = {
        "status": "ok" if raw.get("status") == "ok" else str(raw.get("status")),
        "case_id": zip_path.stem,
        "zip_name": zip_path.name,
        "grade_label": grade_label,
        "grade_binary": grade_binary,
        "dicom_count": raw.get("dicom_count"),
        "pci_score": region_report.get("total_pci_score"),
        "total_volume_ml": roi_vol.get("total_volume_ml"),
        "lesion_count": lesions.get("lesion_count"),
        "features": feats,
        "extracted_at": datetime.now(timezone.utc).isoformat(),
    }
    return row


async def batch_extract_cohort_features(
    *,
    limit: int = 0,
    skip_existing: bool = True,
) -> dict[str, Any]:
    existing_ids = {r.get("case_id") for r in load_feature_rows()} if skip_existing else set()
    jobs = list_cohort_zip_jobs()
    if limit > 0:
        jobs = jobs[:limit]

    ok, err = 0, 0
    results: list[dict[str, Any]] = []
    for path, label, binary in jobs:
        if skip_existing and path.stem in existing_ids:
            continue
        try:
            row = await extract_features_from_zip(path, grade_label=label, grade_binary=binary)
            if row.get("status") == "ok" or row.get("features"):
                append_feature_row(row)
                ok += 1
            else:
                err += 1
            results.append(row)
        except Exception as exc:
            err += 1
            results.append({"status": "error", "case_id": path.stem, "message": str(exc)})

    return {
        "ok": True,
        "processed": len(results),
        "success": ok,
        "failed": err,
        "features_total": len(load_feature_rows()),
        "preview": results[:5],
    }


def _feature_columns(rows: list[dict[str, Any]]) -> list[str]:
    keys: set[str] = set()
    for r in rows:
        feats = r.get("features") or {}
        keys.update(feats.keys())
    preferred = [
        "total_volume_ml",
        "total_pci_score",
        "lesion_count",
        "max_lesion_volume_ml",
        "mean_lesion_volume_ml",
        "unassigned_volume_ml",
    ]
    rest = sorted(k for k in keys if k not in preferred)
    cols = [c for c in preferred if c in keys]
    cols.extend(rest)
    return cols or preferred


def train_imaging_grade_model(*, min_samples: int = 6) -> dict[str, Any]:
    try:
        import joblib
        import numpy as np
        import pandas as pd
        from sklearn.metrics import accuracy_score, roc_auc_score
        from sklearn.model_selection import train_test_split
        from xgboost import XGBClassifier
    except ImportError as e:
        raise RuntimeError("请安装 pandas scikit-learn joblib xgboost") from e

    rows = [r for r in load_feature_rows() if r.get("grade_binary") in (0, 1) and r.get("features")]
    if len(rows) < min_samples:
        raise ValueError(
            f"有效特征样本 {len(rows)} 条，至少需要 {min_samples} 条。"
            "请先放置 ZIP 并执行 cohort 特征提取。"
        )

    feature_cols = _feature_columns(rows)
    data = []
    for r in rows:
        feats = r["features"]
        row = {c: float(feats.get(c, 0)) for c in feature_cols}
        row["grade_binary"] = int(r["grade_binary"])
        row["case_id"] = r.get("case_id")
        data.append(row)

    df = pd.DataFrame(data)
    X = df[feature_cols].fillna(0.0)
    y = df["grade_binary"].astype(int)

    stratify = y if len(y.unique()) > 1 and len(df) >= 8 else None
    test_size = 0.25 if len(df) >= 8 else 0.2
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=test_size, random_state=42, stratify=stratify
    )

    clf = XGBClassifier(
        n_estimators=120,
        max_depth=4,
        learning_rate=0.08,
        subsample=0.85,
        colsample_bytree=0.85,
        random_state=42,
        eval_metric="logloss",
    )
    clf.fit(X_train, y_train)
    y_pred = clf.predict(X_test)
    accuracy = float(accuracy_score(y_test, y_pred)) if len(y_test) else 1.0
    auc: float | None = None
    if len(y_test) and len(y.unique()) > 1:
        try:
            proba = clf.predict_proba(X_test)[:, 1]
            auc = float(roc_auc_score(y_test, proba))
        except ValueError:
            auc = None

    importances = clf.feature_importances_
    feature_importance = [
        {"feature": c, "importance": round(float(im), 4)}
        for c, im in sorted(zip(feature_cols, importances), key=lambda x: -x[1])
    ]

    MODEL_PATH.parent.mkdir(parents=True, exist_ok=True)
    joblib.dump(
        {
            "model": clf,
            "feature_cols": feature_cols,
            "label_map": INV_LABEL_MAP,
            "feature_importance": feature_importance,
        },
        MODEL_PATH,
    )

    meta = {
        "trained_at": datetime.now(timezone.utc).isoformat(),
        "samples_total": int(len(df)),
        "samples_train": int(len(X_train)),
        "samples_test": int(len(X_test)),
        "accuracy_holdout": accuracy,
        "auc_holdout": auc,
        "high_grade_count": int((y == 1).sum()),
        "low_grade_count": int((y == 0).sum()),
        "feature_cols": feature_cols,
        "feature_importance": feature_importance,
        "model_path": str(MODEL_PATH),
        "validation_note": "hold-out split（队列内），外部验证请用未参与训练的 ZIP 调用单例推理 API",
    }
    META_PATH.write_text(json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8")

    return {
        "ok": True,
        "message": "影像病理分级模型训练完成",
        "accuracy": accuracy,
        "auc": auc,
        "samples": len(df),
        "meta": meta,
    }


def predict_imaging_grade(features: dict[str, float]) -> dict[str, Any] | None:
    if not MODEL_PATH.is_file():
        return None
    try:
        import joblib
        import pandas as pd
    except ImportError:
        return None

    bundle = joblib.load(MODEL_PATH)
    clf = bundle["model"]
    feature_cols: list[str] = bundle["feature_cols"]
    label_map: dict[int, str] = bundle.get("label_map", INV_LABEL_MAP)

    row = {c: float(features.get(c, 0)) for c in feature_cols}
    X = pd.DataFrame([row])
    pred = int(clf.predict(X)[0])
    proba = clf.predict_proba(X)[0]
    return {
        "grade_label": label_map.get(pred, "未确定"),
        "confidence": float(max(proba)),
        "probabilities": {label_map.get(i, str(i)): round(float(p), 4) for i, p in enumerate(proba)},
        "source": "pathology_imaging_grade_model",
    }


def external_validation_report(*, test_fraction: float = 0.3) -> dict[str, Any]:
    """Simple hold-out metrics on stored feature rows (proxy for external validation)."""
    try:
        import pandas as pd
        from sklearn.metrics import accuracy_score, confusion_matrix, roc_auc_score
        from sklearn.model_selection import train_test_split
        import joblib
    except ImportError as e:
        raise RuntimeError("缺少 sklearn/pandas/joblib") from e

    if not MODEL_PATH.is_file():
        raise ValueError("尚未训练影像分级模型")

    rows = [r for r in load_feature_rows() if r.get("grade_binary") in (0, 1) and r.get("features")]
    if len(rows) < 4:
        raise ValueError("特征样本不足，无法做验证报告")

    bundle = joblib.load(MODEL_PATH)
    clf = bundle["model"]
    feature_cols: list[str] = bundle["feature_cols"]

    X = pd.DataFrame([{c: float(r["features"].get(c, 0)) for c in feature_cols} for r in rows])
    y = pd.Series([int(r["grade_binary"]) for r in rows])

    _, X_test, _, y_test = train_test_split(
        X, y, test_size=min(test_fraction, 0.5), random_state=7, stratify=y if y.nunique() > 1 else None
    )
    y_pred = clf.predict(X_test)
    acc = float(accuracy_score(y_test, y_pred))
    cm = confusion_matrix(y_test, y_pred).tolist()
    auc = None
    if y_test.nunique() > 1:
        proba = clf.predict_proba(X_test)[:, 1]
        auc = float(roc_auc_score(y_test, proba))

    return {
        "ok": True,
        "n_test": int(len(y_test)),
        "accuracy": acc,
        "auc": auc,
        "confusion_matrix": cm,
        "labels": ["低级别", "高级别"],
        "clinical_pass_hint": acc >= 0.7 and (auc is None or auc >= 0.7),
    }
