"""Clinical care pathway: imaging report from CT API + MDT draft treatment evidence cards."""

from __future__ import annotations

import json
import logging
import re
from typing import Any

from app.models.domain import PetCtInterviewRecord
from app.models.platform_schemas import PathologyImagingGradeResult
from app.services.literature_sources import formal_literature_search
from app.services.llm_gateway import chat_completions, is_llm_available, llm_chat_model, normalize_provider
from app.services.pathology_grader import infer_histologic_grade_label
from app.services.treatment_evidence import (
    DRAFT_STATUS,
    build_evidence_cards,
    cards_to_legacy_lines,
    collect_patient_evidence,
    unique_guideline_titles,
)

logger = logging.getLogger(__name__)

TREATMENT_SYSTEM_PROMPT = """你是腹膜假粘液瘤（PMP）及腹膜肿瘤多学科临床路径助手。
请根据 CT 合并接口返回的 PCI/病理结论与临床信息，给出中文治疗建议草案（供 MDT 确认，非最终医嘱）。

要求：
1. 输出 3–5 条独立建议，每条一行，不要编号，不要 Markdown 标题
2. 语气简洁、专业，类似临床路径条目
3. grade_label 必须与 api_conclusion 中的病理分级一致（PCI 总分不代表组织学分级），不要编造未提供的检验数值
4. 明确这是 MDT 待确认草案，不做最终临床决策
5. 仅输出 JSON：{"recommendations":["...","..."],"mdt_recommended":true,"grade_label":"高级别|低级别|未确定"}"""


def _get_pci_block(imaging: PathologyImagingGradeResult) -> dict[str, Any]:
    if imaging.pci:
        return imaging.pci.model_dump(mode="json")
    raw = imaging.raw or {}
    pci = raw.get("pci")
    return pci if isinstance(pci, dict) else {}


def _api_conclusion(imaging: PathologyImagingGradeResult, pci: dict[str, Any]) -> str:
    for source in (pci, imaging.raw or {}):
        if not isinstance(source, dict):
            continue
        for key in ("conclusion", "report", "pathologyReport", "pathology_report", "summary", "diagnosis"):
            val = source.get(key)
            if isinstance(val, str) and val.strip():
                return val.strip()
    msg = imaging.message or ""
    for part in msg.split(" · "):
        if any(k in part for k in ("结论", "病理分级", "检测结果", "PCI")):
            return part.strip()
    return msg.split(" · ")[0].strip() if msg else "接口未返回文字结论，请查看 PCI 评分与分割结果。"


def _infer_grade(imaging: PathologyImagingGradeResult, pci: dict[str, Any], record: PetCtInterviewRecord) -> str:
    conclusion = _api_conclusion(imaging, pci)
    rx = record.research_extensions
    return infer_histologic_grade_label(
        conclusion,
        str(pci.get("conclusion") or ""),
        imaging.grade_label or "",
        rx.pathology_grade if rx else "",
        imaging.message or "",
    )


def build_imaging_report_text(
    imaging: PathologyImagingGradeResult,
    record: PetCtInterviewRecord,
) -> str:
    pci = _get_pci_block(imaging)
    conclusion = _api_conclusion(imaging, pci)
    iv = record.interview_info
    rx = record.research_extensions
    lab = rx.lab_snapshot or {}

    lines = [
        "【影像分析报告】",
        "来源：CT 合并接口（分割 + PCI）",
        "",
        conclusion,
        "",
    ]
    if pci.get("pci_score") is not None:
        lines.append(f"PCI 总分：{pci.get('pci_score')}/36")
    if pci.get("is_positive") is not None:
        rate = pci.get("positive_rate")
        rate_txt = ""
        if rate is not None:
            rate_txt = f"（阳性概率 {float(rate) * 100 if float(rate) <= 1 else float(rate):.0f}%）"
        lines.append(f"PCI 阴阳性：{'阳性' if pci.get('is_positive') else '阴性'}{rate_txt}")
    if imaging.dicom_count:
        lines.append(f"DICOM 层数：{imaging.dicom_count}")
    if iv.clinical_diagnosis:
        lines.append(f"临床诊断：{iv.clinical_diagnosis}")
    lab_parts = [
        f"{k} {v}"
        for k, v in lab.items()
        if v and k in ("CEA", "CA125", "CA19-9", "TNM分期", "治疗方式", "第几次手术", "是否静脉化疗", "CC评分")
    ]
    if lab_parts:
        lines.append("临床/实验室：" + " · ".join(lab_parts))
    return "\n".join(lines)


def _parse_recommendation_lines(text: str) -> list[str]:
    lines: list[str] = []
    for raw in text.splitlines():
        s = raw.strip()
        s = re.sub(r"^[\d]+[.)、]\s*", "", s)
        s = re.sub(r"^[-*•]\s*", "", s)
        if s and len(s) > 4:
            lines.append(s)
    return lines[:8]


async def _llm_recommendation_lines(
    context: dict[str, Any],
    grade_label: str,
    *,
    allow_llm: bool = True,
    llm_provider: str | None = None,
) -> tuple[list[str], bool, str, bool]:
    """Returns (lines, mdt, model, llm_used)."""
    provider = normalize_provider(llm_provider)
    model = llm_chat_model(provider)
    if not allow_llm or not is_llm_available(provider):
        return [], grade_label in ("高级别", "未确定"), "rule-engine", False

    user_msg = (
        "请基于以下 JSON 生成 MDT 待确认治疗草案条目，"
        "仅输出 JSON 对象：\n"
        f"```json\n{json.dumps(context, ensure_ascii=False, indent=2)}\n```"
    )
    try:
        content, model_id = await chat_completions(
            [
                {"role": "system", "content": TREATMENT_SYSTEM_PROMPT},
                {"role": "user", "content": user_msg},
            ],
            provider=provider,
            temperature=0.25,
            max_tokens=1200,
            timeout=90.0,
        )
        # Strip markdown fences if model wraps JSON
        raw = content.strip()
        if raw.startswith("```"):
            raw = re.sub(r"^```(?:json)?\s*", "", raw)
            raw = re.sub(r"\s*```$", "", raw)
        parsed: dict[str, Any] = {}
        if raw.startswith("{"):
            try:
                parsed = json.loads(raw)
            except json.JSONDecodeError:
                parsed = {}
        recs = parsed.get("recommendations") if isinstance(parsed.get("recommendations"), list) else []
        recs = [str(x).strip() for x in recs if str(x).strip()]
        if not recs:
            recs = _parse_recommendation_lines(content)
        mdt = bool(parsed.get("mdt_recommended", True))
        return recs, mdt, model_id, True
    except Exception as exc:
        logger.warning("ReachAPI treatment LLM failed: %s", exc)
        return [], True, model, False


async def generate_treatment_recommendations(
    imaging: PathologyImagingGradeResult,
    record: PetCtInterviewRecord,
    *,
    allow_llm: bool = True,
    llm_provider: str | None = None,
) -> dict[str, Any]:
    pci = _get_pci_block(imaging)
    conclusion = _api_conclusion(imaging, pci)
    grade_label = _infer_grade(imaging, pci, record) or "未确定"
    iv = record.interview_info
    rx = record.research_extensions

    context = {
        "api_conclusion": conclusion,
        "grade_label": grade_label,
        "pci_score": pci.get("pci_score"),
        "is_positive": pci.get("is_positive"),
        "positive_rate": pci.get("positive_rate"),
        "clinical_diagnosis": iv.clinical_diagnosis,
        "brief_history": iv.brief_medical_history,
        "labs": rx.lab_snapshot,
        "draft_policy": DRAFT_STATUS,
    }

    llm_lines, mdt, model, llm_used = await _llm_recommendation_lines(
        context, grade_label, allow_llm=allow_llm, llm_provider=llm_provider
    )
    patient_evidence = collect_patient_evidence(
        imaging,
        record,
        grade_label=grade_label,
        api_conclusion=conclusion,
        pci=pci,
    )
    cards = build_evidence_cards(
        grade_label=grade_label,
        patient_evidence=patient_evidence,
        llm_lines=llm_lines or None,
    )
    return {
        "recommendations": cards_to_legacy_lines(cards),
        "evidence_cards": cards,
        "grade_label": grade_label,
        "mdt_recommended": True if grade_label in ("高级别", "未确定") else mdt,
        "draft_status": DRAFT_STATUS,
        "guideline_refs": unique_guideline_titles(cards),
        "llm_used": llm_used,
        "llm_model": model,
    }


async def analyze_care_pathway(
    imaging: PathologyImagingGradeResult,
    record: PetCtInterviewRecord,
    *,
    allow_llm: bool = True,
    llm_provider: str | None = None,
) -> dict[str, Any]:
    imaging_report = build_imaging_report_text(imaging, record)
    treatment = await generate_treatment_recommendations(
        imaging, record, allow_llm=allow_llm, llm_provider=llm_provider
    )
    grade = treatment.get("grade_label", "未确定")
    # Formal literature only — never seed/demo fake PMIDs
    query = f"pseudomyxoma peritonei {grade} CRS HIPEC"
    lit_rows, _meta = await formal_literature_search(query, sources=["PubMed", "指南/共识"])
    literature = [
        {
            "title": r.get("title") or "",
            "journal": r.get("journal") or r.get("source") or "",
            "year": r.get("year") or "",
            "pmid": r.get("pmid") or "",
            "doi": r.get("doi") or "",
            "verifiable": bool(r.get("verifiable")),
            "pmid_validation": r.get("pmid_validation") or {},
            "doi_validation": r.get("doi_validation") or {},
            "cited_at": r.get("cited_at") or "",
            "is_demo": False,
        }
        for r in lit_rows[:5]
        if r.get("verifiable")
    ]
    return {
        "imaging_report": imaging_report,
        "api_conclusion": _api_conclusion(imaging, _get_pci_block(imaging)),
        "treatment": treatment,
        "literature": literature,
        "inferred_diagnosis": record.interview_info.clinical_diagnosis
        or record.research_extensions.primary_disease_name
        or "待明确",
    }
