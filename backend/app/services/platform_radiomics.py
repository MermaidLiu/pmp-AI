"""Radiomics: PyRadiomics ROI feature extraction + lightweight ranking / cohort stub."""

from __future__ import annotations

from typing import Any

from app.models.platform_schemas import PlatformResearchRunResponse, ResearchResultRowOut
from app.services.platform_clinical_question import apply_clinical_question, parse_clinical_question
from app.services.radiomics_extractor import (
    extract_from_annotation_dataset,
    extract_from_uploaded_nifti_files,
    pyradiomics_available,
    pyradiomics_unavailable_reason,
    top_feature_rows,
)


def _rows_from_features(
    features: dict[str, float],
    *,
    target_field: str,
    model_note: str,
    is_single: bool,
    group_a: str,
    group_b: str,
    target_value: str,
) -> list[ResearchResultRowOut]:
    rows: list[ResearchResultRowOut] = []
    for i, (name, val) in enumerate(top_feature_rows(features, limit=12)):
        note = (
            f"本例 {target_field} · {model_note} · PyRadiomics"
            if is_single
            else f"{group_a} vs {group_b} · {target_field}={target_value} · {model_note}"
        )
        rows.append(
            ResearchResultRowOut(
                factor=name,
                metric=f"{val:.4g}",
                pValue="—",
                note=note,
                weight=max(40, 95 - i * 5),
            )
        )
    return rows


def extract_radiomics_features(
    *,
    annotation_dataset_id: str = "",
    file_items: list[tuple[str, bytes]] | None = None,
) -> tuple[dict[str, float], dict[str, Any]]:
    """Extract PyRadiomics features from annotation dataset or uploaded NIfTI pair."""
    if not pyradiomics_available():
        raise RuntimeError(pyradiomics_unavailable_reason())

    dataset_id = (annotation_dataset_id or "").strip()
    if dataset_id:
        return extract_from_annotation_dataset(dataset_id)
    if file_items:
        return extract_from_uploaded_nifti_files(file_items)
    raise ValueError("请提供 annotation_dataset_id 或上传 CT+ROI NIfTI 文件对")


def run_radiomics_analysis(
    *,
    filenames: list[str],
    target_field: str,
    target_value: str,
    roi_defined: bool,
    indicators: dict[str, str] | None = None,
    annotation_dataset_id: str = "",
    file_items: list[tuple[str, bytes]] | None = None,
) -> PlatformResearchRunResponse:
    if not roi_defined:
        raise ValueError("请先确认 ROI / 分割")

    cq = parse_clinical_question(indicators)
    target_field = str(cq.get("targetField") or target_field)
    target_value = str(cq.get("positiveClass") or target_value)
    group_a = str(cq.get("groupA") or "")
    group_b = str(cq.get("groupB") or "")
    is_single = str(cq.get("id") or "") == "single_case"
    approach = str(cq.get("modelingApproach") or "radiomics_ml")

    dataset_id = (annotation_dataset_id or str((indicators or {}).get("annotation_dataset_id") or "")).strip()
    use_annotated = str((indicators or {}).get("annotated_image_roi", "")).lower() in ("true", "1", "yes")

    if not dataset_id and not file_items and not filenames and not use_annotated:
        raise ValueError("请上传 NIfTI、提供 annotation_dataset_id，或先保存标注数据集")

    features: dict[str, float] = {}
    meta: dict[str, Any] = {}
    extraction_error = ""

    try:
        if file_items:
            features, meta = extract_from_uploaded_nifti_files(file_items)
        elif dataset_id:
            features, meta = extract_from_annotation_dataset(dataset_id)
        elif use_annotated and not dataset_id:
            raise ValueError(
                "使用 CT 标注图做 PyRadiomics 时，请先在智能分析时勾选「保存标注数据集」，"
                "或重新分析并开启 save_annotation_dataset。"
            )
        else:
            raise ValueError("未找到可用于 PyRadiomics 的 ROI 体积（NIfTI 或 annotation_dataset）")
    except Exception as exc:
        extraction_error = str(exc)
        if not pyradiomics_available():
            raise RuntimeError(extraction_error) from exc
        raise ValueError(extraction_error) from exc

    feature_count = len(features)
    if approach == "deep_learning":
        model_note = "PyRadiomics 特征 + 深度学习（特征已提取，分类头待队列训练）"
    elif approach == "multimodal_fusion":
        model_note = "PyRadiomics 特征（待多模态融合）"
    else:
        model_note = "PyRadiomics 特征（firstorder/shape/texture）"

    source_label = str(meta.get("source") or "ROI")
    if meta.get("dataset_id"):
        source_label = f"annotation:{meta.get('dataset_id')}"

    rows = _rows_from_features(
        features,
        target_field=target_field,
        model_note=model_note,
        is_single=is_single,
        group_a=group_a,
        group_b=group_b,
        target_value=target_value,
    )

    ind_note = ""
    if indicators:
        ind_note = " · 指标：" + ", ".join(
            f"{k}={v}" for k, v in indicators.items() if v and k not in ("clinical_question", "annotation_dataset_id")
        )

    summary = (
        f"PyRadiomics · {source_label} · 提取 {feature_count} 维特征 · {model_note}"
        f" · 体积 {meta.get('volume_shape', '—')} spacing {meta.get('spacing', '—')}"
        f"{ind_note}"
    )
    if extraction_error:
        summary += f" · 警告：{extraction_error[:120]}"

    resp = PlatformResearchRunResponse(
        module="imaging",
        task_id="radiomics" if approach != "deep_learning" else "deeplearn",
        task_title="深度学习特征学习" if approach == "deep_learning" else "影像组学特征筛选",
        rows=rows,
        summary=summary,
        n=1,
        auc=None,
    )
    rows_out, summary_out = apply_clinical_question(resp.rows, resp.summary, indicators)
    return resp.model_copy(update={"rows": rows_out, "summary": summary_out})
