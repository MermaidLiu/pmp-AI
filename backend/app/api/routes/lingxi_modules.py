"""六大核心模块 API：病历录入、多模态、分病种、随访、科研分析、成果转化（与前端工作台顺序一致）。"""

from __future__ import annotations

import json
import tempfile
from pathlib import Path
from typing import Any

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models.domain import (
    AgentExtendedRunBody,
    BatchIngestResultItem,
    ClinicalCorrelationBody,
    CohortFilterBody,
    FollowupCompareBody,
    PetCtInterviewRecord,
    PetCtResearchExtensions,
    PptOutlineInput,
)
from app.repositories import cohort as cohort_repo
from app.repositories import pet_ct_case
from app.services.data_extractor import DataExtractor
from app.services.disease_classifier import apply_classification
from app.services.followup_compare import compare_exams
from app.services.multimodal_fusion import fuse_patient_multimodal
from app.services.output_generator import (
    build_difficult_case_review,
    build_ppt_outline,
    build_research_report_markdown,
)
from app.services.pathology_grader import (
    analyze_case,
    batch_cohort_from_dicom_records,
    correlate_clinical_indicators,
    recommend_literature,
)
from app.services.pathology_trainer import (
    CSV_PATH,
    export_training_csv,
    get_training_status,
    train_pathology_classifier,
)
from app.services.suv_report_parser import merge_metrics_into_extensions

router = APIRouter()


class ReportExportBody(BaseModel):
    record: PetCtInterviewRecord
    extra: dict[str, Any] = Field(default_factory=dict)


@router.post("/ingestion/batch", response_model=list[BatchIngestResultItem])
async def module_ingestion_batch(
    files: list[UploadFile] = File(...),
    persist: bool = False,
    db: Session = Depends(get_db),
) -> list[BatchIngestResultItem]:
    """1. 病历与 PET-CT 录入：批量上传图片 / JSON / DICOM（.dcm）或含 .dcm 的 ZIP，OCR + 结构化校验，可选直接入库。"""
    extractor = DataExtractor()
    out: list[BatchIngestResultItem] = []

    def _append_ok(display_name: str, rec: PetCtInterviewRecord) -> None:
        if persist:
            pet_ct_case.upsert_case(db, rec)
        out.append(BatchIngestResultItem(filename=display_name, ok=True, parsed=rec.model_dump(mode="json")))

    for uf in files:
        name = uf.filename or "upload"
        suffix = Path(name).suffix or ".png"
        try:
            content = await uf.read()
            if suffix.lower() == ".json":
                raw = json.loads(content.decode("utf-8"))
                rec = PetCtInterviewRecord.model_validate(raw)
                _append_ok(name, rec)
            elif suffix.lower() == ".zip":
                for display_name, validated in extractor.iter_records_from_zip_bytes(content, name):
                    _append_ok(display_name, PetCtInterviewRecord.model_validate(validated))
            elif suffix.lower() == ".dcm":
                validated = extractor.extract_from_dicom_bytes(content, source_name=name)
                _append_ok(name, PetCtInterviewRecord.model_validate(validated))
            elif suffix.lower() in (".csv", ".xlsx", ".xls"):
                validated = extractor.extract_from_tabular_bytes(content, name)
                _append_ok(name, PetCtInterviewRecord.model_validate(validated))
            elif suffix.lower() in (".docx",):
                validated = extractor.extract_from_docx_bytes(content, source_name=name)
                _append_ok(name, PetCtInterviewRecord.model_validate(validated))
            else:
                with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
                    tmp.write(content)
                    tmp_path = tmp.name
                try:
                    validated = extractor.extract_from_image(tmp_path, source_name=name)
                finally:
                    Path(tmp_path).unlink(missing_ok=True)
                rec = PetCtInterviewRecord.model_validate(validated)
                _append_ok(name, rec)
        except Exception as e:
            out.append(BatchIngestResultItem(filename=name, ok=False, detail=str(e)))
    return out


@router.post("/disease/classify")
def module_disease_classify(
    body: PetCtInterviewRecord,
    parse_report_metrics: bool = True,
    persist: bool = False,
    db: Session = Depends(get_db),
) -> dict:
    """2. 病种与 PET-CT 分型：规则分型 + 可选从报告文本解析 SUV/MTV/TLG。"""
    rec = body
    narrative = (
        rec.research_extensions.pet_ct_report_narrative
        or rec.research_extensions.imaging_report_text
        or ""
    )
    if parse_report_metrics and narrative:
        ext_dict = rec.research_extensions.model_dump(mode="json")
        merged = merge_metrics_into_extensions(ext_dict, narrative)
        rec = rec.model_copy(update={"research_extensions": PetCtResearchExtensions.model_validate(merged)})
    typed = apply_classification(rec)
    if persist:
        pet_ct_case.upsert_case(db, typed)
    return {"record": typed.model_dump(mode="json")}


@router.post("/disease/cohort-summary")
def module_disease_cohort_summary(filters: CohortFilterBody, db: Session = Depends(get_db)) -> dict:
    summary = cohort_repo.cohort_summary(db, filters)
    summary["approx_total"] = cohort_repo.count_estimate(db, filters)
    return summary


@router.post("/agent/run-extended")
def module_agent_extended(body: AgentExtendedRunBody) -> dict:
    """3. 科研智能体：选题、蒸馏、统计、队列提示、论文骨架（LangChain 工具链）。"""
    from app.services.research_agent import ResearchAgent

    agent = ResearchAgent()
    payload = body.record.model_dump(mode="json")
    parts = agent.run_extended(payload, body.research_topic, body.tasks)
    return {"parts": parts}


@router.post("/multimodal/fuse")
def module_multimodal_fuse(body: PetCtInterviewRecord) -> dict:
    """4. PET-CT 多模态分析：影像定量 + 病历 + 检验融合，返回可视化载荷。"""
    return fuse_patient_multimodal(body)


@router.post("/cohort/query")
def module_cohort_query(filters: CohortFilterBody, db: Session = Depends(get_db)) -> dict:
    """5. 患者队列：条件筛选，返回结构化病例列表。"""
    rows = cohort_repo.query_cases(db, filters)
    return {
        "n": len(rows),
        "records": [pet_ct_case.orm_to_record(r).model_dump(mode="json") for r in rows],
    }


@router.post("/cohort/followup-compare")
def module_followup_compare(body: FollowupCompareBody, db: Session = Depends(get_db)) -> dict:
    """多次 PET-CT 对比（需已入库 exam_id）。"""
    return compare_exams(db, body.exam_id_baseline, body.exam_id_followup)


@router.post("/outputs/report")
def module_outputs_report(body: ReportExportBody) -> dict:
    """6. 成果转化：Markdown 报告。"""
    md = build_research_report_markdown(body.record, body.extra)
    return {"format": "markdown", "content": md}


@router.post("/outputs/ppt-outline")
def module_outputs_ppt(body: PptOutlineInput) -> dict:
    payload = body.model_dump(mode="json")
    topic = payload.pop("research_topic", None)
    record = PetCtInterviewRecord.model_validate(payload)
    return {"slides": build_ppt_outline(record, topic)}


@router.post("/outputs/case-review")
def module_outputs_review(body: PetCtInterviewRecord) -> dict:
    return build_difficult_case_review(body)


@router.post("/pathology/analyze")
def module_pathology_analyze(body: PetCtInterviewRecord) -> dict:
    """诊断结果：影像 + 临床 → 诊断推断、判定、治疗推荐与文献。"""
    result = analyze_case(body)
    return result.model_dump(mode="json")


@router.post("/pathology/batch-cohort")
async def module_pathology_batch_cohort(
    files: list[UploadFile] = File(...),
) -> dict:
    """批量上传 DICOM/ZIP，统计高级别 / 低级别队列分布并纳入知识库。"""
    extractor = DataExtractor()
    records: list[dict[str, Any]] = []
    filenames: list[str] = []

    for uf in files:
        name = uf.filename or "upload"
        suffix = Path(name).suffix or ".png"
        content = await uf.read()
        try:
            if suffix.lower() == ".zip":
                for display_name, validated in extractor.iter_records_from_zip_bytes(content, name):
                    records.append(validated)
                    filenames.append(display_name)
            elif suffix.lower() == ".dcm":
                validated = extractor.extract_from_dicom_bytes(content, source_name=name)
                records.append(validated)
                filenames.append(name)
            elif suffix.lower() == ".json":
                raw = json.loads(content.decode("utf-8"))
                records.append(raw)
                filenames.append(name)
        except Exception:
            continue

    result = batch_cohort_from_dicom_records(records, filenames)
    return result.model_dump(mode="json")


@router.post("/pathology/correlation")
def module_pathology_correlation(body: ClinicalCorrelationBody) -> dict:
    """医生输入临床指标 → 相关性因素与文献推荐。"""
    result = correlate_clinical_indicators(body.indicators, body.disease_context)
    return result.model_dump(mode="json")


@router.get("/pathology/literature")
def module_pathology_literature(grade_label: str = "通用", topic: str = "") -> dict:
    """按诊断结果与主题推荐文献。"""
    refs = recommend_literature(grade_label, topic)
    return {"grade_label": grade_label, "topic": topic, "literature": refs}


@router.get("/training/status")
def module_training_status(db: Session = Depends(get_db)) -> dict:
    """模型训练：数据库病例数、CSV/模型文件状态、上次训练指标。"""
    return get_training_status(db)


@router.post("/training/export")
def module_training_export(db: Session = Depends(get_db)) -> dict:
    """从已入库病例导出训练 CSV（含推断的高/低级别标签）。"""
    try:
        return export_training_csv(db)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=str(e)) from e


@router.post("/training/run")
def module_training_run(db: Session = Depends(get_db)) -> dict:
    """训练病理分级 XGBoost 模型并保存到 models/。"""
    try:
        return train_pathology_classifier(db)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=str(e)) from e


@router.get("/training/download-csv")
def module_training_download_csv() -> FileResponse:
    """下载最近一次导出的训练 CSV。"""
    if not CSV_PATH.is_file():
        raise HTTPException(status_code=404, detail="训练 CSV 不存在，请先导出训练数据")
    return FileResponse(
        path=str(CSV_PATH),
        filename="pathology_training.csv",
        media_type="text/csv",
    )
