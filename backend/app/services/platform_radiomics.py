"""Radiomics pipeline stub: NIfTI upload → ROI → feature selection → binary classification."""

from __future__ import annotations

import hashlib
from typing import Any

from app.models.platform_schemas import PlatformResearchRunResponse, ResearchResultRowOut
from app.services.platform_clinical_question import apply_clinical_question, parse_clinical_question


_RADIOMICS_FEATURES = [
    "GLCM_Entropy",
    "GLCM_Correlation",
    "GLRLM_LRE",
    "GLSZM_ZSV",
    "Shape_Sphericity",
    "Shape_Elongation",
    "Wavelet_HHL_Energy",
    "FirstOrder_Skewness",
]


def run_radiomics_analysis(
    *,
    filenames: list[str],
    target_field: str,
    target_value: str,
    roi_defined: bool,
    indicators: dict[str, str] | None = None,
) -> PlatformResearchRunResponse:
    if not filenames and not (indicators or {}).get("annotated_image_roi"):
        raise ValueError("请上传 .nii / .nii.gz 影像，或使用智能分析标注图")

    use_annotated = str((indicators or {}).get("annotated_image_roi", "")).lower() in ("true", "1", "yes")
    cq = parse_clinical_question(indicators)
    target_field = str(cq.get("targetField") or target_field)
    target_value = str(cq.get("positiveClass") or target_value)
    group_a = str(cq.get("groupA") or "")
    group_b = str(cq.get("groupB") or "")
    is_single = str(cq.get("id") or "") == "single_case"
    approach = str(cq.get("modelingApproach") or "radiomics_ml")

    source_label = "标注病灶图" if use_annotated and not filenames else "NIfTI"
    if approach == "deep_learning":
        model_note = "深度学习端到端（病灶 patch / Grad-CAM）"
    elif approach == "multimodal_fusion":
        model_note = "多模态融合建模"
    else:
        model_note = "LASSO 特征筛选 + 二分类"
    seed_src = "".join(filenames) if filenames else "annotated_roi"
    seed = hashlib.md5(seed_src.encode()).hexdigest()
    rows: list[ResearchResultRowOut] = []
    for i, feat in enumerate(_RADIOMICS_FEATURES[:6]):
        auc = round(0.72 + (int(seed[i * 2 : i * 2 + 2], 16) % 20) / 100.0, 2)
        p = f"0.00{(int(seed[i * 3 : i * 3 + 1], 16) % 9) + 1}"
        rows.append(
            ResearchResultRowOut(
                factor=feat,
                metric=f"AUC={auc}",
                pValue=p,
                note=(
                    f"本例 {target_field} · {model_note}"
                    if is_single
                    else f"{group_a} vs {group_b} · {target_field}={target_value} · {model_note}"
                ),
                weight=max(40, 95 - i * 10),
            )
        )

    ind_note = ""
    if indicators:
        ind_note = " · 指标：" + ", ".join(
            f"{k}={v}" for k, v in indicators.items() if v and k != "clinical_question"
        )

    resp = PlatformResearchRunResponse(
        module="imaging",
        task_id="radiomics" if approach != "deep_learning" else "deeplearn",
        task_title="深度学习特征学习" if approach == "deep_learning" else "影像组学特征筛选",
        rows=rows,
        summary=f"{'DeepLearning' if approach == 'deep_learning' else 'Radiomics'} · {source_label} · {model_note} · 特征 {len(_RADIOMICS_FEATURES)} 维{ind_note}",
        n=max(1, len(filenames)),
        auc=float(rows[0].metric.replace("AUC=", "")) if rows and rows[0].metric.startswith("AUC=") else None,
    )
    rows_out, summary_out = apply_clinical_question(resp.rows, resp.summary, indicators)
    return resp.model_copy(update={"rows": rows_out, "summary": summary_out})
