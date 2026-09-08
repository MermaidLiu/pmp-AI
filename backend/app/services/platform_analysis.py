"""Platform chat analysis orchestration."""

from __future__ import annotations

import json
import tempfile
import uuid
from pathlib import Path
from typing import Any

from app.models.domain import PetCtInterviewRecord, PetCtResearchExtensions
from app.models.platform_schemas import AnalysisIntentBody, PathologyImagingGradeResult, PciScoreResult, PlatformChatAnalyzeResponse
from app.services.data_extractor import DataExtractor
from app.services.deepseek_chat import generate_chat_reply
from app.services.disease_classifier import apply_classification
from app.services.llm_gateway import normalize_provider
from app.services.multimodal_fusion import fuse_patient_multimodal
from app.services.pathology_imaging_client import predict_grade_from_imaging
from app.services.platform_adapters import build_diagnosis, merge_records
from app.services.suv_report_parser import merge_metrics_into_extensions


async def ingest_upload_bytes(filename: str, content: bytes) -> tuple[PetCtInterviewRecord | None, str]:
    """Parse a single uploaded file into PetCtInterviewRecord."""
    extractor = DataExtractor()
    suffix = Path(filename).suffix.lower() or ".bin"
    notes: list[str] = []

    try:
        if suffix == ".json":
            raw = json.loads(content.decode("utf-8"))
            rec = PetCtInterviewRecord.model_validate(raw)
            return rec, f"已解析 JSON：{filename}"
        if suffix == ".zip":
            records: list[PetCtInterviewRecord] = []
            for display_name, validated in extractor.iter_records_from_zip_bytes(content, filename):
                records.append(PetCtInterviewRecord.model_validate(validated))
            if records:
                return merge_records(records), f"ZIP 含 {len(records)} 条 DICOM/记录"
            return None, f"ZIP 未解析出有效记录：{filename}"
        if suffix == ".dcm":
            validated = extractor.extract_from_dicom_bytes(content, source_name=filename)
            return PetCtInterviewRecord.model_validate(validated), f"已解析 DICOM：{filename}"
        if suffix in (".csv", ".xlsx", ".xls"):
            validated = extractor.extract_from_tabular_bytes(content, filename)
            return PetCtInterviewRecord.model_validate(validated), f"已解析表格：{filename}"
        if suffix in (".docx", ".doc"):
            validated = extractor.extract_from_docx_bytes(content, source_name=filename)
            return PetCtInterviewRecord.model_validate(validated), f"已解析 Word：{filename}"

        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
            tmp.write(content)
            tmp_path = tmp.name
        try:
            validated = extractor.extract_from_image(tmp_path, source_name=filename)
        finally:
            Path(tmp_path).unlink(missing_ok=True)
        return PetCtInterviewRecord.model_validate(validated), f"已解析文档/图片：{filename}"
    except Exception as e:
        return None, f"{filename} 解析失败：{e}"


async def analyze_chat_uploads(
    file_items: list[tuple[str, bytes]],
    intent: AnalysisIntentBody,
    *,
    simple_qa_only: bool = False,
    llm_provider: str | None = None,
) -> PlatformChatAnalyzeResponse:
    records: list[PetCtInterviewRecord] = []
    ingest_notes: list[str] = []

    for name, content in file_items:
        rec, note = await ingest_upload_bytes(name, content)
        ingest_notes.append(note)
        if rec:
            records.append(rec)

    if not records:
        # Minimal shell record from intent only
        exam_id = f"PET{uuid.uuid4().hex[:10].upper()}"
        records.append(
            PetCtInterviewRecord.model_validate(
                {
                    "patient_base_info": {"exam_id": exam_id, "name": "待命名患者"},
                    "interview_info": {"clinical_diagnosis": intent.question or "待分析"},
                }
            )
        )
        ingest_notes.append("未上传可解析文件，已基于分析需求创建空壳病例。")

    merged = merge_records(records)
    narrative = (
        merged.research_extensions.pet_ct_report_narrative
        or merged.research_extensions.imaging_report_text
        or ""
    )
    if narrative:
        ext_dict = merged.research_extensions.model_dump(mode="json")
        merged_ext = PetCtResearchExtensions.model_validate(merge_metrics_into_extensions(ext_dict, narrative))
        merged = merged.model_copy(update={"research_extensions": merged_ext})

    merged = apply_classification(merged)
    fusion = fuse_patient_multimodal(merged)

    imaging_result = await predict_grade_from_imaging(file_items)
    merged = _apply_pathology_imaging_to_record(merged, imaging_result)

    diagnosis = build_diagnosis(merged, intent.question)
    if imaging_result.get("grade_label") and imaging_result.get("status") == "ok":
        conf = imaging_result.get("confidence")
        conf_txt = f"（置信度 {(conf * 100):.0f}%）" if conf is not None else ""
        diagnosis.evidence.insert(0, f"影像诊断分析：{imaging_result['grade_label']}{conf_txt}")

    pci_raw = imaging_result.get("pci")
    pathology_grade = PathologyImagingGradeResult(
        status=str(imaging_result.get("status", "")),
        message=str(imaging_result.get("message", "")),
        grade_label=str(imaging_result.get("grade_label", "")),
        confidence=imaging_result.get("confidence"),
        result_image_base64=str(imaging_result.get("result_image_base64", "")),
        dicom_count=int(imaging_result.get("dicom_count") or 0),
        pci=PciScoreResult.model_validate(pci_raw) if isinstance(pci_raw, dict) else None,
        raw=imaging_result.get("raw") if isinstance(imaging_result.get("raw"), dict) else {},
    )

    provider = normalize_provider(llm_provider)
    ai_reply, llm_model, llm_used = await generate_chat_reply(
        intent=intent,
        record=merged,
        diagnosis=diagnosis,
        fusion_summary=str(fusion.get("fusion_summary", "")),
        ingest_notes=ingest_notes,
        pathology_imaging=pathology_grade,
        simple_qa_only=simple_qa_only,
        llm_provider=provider,
    )

    return PlatformChatAnalyzeResponse(
        diagnosis=diagnosis,
        record=merged,
        fusion_summary=str(fusion.get("fusion_summary", "")),
        ingest_notes=ingest_notes,
        pathology_imaging_status=pathology_grade.message,
        pathology_imaging=pathology_grade,
        ai_reply=ai_reply,
        llm_model=llm_model,
        llm_used=llm_used,
        llm_provider=provider,
    )


def _apply_pathology_imaging_to_record(
    record: PetCtInterviewRecord,
    imaging_result: dict[str, Any],
) -> PetCtInterviewRecord:
    if imaging_result.get("status") not in ("ok",):
        return record
    from app.services.pathology_grader import infer_histologic_grade_label

    pci_block = imaging_result.get("pci")
    if not isinstance(pci_block, dict):
        raw = imaging_result.get("raw") if isinstance(imaging_result.get("raw"), dict) else {}
        pci_block = raw.get("pci") if isinstance(raw.get("pci"), dict) else {}
    pci_conclusion = str((pci_block or {}).get("conclusion") or "")
    grade = infer_histologic_grade_label(
        pci_conclusion,
        str(imaging_result.get("message") or ""),
        str(imaging_result.get("grade_label") or ""),
    )
    if grade == "未确定" and not imaging_result.get("confidence"):
        return record
    rx = record.research_extensions.model_copy(deep=True)
    if grade in ("高级别", "低级别", "未确定"):
        rx.pathology_grade = grade
    conf = imaging_result.get("confidence")
    if conf is not None:
        rx.pathology_confidence = float(conf)
    note = imaging_result.get("message")
    if note:
        evidence = list(rx.pathology_evidence or [])
        if str(note) not in evidence:
            evidence.append(str(note))
        rx.pathology_evidence = evidence
    return record.model_copy(update={"research_extensions": rx})
