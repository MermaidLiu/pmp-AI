"""Platform smart dialogue via ReachAPI (OpenAI-compatible chat completions)."""

from __future__ import annotations

import json
import logging
from typing import Any

from app.models.domain import PetCtInterviewRecord
from app.models.platform_schemas import (
    AnalysisIntentBody,
    PathologyImagingGradeResult,
    PlatformDiagnosisResult,
)
from app.services.llm_gateway import chat_completions, is_llm_available, llm_chat_model, normalize_provider

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = """你是 PMP（腹膜假黏液瘤）多模态科研平台的智能助手，面向临床医生与科研人员。
请基于用户提供的病例数据、影像/病理信息与分析需求，给出专业、结构清晰的中文回答。

要求：
1. 先回应用户的具体分析需求，再给出诊断/鉴别诊断要点
2. 引用已提供的客观数据（SUV、病理分级、检验等），不要编造未给出的数值
3. 使用 Markdown 小标题与列表，语气专业但易懂
4. 若信息不足，明确说明还需补充哪些检查
5. 不做最终临床决策，必要时提醒结合病理与 MDT 讨论"""

FREE_SIMPLE_SYSTEM_PROMPT = """你是 PMP 专病平台的免费版助手。
当前为免费额度：仅做「问什么答什么」的简短问答，不基于长上下文、不编造未提供的病例细节。
用简洁中文直接回答用户问题；若问题需要完整病历/影像上下文，提醒开通 PRO（$199/月）以解锁完整智能对话与分析。"""


def is_deepseek_available() -> bool:
    """Backward-compatible alias: True when ReachAPI / OpenAI-compatible key is set."""
    return is_llm_available()


def _build_context(
    intent: AnalysisIntentBody,
    record: PetCtInterviewRecord,
    diagnosis: PlatformDiagnosisResult,
    fusion_summary: str,
    ingest_notes: list[str],
    pathology_imaging: PathologyImagingGradeResult | None,
) -> str:
    p = record.patient_base_info
    iv = record.interview_info
    rx = record.research_extensions
    gq = rx.global_quant

    payload: dict[str, Any] = {
        "user_question": intent.question,
        "user_notes": intent.notes,
        "patient": {
            "name": p.name,
            "age": p.age,
            "gender": p.gender,
            "department": p.department,
            "clinical_diagnosis": iv.clinical_diagnosis,
            "brief_history": iv.brief_medical_history,
        },
        "imaging": {
            "suv_max": gq.suv_max,
            "mtv": gq.mtv,
            "tlg": gq.tlg,
            "report_excerpt": (rx.pet_ct_report_narrative or rx.imaging_report_text or "")[:2000],
        },
        "pathology": {
            "grade": rx.pathology_grade,
            "confidence": rx.pathology_confidence,
            "evidence": rx.pathology_evidence,
        },
        "labs": rx.lab_snapshot,
        "structured_diagnosis": {
            "title": diagnosis.title,
            "confidence": diagnosis.confidence,
            "staging": diagnosis.staging,
            "differential": [{"label": x.label, "pct": x.pct} for x in diagnosis.probabilities],
            "evidence": diagnosis.evidence,
        },
        "fusion_summary": fusion_summary,
        "file_ingest_notes": ingest_notes,
    }

    if pathology_imaging and pathology_imaging.grade_label:
        payload["pathology_imaging_api"] = {
            "grade_label": pathology_imaging.grade_label,
            "confidence": pathology_imaging.confidence,
            "message": pathology_imaging.message,
            "dicom_count": pathology_imaging.dicom_count,
        }

    return json.dumps(payload, ensure_ascii=False, indent=2)


def format_fallback_reply(
    diagnosis: PlatformDiagnosisResult,
    intent_question: str,
    extra_notes: list[str],
) -> str:
    lines = [
        f"**首要怀疑：** {diagnosis.title}",
        f"置信度 {diagnosis.confidence * 100:.0f}% · {diagnosis.staging}",
        "",
        "**鉴别诊断：**",
        *[f"• {p.label}（{p.pct}%）" for p in diagnosis.probabilities],
        "",
        "**支持依据：**",
        *[f"• {e}" for e in diagnosis.evidence],
    ]
    for note in extra_notes:
        if note.strip():
            lines.append(f"\n> {note.strip()}")
    if intent_question:
        lines.extend(["", f"**按您的分析需求：** {intent_question}"])
    if not is_llm_available():
        lines.append(
            "\n> 提示：未配置 ReachAPI Key，当前为规则引擎结果。"
            "请在 backend/.env 设置 REACHAPI_API_KEY。"
        )
    return "\n".join(lines)


async def generate_chat_reply(
    intent: AnalysisIntentBody,
    record: PetCtInterviewRecord,
    diagnosis: PlatformDiagnosisResult,
    fusion_summary: str,
    ingest_notes: list[str],
    pathology_imaging: PathologyImagingGradeResult | None,
    *,
    simple_qa_only: bool = False,
    llm_provider: str | None = None,
) -> tuple[str, str, bool]:
    """Return (reply_text, model_name, used_llm)."""
    extra = [n for n in ingest_notes if n]
    if pathology_imaging and pathology_imaging.message:
        extra.append(pathology_imaging.message)

    provider = normalize_provider(llm_provider)
    model = llm_chat_model(provider)
    if not is_llm_available(provider):
        return format_fallback_reply(diagnosis, intent.question, extra), "rule-engine", False

    if simple_qa_only:
        q = (intent.question or "").strip() or "请介绍腹膜假粘液瘤（PMP）的基本概念"
        messages = [
            {"role": "system", "content": FREE_SIMPLE_SYSTEM_PROMPT},
            {"role": "user", "content": q},
        ]
        max_tokens = 1024
    else:
        user_content = (
            f"请根据以下 JSON 上下文回答用户问题。\n\n"
            f"```json\n{_build_context(intent, record, diagnosis, fusion_summary, ingest_notes, pathology_imaging)}\n```"
        )
        messages = [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": user_content},
        ]
        max_tokens = 2048

    try:
        content, model_id = await chat_completions(
            messages,
            provider=provider,
            temperature=0.3,
            max_tokens=max_tokens,
        )
        if simple_qa_only:
            content = (
                f"{content}\n\n"
                f"> 免费版说明：当前为简短问答（不计上下文）。完整病例联动分析请开通 PRO。"
            )
        return content, model_id, True
    except Exception as exc:
        logger.warning("ReachAPI chat failed, using fallback: %s", exc)
        fallback = format_fallback_reply(diagnosis, intent.question, extra + [f"大模型调用失败：{exc}"])
        return fallback, model, False
