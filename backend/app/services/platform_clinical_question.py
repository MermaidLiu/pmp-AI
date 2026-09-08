"""Parse and apply workbench clinical-question definitions to research outputs."""

from __future__ import annotations

import json
from typing import Any

from app.models.platform_schemas import ResearchResultRowOut

_MODEL_LABELS = {
    "radiomics_ml": "影像组学+ML",
    "deep_learning": "深度学习（病灶端到端）",
    "multimodal_fusion": "多模态融合",
    "traditional_stats": "传统统计",
}

_OUTCOME_LABELS = {
    "binary": "二分类",
    "multiclass": "多分类",
    "survival": "生存分析",
    "regression": "回归",
}


def parse_clinical_question(indicators: dict[str, str] | None) -> dict[str, Any]:
    raw = (indicators or {}).get("clinical_question", "")
    if not raw:
        return {}
    try:
        data = json.loads(raw)
        return data if isinstance(data, dict) else {}
    except json.JSONDecodeError:
        return {}


def clinical_question_summary(q: dict[str, Any]) -> str:
    if not q:
        return ""
    if str(q.get("id") or "") == "single_case":
        tf = str(q.get("targetField") or "本例影像结论").strip()
        return f"临床问题：单病例分析 · {tf}"
    parts: list[str] = []
    title = str(q.get("title") or q.get("id") or "").strip()
    if title:
        parts.append(f"临床问题：{title}")
    ga = str(q.get("groupA") or "").strip()
    gb = str(q.get("groupB") or "").strip()
    if ga and gb:
        parts.append(f"{ga} vs {gb}")
    tf = str(q.get("targetField") or "").strip()
    pc = str(q.get("positiveClass") or "").strip()
    if tf:
        parts.append(f"目标={tf}" + (f"（{pc}）" if pc else ""))
    approach = str(q.get("modelingApproach") or "")
    if approach:
        parts.append(_MODEL_LABELS.get(approach, approach))
    outcome = str(q.get("outcomeType") or "")
    if outcome:
        parts.append(_OUTCOME_LABELS.get(outcome, outcome))
    return " · ".join(parts)


def apply_clinical_question(
    rows: list[ResearchResultRowOut],
    summary: str,
    indicators: dict[str, str] | None,
) -> tuple[list[ResearchResultRowOut], str]:
    q = parse_clinical_question(indicators)
    if not q:
        return rows, summary

    cq_summary = clinical_question_summary(q)
    hypothesis = str(q.get("hypothesis") or "").strip()
    note_parts = [cq_summary]
    if hypothesis:
        note_parts.append(hypothesis[:120] + ("…" if len(hypothesis) > 120 else ""))

    header = ResearchResultRowOut(
        factor="临床问题定义",
        metric=str(q.get("outcomeType") or "binary"),
        pValue="—",
        note=" · ".join(note_parts),
        weight=100,
    )
    new_summary = f"{summary} · {cq_summary}" if cq_summary else summary
    return [header, *rows], new_summary
