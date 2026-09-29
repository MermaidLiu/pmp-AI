#!/usr/bin/env python3
"""Train rPCI + pathology grade models on CT (after/beside segmentation).

1) rPCI region scores (0–3 × 13) — multi-output classifier on pooled slice features
2) Pathology grade (高/低) — XGBoost on rPCI + seg-derived volumes

Uses rPCI Delphi rule: per-region score = max slice sc in that region (Tops-Welten 2025).

Run from backend/:
  python3 -m ml.train_ct_rpci_grade --status
  python3 -m ml.train_ct_rpci_grade --mode all
"""

from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

RPCI_MODEL_PATH = BACKEND_ROOT / "models" / "ct_rpci_region_mlp.joblib"
GRADE_MODEL_PATH = BACKEND_ROOT / "models" / "ct_pathology_grade.joblib"
META_PATH = BACKEND_ROOT / "models" / "ct_rpci_grade.meta.json"
SEG_MODEL_PATH = BACKEND_ROOT / "models" / "ct_lesion_unet2d.pth"


def _feature_row_from_study(study: dict[str, Any]) -> dict[str, float] | None:
    from app.services.ct_ml_dataset import load_slice_image_and_mask

    manifest = study["manifest"]
    did = str(manifest.get("dataset_id") or "")
    region_vol = [0.0] * 13
    region_max_sc = [0.0] * 13
    total_lesion_px = 0.0

    for rec in manifest.get("slices") or []:
        if not isinstance(rec, dict):
            continue
        pair = load_slice_image_and_mask(did, rec)
        if pair is None:
            continue
        _, mask = pair
        px = float(mask.sum())
        total_lesion_px += px
        reg = rec.get("region")
        sc = rec.get("sc")
        try:
            e = int(reg) if reg is not None else None
        except (TypeError, ValueError):
            e = None
        if e is not None and 0 <= e <= 12:
            region_vol[e] += px
            if sc is not None:
                region_max_sc[e] = max(region_max_sc[e], float(int(sc)))

    rpci = study.get("region_scores") or [None] * 13
    feats: dict[str, float] = {"total_lesion_pixels": total_lesion_px}
    for i in range(13):
        feats[f"r{i}_vol_px"] = region_vol[i]
        feats[f"r{i}_sc_label"] = float(rpci[i]) if rpci[i] is not None else region_max_sc[i]
    feats["total_pci_label"] = float(study["total_pci"] or 0)
    return feats


def status() -> dict:
    from app.services.ct_ml_dataset import collect_study_grade_samples

    studies = collect_study_grade_samples()
    rpci_n = sum(1 for s in studies if s.get("total_pci") is not None)
    grade_n = sum(1 for s in studies if s.get("grade_binary") in (0, 1))
    meta: dict = {}
    if META_PATH.is_file():
        try:
            meta = json.loads(META_PATH.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            pass
    return {
        "studies_with_labels": len(studies),
        "studies_with_rpci": rpci_n,
        "studies_with_grade": grade_n,
        "seg_model_exists": SEG_MODEL_PATH.is_file(),
        "rpci_model_exists": RPCI_MODEL_PATH.is_file(),
        "grade_model_exists": GRADE_MODEL_PATH.is_file(),
        "last_training": meta,
        "hint": "manifest 需含 sc/region；病理标签来自 cohort features.jsonl 或 dataset_id=case_id",
    }


def train_rpci_mlp(min_studies: int = 4) -> dict[str, Any]:
    """Predict 13 region scores (0–3) from hand-crafted region features."""
    import joblib
    import numpy as np
    import pandas as pd
    from sklearn.multioutput import MultiOutputClassifier
    from sklearn.model_selection import train_test_split
    from xgboost import XGBClassifier

    from app.services.ct_ml_dataset import collect_study_grade_samples

    studies = [s for s in collect_study_grade_samples() if s.get("total_pci") is not None]
    if len(studies) < min_studies:
        raise ValueError(f"含 rPCI 标签的病例仅 {len(studies)}，至少需要 {min_studies}")

    rows = []
    y_rows = []
    for s in studies:
        feats = _feature_row_from_study(s)
        if feats is None:
            continue
        rs = s.get("region_scores") or []
        if not any(v is not None for v in rs):
            continue
        y = [int(v) if v is not None else 0 for v in rs]
        rows.append(feats)
        y_rows.append(y)

    if len(rows) < min_studies:
        raise ValueError("有效 rPCI 特征行不足")

    feature_cols = [c for c in rows[0].keys() if not c.endswith("_label") or c == "total_lesion_pixels"]
    feature_cols = sorted(set(k for r in rows for k in r) - {"total_pci_label"})
    X = pd.DataFrame([{c: r.get(c, 0) for c in feature_cols} for r in rows])
    Y = np.array(y_rows)

    X_train, X_test, Y_train, Y_test = train_test_split(X, Y, test_size=0.25, random_state=42)

    base = XGBClassifier(
        n_estimators=80,
        max_depth=4,
        learning_rate=0.08,
        objective="multi:softmax",
        num_class=4,
        random_state=42,
    )
    clf = MultiOutputClassifier(base)
    clf.fit(X_train, Y_train)
    acc = float((clf.predict(X_test) == Y_test).mean()) if len(X_test) else 1.0

    RPCI_MODEL_PATH.parent.mkdir(parents=True, exist_ok=True)
    joblib.dump({"model": clf, "feature_cols": feature_cols, "task": "rpci_13_region"}, RPCI_MODEL_PATH)
    return {"rpci_region_accuracy_approx": acc, "samples": len(rows), "model_path": str(RPCI_MODEL_PATH)}


def train_grade_xgb(min_studies: int = 6) -> dict[str, Any]:
    import joblib
    import pandas as pd
    from sklearn.metrics import accuracy_score
    from sklearn.model_selection import train_test_split
    from xgboost import XGBClassifier

    from app.services.ct_ml_dataset import collect_study_grade_samples

    studies = [s for s in collect_study_grade_samples() if s.get("grade_binary") in (0, 1)]
    if len(studies) < min_studies:
        raise ValueError(f"含病理分级的病例仅 {len(studies)}，至少需要 {min_studies}")

    rows, labels = [], []
    for s in studies:
        feats = _feature_row_from_study(s)
        if feats is None:
            continue
        feats.pop("total_pci_label", None)
        rows.append(feats)
        labels.append(int(s["grade_binary"]))

    feature_cols = sorted(rows[0].keys())
    X = pd.DataFrame([{c: r.get(c, 0) for c in feature_cols} for r in rows])
    y = pd.Series(labels)

    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.25, random_state=42, stratify=y if y.nunique() > 1 else None
    )
    clf = XGBClassifier(n_estimators=100, max_depth=4, random_state=42)
    clf.fit(X_train, y_train)
    acc = float(accuracy_score(y_test, clf.predict(X_test))) if len(y_test) else 1.0

    GRADE_MODEL_PATH.parent.mkdir(parents=True, exist_ok=True)
    joblib.dump(
        {"model": clf, "feature_cols": feature_cols, "label_map": {0: "低级别", 1: "高级别"}},
        GRADE_MODEL_PATH,
    )
    return {"grade_accuracy": acc, "samples": len(rows), "model_path": str(GRADE_MODEL_PATH)}


def main() -> None:
    p = argparse.ArgumentParser(description="CT rPCI + 病理分级训练")
    p.add_argument("--status", action="store_true")
    p.add_argument("--mode", choices=("rpci", "grade", "all"), default="all")
    args = p.parse_args()
    if args.status:
        print(json.dumps(status(), ensure_ascii=False, indent=2))
        return

    out: dict[str, Any] = {"ok": True}
    if args.mode in ("rpci", "all"):
        out["rpci"] = train_rpci_mlp()
    if args.mode in ("grade", "all"):
        out["grade"] = train_grade_xgb()

    meta = {"trained_at": datetime.now(timezone.utc).isoformat(), **out}
    META_PATH.parent.mkdir(parents=True, exist_ok=True)
    META_PATH.write_text(json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(out, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
