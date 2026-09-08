"""病理分级模型：训练集导出、特征工程与 sklearn 训练。"""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.domain import PetCtInterviewRecord
from app.models.orm import PetCtCaseORM
from app.repositories import pet_ct_case
from app.services.pathology_grader import analyze_case

DATA_DIR = Path("data/training")
CSV_PATH = DATA_DIR / "pathology_training.csv"
MODEL_PATH = Path("models/pathology_grade_classifier.joblib")
META_PATH = Path("models/pathology_grade_classifier.meta.json")

LABEL_MAP = {"高级别": 1, "低级别": 0}
INV_LABEL_MAP = {1: "高级别", 0: "低级别"}

FEATURE_DISPLAY: dict[str, str] = {
    "age": "年龄",
    "gender_code": "性别",
    "height_cm": "身高(cm)",
    "weight_kg": "体重(kg)",
    "suv_max": "SUVmax",
    "suv_mean": "SUVmean",
    "mtv": "MTV",
    "tlg": "TLG",
    "lesion_count": "病灶数",
}


def _gender_code(g: str) -> int:
    g = (g or "").strip()
    if g in ("男", "M", "male", "Male"):
        return 1
    if g in ("女", "F", "female", "Female"):
        return 0
    return -1


def record_to_feature_row(rec: PetCtInterviewRecord, label: str) -> dict[str, Any]:
    p = rec.patient_base_info
    rx = rec.research_extensions
    gq = rx.global_quant
    return {
        "exam_id": p.exam_id or "",
        "clinical_diagnosis": rec.interview_info.clinical_diagnosis or "",
        "department": p.department or "",
        "age": float(p.age or 0),
        "gender_code": float(_gender_code(p.gender)),
        "height_cm": float(p.height_cm or 0),
        "weight_kg": float(p.weight_kg or 0),
        "suv_max": float(gq.suv_max) if gq.suv_max is not None else 0.0,
        "suv_mean": float(gq.suv_mean) if gq.suv_mean is not None else 0.0,
        "mtv": float(gq.mtv) if gq.mtv is not None else 0.0,
        "tlg": float(gq.tlg) if gq.tlg is not None else 0.0,
        "lesion_count": float(len(rx.lesions or [])),
        "grade_label": label,
        "grade_binary": LABEL_MAP.get(label, -1),
    }


def _resolve_label(rec: PetCtInterviewRecord) -> str | None:
    rx = rec.research_extensions
    stored = (rx.pathology_grade or "").strip()
    if stored in LABEL_MAP:
        return stored
    result = analyze_case(rec)
    label = result.grading.grade_label
    return label if label in LABEL_MAP else None


def _build_global_importance(clf: Any, feature_cols: list[str]) -> list[dict[str, Any]]:
    importances = clf.feature_importances_
    items = [
        {
            "feature": col,
            "display_name": FEATURE_DISPLAY.get(col, col),
            "importance": round(float(imp), 4),
        }
        for col, imp in zip(feature_cols, importances)
    ]
    items.sort(key=lambda x: x["importance"], reverse=True)
    return items


def _local_feature_contributions(
    clf: Any,
    X: Any,
    feature_cols: list[str],
    feature_means: dict[str, float],
) -> tuple[list[dict[str, Any]], str]:
    """单例特征贡献：优先 SHAP TreeExplainer，否则 (值-均值)×重要性。"""
    contributions: list[dict[str, Any]] = []
    method = "deviation_x_importance"

    try:
        import shap

        explainer = shap.TreeExplainer(clf)
        shap_values = explainer.shap_values(X)
        if isinstance(shap_values, list):
            values = shap_values[1][0]
        elif getattr(shap_values, "ndim", 0) == 2:
            values = shap_values[0]
        else:
            values = shap_values[0]
        method = "shap_tree"
        for i, col in enumerate(feature_cols):
            val = float(X[col].iloc[0])
            contrib = float(values[i])
            contributions.append(
                {
                    "feature": col,
                    "display_name": FEATURE_DISPLAY.get(col, col),
                    "value": round(val, 4),
                    "contribution": round(contrib, 4),
                    "direction": "推向高级别" if contrib > 0 else "推向低级别",
                }
            )
    except Exception:
        importances = clf.feature_importances_
        for i, col in enumerate(feature_cols):
            val = float(X[col].iloc[0])
            mean = float(feature_means.get(col, 0.0))
            contrib = (val - mean) * float(importances[i])
            contributions.append(
                {
                    "feature": col,
                    "display_name": FEATURE_DISPLAY.get(col, col),
                    "value": round(val, 4),
                    "contribution": round(contrib, 4),
                    "direction": "推向高级别" if contrib > 0 else "推向低级别",
                }
            )

    contributions.sort(key=lambda x: abs(x["contribution"]), reverse=True)
    return contributions, method


def get_global_feature_importance() -> list[dict[str, Any]]:
    """读取已训练模型的全局特征重要性（训练面板图表用）。"""
    if MODEL_PATH.is_file():
        try:
            import joblib

            bundle = joblib.load(MODEL_PATH)
            fi = bundle.get("feature_importance")
            if fi:
                return fi
        except Exception:
            pass
    if META_PATH.is_file():
        try:
            meta = json.loads(META_PATH.read_text(encoding="utf-8"))
            return meta.get("feature_importance", [])
        except json.JSONDecodeError:
            pass
    return []


def build_dataset_from_db(db: Session) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    rows_orm = db.execute(select(PetCtCaseORM).order_by(PetCtCaseORM.id.desc()).limit(5000)).scalars().all()
    rows: list[dict[str, Any]] = []
    skipped = 0
    for orm in rows_orm:
        rec = pet_ct_case.orm_to_record(orm)
        label = _resolve_label(rec)
        if label is None:
            skipped += 1
            continue
        rows.append(record_to_feature_row(rec, label))

    meta = {
        "source": "database",
        "total_cases_in_db": len(rows_orm),
        "labeled_rows": len(rows),
        "skipped_unlabeled": skipped,
        "high_grade_count": sum(1 for r in rows if r["grade_label"] == "高级别"),
        "low_grade_count": sum(1 for r in rows if r["grade_label"] == "低级别"),
    }
    return rows, meta


def export_training_csv(db: Session) -> dict[str, Any]:
    """导出训练 CSV 到 data/training/pathology_training.csv。"""
    try:
        import pandas as pd
    except ImportError as e:
        raise RuntimeError("请安装 pandas：pip install pandas") from e

    rows, meta = build_dataset_from_db(db)
    if not rows:
        raise ValueError(
            "没有可导出的标注数据。请先在「病历输入」打开「解析后直接入库」上传 DICOM/JSON，"
            "并确保病例含临床诊断或病理分级线索。"
        )

    DATA_DIR.mkdir(parents=True, exist_ok=True)
    df = pd.DataFrame(rows)
    df.to_csv(CSV_PATH, index=False, encoding="utf-8-sig")

    return {
        "csv_path": str(CSV_PATH),
        "total_rows": len(rows),
        "high_grade_count": meta["high_grade_count"],
        "low_grade_count": meta["low_grade_count"],
        "preview": rows[:10],
        "meta": meta,
    }


def train_pathology_classifier(db: Session) -> dict[str, Any]:
    """读取 CSV 或数据库，训练 XGBoost 二分类模型。"""
    try:
        import joblib
        import pandas as pd
        from sklearn.metrics import accuracy_score
        from sklearn.model_selection import train_test_split
        from xgboost import XGBClassifier
    except ImportError as e:
        raise RuntimeError("请安装训练依赖：pip install pandas scikit-learn joblib xgboost") from e

    if CSV_PATH.is_file():
        df = pd.read_csv(CSV_PATH)
    else:
        rows, _ = build_dataset_from_db(db)
        if not rows:
            raise ValueError("无训练数据，请先导出训练集。")
        df = pd.DataFrame(rows)

    df = df[df["grade_binary"].isin([0, 1])].copy()
    if len(df) < 4:
        raise ValueError(f"有效样本仅 {len(df)} 条，至少需要 4 条（建议高级别/低级别各 80 例左右）。")

    feature_cols = [
        "age",
        "gender_code",
        "height_cm",
        "weight_kg",
        "suv_max",
        "suv_mean",
        "mtv",
        "tlg",
        "lesion_count",
    ]
    X = df[feature_cols].fillna(0.0)
    y = df["grade_binary"].astype(int)
    feature_means = {col: float(X[col].mean()) for col in feature_cols}

    test_size = 0.25 if len(df) >= 8 else 0.2
    stratify = y if len(y.unique()) > 1 and len(df) >= 8 else None
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=test_size, random_state=42, stratify=stratify
    )

    clf = XGBClassifier(
        n_estimators=100,
        max_depth=6,
        learning_rate=0.1,
        subsample=0.9,
        colsample_bytree=0.9,
        random_state=42,
        eval_metric="logloss",
    )
    clf.fit(X_train, y_train)
    y_pred = clf.predict(X_test)
    accuracy = float(accuracy_score(y_test, y_pred)) if len(y_test) else 1.0

    feature_importance = _build_global_importance(clf, feature_cols)

    MODEL_PATH.parent.mkdir(parents=True, exist_ok=True)
    joblib.dump(
        {
            "model": clf,
            "model_type": "xgboost",
            "feature_cols": feature_cols,
            "label_map": INV_LABEL_MAP,
            "feature_means": feature_means,
            "feature_importance": feature_importance,
        },
        MODEL_PATH,
    )

    meta = {
        "trained_at": datetime.now(timezone.utc).isoformat(),
        "model_type": "xgboost",
        "samples_total": int(len(df)),
        "samples_train": int(len(X_train)),
        "samples_test": int(len(X_test)),
        "accuracy": accuracy,
        "high_grade_count": int((y == 1).sum()),
        "low_grade_count": int((y == 0).sum()),
        "feature_cols": feature_cols,
        "feature_importance": feature_importance,
        "model_path": str(MODEL_PATH),
    }
    META_PATH.write_text(json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8")

    return {
        "ok": True,
        "message": "模型训练完成",
        "accuracy": accuracy,
        "samples": int(len(df)),
        "high_grade_count": meta["high_grade_count"],
        "low_grade_count": meta["low_grade_count"],
        "model_path": str(MODEL_PATH),
        "feature_cols": feature_cols,
        "feature_importance": feature_importance,
        "meta": meta,
    }


def get_training_status(db: Session) -> dict[str, Any]:
    rows_orm = db.execute(select(PetCtCaseORM)).scalars().all()
    meta: dict[str, Any] = {}
    if META_PATH.is_file():
        try:
            meta = json.loads(META_PATH.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            meta = {}

    feature_importance = meta.get("feature_importance") or get_global_feature_importance()

    return {
        "db_case_count": len(rows_orm),
        "csv_exists": CSV_PATH.is_file(),
        "csv_path": str(CSV_PATH),
        "model_exists": MODEL_PATH.is_file(),
        "model_path": str(MODEL_PATH),
        "last_training": meta,
        "feature_importance": feature_importance,
    }


def predict_with_trained_model(rec: PetCtInterviewRecord) -> dict[str, Any] | None:
    """若已训练模型，返回预测结果与可解释性；否则 None。"""
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
    feature_means: dict[str, float] = bundle.get("feature_means", {})
    global_importance: list[dict[str, Any]] = bundle.get(
        "feature_importance", _build_global_importance(clf, feature_cols)
    )

    label_hint = "低级别"  # 特征行标签不参与预测，避免与 analyze_case 循环调用
    row = record_to_feature_row(rec, label_hint)
    X = pd.DataFrame([{c: row[c] for c in feature_cols}])
    pred = int(clf.predict(X)[0])
    proba = clf.predict_proba(X)[0]
    contributions, explanation_method = _local_feature_contributions(
        clf, X, feature_cols, feature_means
    )

    return {
        "grade_label": label_map.get(pred, "未确定"),
        "confidence": float(max(proba)),
        "probabilities": {label_map.get(i, str(i)): round(float(p), 4) for i, p in enumerate(proba)},
        "feature_contributions": contributions,
        "global_feature_importance": global_importance,
        "source": "trained_model",
        "explanation_method": explanation_method,
    }
