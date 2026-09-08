"""Guideline-grounded PMP AI-assisted diagnosis with physician feedback support."""

from __future__ import annotations

import json
import re
from datetime import datetime, timezone
from typing import Any

import httpx

from app.core.config import settings
from app.data.guideline_fragments import fragment_citation, fragments_for_grade
from app.models.domain import PetCtInterviewRecord
from app.models.platform_schemas import (
    DiagnosisProbability,
    PathologyImagingGradeResult,
    PlatformAssistedDiagnosisResponse,
)
from app.services.platform_adapters import build_diagnosis
from app.services.tooluniverse_gateway import scientific_context


def _now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def _grade(record: PetCtInterviewRecord, imaging: PathologyImagingGradeResult | None) -> str:
    return (imaging.grade_label if imaging else "") or record.research_extensions.pathology_grade or "未确定"


def _safe_context(record: PetCtInterviewRecord, imaging: PathologyImagingGradeResult | None) -> dict[str, Any]:
    """The vertical model receives clinical content, never direct identifiers."""
    rx = record.research_extensions
    return {
        "clinical_diagnosis": record.interview_info.clinical_diagnosis,
        "brief_history": record.interview_info.brief_medical_history,
        "labs": rx.lab_snapshot,
        "imaging_grade": _grade(record, imaging),
        "imaging_confidence": imaging.confidence if imaging else rx.pathology_confidence,
        "pci_score": (imaging.pci.pci_score if imaging and imaging.pci else None),
        "imaging_conclusion": (imaging.pci.conclusion if imaging and imaging.pci else ""),
        "disease": rx.primary_disease_name,
    }


async def _call_pmp_model(context: dict[str, Any], guideline_refs: list[dict[str, Any]]) -> tuple[dict[str, Any], str]:
    if not (settings.pmp_model_api_key and settings.pmp_model_base_url and settings.pmp_model_name):
        return {}, "rule-engine"
    system = (
        "你是PMP专病临床辅助诊断模型。仅输出 JSON："
        '{"primary_impression":"","rationale":[""],"differential":[{"label":"","pct":0}]}。'
        "这不是最终诊断；不得编造缺失数据，不得给出医嘱。"
    )
    payload = {"model": settings.pmp_model_name, "messages": [
        {"role": "system", "content": system},
        {"role": "user", "content": json.dumps({"case": context, "guidelines": guideline_refs}, ensure_ascii=False)},
    ], "temperature": 0.1, "max_tokens": 900}
    url = settings.pmp_model_base_url.rstrip("/") + "/chat/completions"
    async with httpx.AsyncClient(timeout=settings.pmp_model_timeout) as client:
        response = await client.post(url, headers={"Authorization": f"Bearer {settings.pmp_model_api_key}"}, json=payload)
        response.raise_for_status()
    raw = str(((response.json().get("choices") or [{}])[0].get("message") or {}).get("content") or "")
    raw = re.sub(r"^```(?:json)?\s*|\s*```$", "", raw.strip())
    try:
        return json.loads(raw), settings.pmp_model_name
    except json.JSONDecodeError:
        return {}, settings.pmp_model_name


async def build_assisted_diagnosis(
    record: PetCtInterviewRecord,
    imaging: PathologyImagingGradeResult | None = None,
    *,
    use_tooluniverse: bool = True,
) -> PlatformAssistedDiagnosisResponse:
    base = build_diagnosis(record)
    grade = _grade(record, imaging)
    guideline_refs = [fragment_citation(x) for x in fragments_for_grade(grade)[:3]]
    research_context, tool_used = (await scientific_context(record, grade)) if use_tooluniverse else ([], False)
    model_context = _safe_context(record, imaging)
    model_out, model_name = await _call_pmp_model(model_context, guideline_refs)
    raw_differential = model_out.get("differential") if isinstance(model_out.get("differential"), list) else []
    differential = [DiagnosisProbability.model_validate(x) for x in raw_differential[:5] if isinstance(x, dict)] or base.probabilities
    rationale = [str(x) for x in model_out.get("rationale", []) if str(x).strip()] if isinstance(model_out.get("rationale"), list) else []
    rationale = rationale or base.evidence
    primary = str(model_out.get("primary_impression") or base.title)
    response = PlatformAssistedDiagnosisResponse(
        primary_impression=primary,
        differential=differential,
        rationale=rationale,
        guideline_refs=guideline_refs,
        research_context=research_context,
        safety_notes=[
            "AI 输出为辅助诊断草案，须由执业医生结合原始影像、病理和指南确认。",
            "ToolUniverse 仅接收去标识化科研检索词，不接收姓名、病历号或原始影像。",
            "医生反馈会被版本化留存，训练前仍需完成脱敏、伦理审批与数据质控。",
        ],
        model_name=model_name,
        model_version=settings.pmp_model_name if model_name != "rule-engine" else "local-evidence-v1",
        tooluniverse_used=tool_used,
        generated_at=_now(),
    )
    return response


