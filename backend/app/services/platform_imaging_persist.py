"""Persist pathology imaging analysis results into the platform case database."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlalchemy.orm import Session

from app.models.domain import PetCtInterviewRecord
from app.repositories import pet_ct_case
from app.services.pathology_imaging_client import collect_dicom_files
from app.services.platform_analysis import _apply_pathology_imaging_to_record, ingest_upload_bytes


async def persist_pathology_imaging_result(
    db: Session,
    imaging_result: dict[str, Any],
    file_items: list[tuple[str, bytes]] | None = None,
    uploaded_file_names: list[str] | None = None,
    clinical_record: PetCtInterviewRecord | None = None,
) -> PetCtInterviewRecord | None:
    """Save imaging diagnosis analysis to pathology + imaging databases."""
    if imaging_result.get("status") != "ok":
        return None

    file_items = file_items or []
    record: PetCtInterviewRecord | None = None
    dicom_files = collect_dicom_files(file_items) if file_items else []

    # Prefer workflow clinical fields (name / labs / diagnosis) when the UI sends them.
    if clinical_record is not None:
        record = clinical_record.model_copy(deep=True)
        exam_hint = (
            str(imaging_result.get("exam_id") or "").strip()
            or (record.patient_base_info.exam_id or "").strip()
            or f"IMG{datetime.now().strftime('%Y%m%d%H%M%S')}"
        )
        if not record.patient_base_info.exam_id:
            record = record.model_copy(
                update={
                    "patient_base_info": record.patient_base_info.model_copy(
                        update={"exam_id": exam_hint}
                    )
                }
            )

    if record is None and dicom_files:
        first_name, first_content = dicom_files[0]
        parsed, _ = await ingest_upload_bytes(first_name, first_content)
        if parsed:
            record = parsed

    if record is None:
        exam_id = str(imaging_result.get("exam_id") or "").strip() or f"IMG{datetime.now().strftime('%Y%m%d%H%M%S')}"
        record = PetCtInterviewRecord.model_validate(
            {
                "patient_base_info": {
                    "exam_id": exam_id,
                    "name": "DICOM 上传病例",
                    "exam_item": "DICOM 影像诊断分析",
                    "source": "工作台智能分析",
                },
            }
        )

    record = _apply_pathology_imaging_to_record(record, imaging_result)
    rx = record.research_extensions.model_copy(deep=True)

    names = uploaded_file_names or [name for name, _ in file_items]
    dicom_count = int(imaging_result.get("dicom_count") or len(dicom_files) or len(names) or 0)
    batch_label = names[0] if len(names) == 1 else f"{len(names)} 个上传文件"

    uploads = [
        u
        for u in (rx.document_uploads or [])
        if not (isinstance(u, dict) and u.get("source") == "pathology_imaging_api")
    ]
    uploads.append(
        {
            "filename": batch_label,
            "kind": "dicom",
            "dicom_count": dicom_count,
            "file_count": len(names) or 1,
            "source": "pathology_imaging_api",
            "has_annotated_image": bool(imaging_result.get("result_image_base64")),
        }
    )
    rx.document_uploads = uploads

    grade = str(imaging_result.get("grade_label") or "").strip()
    conf = imaging_result.get("confidence")
    report_lines = ["【影像诊断分析】", f"分级结果：{grade or '—'}"]
    if conf is not None:
        try:
            report_lines.append(f"置信度：{float(conf) * 100:.0f}%")
        except (TypeError, ValueError):
            pass
    if imaging_result.get("message"):
        report_lines.append(str(imaging_result["message"]))
    report_lines.append(f"DICOM 数量：{dicom_count} 张")
    if imaging_result.get("result_image_base64"):
        report_lines.append("含 AI 标注可视化图像")
    narrative = "\n".join(report_lines)

    if not rx.imaging_report_text.strip():
        rx.imaging_report_text = narrative
    if not rx.pet_ct_report_narrative.strip():
        rx.pet_ct_report_narrative = narrative

    record = record.model_copy(update={"research_extensions": rx})
    if not record.patient_base_info.exam_id:
        record.patient_base_info.exam_id = f"IMG{datetime.now().strftime('%Y%m%d%H%M%S')}"

    pet_ct_case.upsert_case(db, record)
    return record


async def persist_pathology_imaging_case(
    db: Session,
    file_items: list[tuple[str, bytes]],
    imaging_result: dict[str, Any],
) -> PetCtInterviewRecord | None:
    return await persist_pathology_imaging_result(db, imaging_result, file_items=file_items)
