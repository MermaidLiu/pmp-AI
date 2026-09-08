"""Platform UI REST API."""

from __future__ import annotations

import asyncio
from typing import Any

from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, Header, HTTPException, UploadFile
from fastapi.responses import FileResponse, Response
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import get_db
from app.models.domain import PetCtInterviewRecord
from app.models.platform_schemas import (
    AnalysisIntentBody,
    AnnotationDatasetSummary,
    CarePathwayAnalyzeBody,
    CarePathwayAnalyzeResponse,
    PathologyImagingGradeResult,
    PathologySaveRequest,
    PlatformChatAnalyzeResponse,
    PlatformAssistedDiagnosisBody,
    PlatformAssistedDiagnosisResponse,
    PhysicianFeedbackBody,
    PhysicianFeedbackResponse,
    OmicsReadinessResponse,
    ClinicalDatasetAnalyzeBody,
    ClinicalDatasetAnalyzeResponse,
    PlatformDiagnosisResult,
    PciScoreResult,
    PlatformImagingRow,
    PlatformKnowledgeGenerateBody,
    PlatformKnowledgeGenerateResponse,
    PlatformKnowledgeSearchBody,
    PlatformKnowledgeSearchResponse,
    PlatformPathologyRow,
    PlatformPatientRow,
    PlatformPatientUpdateRequest,
    PlatformPptGenerateBody,
    PlatformPptGenerateResponse,
    PlatformPublicationTopicsResponse,
    PlatformResearchRunBody,
    PlatformResearchRunResponse,
    PlatformSaveResponse,
)
from app.repositories import pet_ct_case
from app.services.billing_quota import consume_llm_quota, require_llm_quota
from app.services.pathology_grade_cache import (
    compute_upload_fingerprint,
    load_grade_cache,
    save_grade_cache,
    slim_result_for_cache,
)
from app.services.pathology_imaging_client import normalize_ct_api_payload, predict_grade_from_imaging
from app.services.platform_adapters import (
    build_diagnosis,
    build_platform_overview_stats,
    record_to_imaging_row,
    record_to_pathology_row,
    record_to_patient_row,
)
from app.services.platform_imaging_persist import persist_pathology_imaging_result
from app.services.platform_annotation_dataset import (
    build_annotation_zip,
    list_annotation_datasets,
    load_annotation_manifest,
    save_annotation_dataset_from_api,
)
from app.services.pci_scoring_client import (
    predict_pci_after_segmentation,
    predict_pci_score,
    try_parse_embedded_pci,
    try_parse_pci_from_ct_slices,
    try_parse_pci_from_manifest,
)
from app.services.pathology_slice_store import (
    build_slice_manifest,
    first_annotated_slice_base64,
    get_slice_image_bytes,
    load_slice_manifest,
    save_slice_store,
)
from app.services.platform_analysis import analyze_chat_uploads
from app.services.platform_knowledge import generate_document, search_knowledge
from app.services.platform_research import run_research_task
from app.services.platform_research_outputs import generate_publication_topics, generate_ppt_content

router = APIRouter()


@router.post("/assisted-diagnosis", response_model=PlatformAssistedDiagnosisResponse)
async def platform_assisted_diagnosis(
    body: PlatformAssistedDiagnosisBody,
    db: Session = Depends(get_db),
) -> PlatformAssistedDiagnosisResponse:
    """Guideline-grounded draft; image segmentation/PCI remains on the existing route."""
    from app.services.ai_assisted_diagnosis import build_assisted_diagnosis

    result = await build_assisted_diagnosis(
        body.record, body.imaging, use_tooluniverse=body.use_tooluniverse
    )
    # Do not create a case implicitly, but preserve a reproducible AI-draft
    # snapshot whenever the caller is analysing an already persisted case.
    exam_id = body.record.patient_base_info.exam_id.strip()
    if exam_id:
        row = pet_ct_case.get_by_exam_id(db, exam_id)
        if row is not None:
            record = pet_ct_case.orm_to_record(row)
            rx = record.research_extensions.model_copy(deep=True)
            rx.ai_assisted_diagnosis = result.model_dump(mode="json")
            pet_ct_case.upsert_case(db, record.model_copy(update={"research_extensions": rx}))
    return result


@router.post("/assisted-diagnosis/feedback", response_model=PhysicianFeedbackResponse)
def platform_assisted_diagnosis_feedback(
    body: PhysicianFeedbackBody, db: Session = Depends(get_db)
) -> PhysicianFeedbackResponse:
    """Persist clinician confirmation as an append-only, auditable feedback event."""
    from datetime import datetime, timezone

    row = pet_ct_case.get_by_exam_id(db, body.exam_id.strip())
    if row is None:
        raise HTTPException(status_code=404, detail="病例不存在，请先将本例保存至患者数据库")
    record = pet_ct_case.orm_to_record(row)
    rx = record.research_extensions.model_copy(deep=True)
    feedback = list(rx.physician_feedback or [])
    feedback.append({
        "diagnosis": body.diagnosis.strip(),
        "agreement_score": body.agreement_score,
        "final_grade": body.final_grade.strip(),
        "comments": body.comments.strip(),
        "physician_name": body.physician_name.strip(),
        "created_at": datetime.now(timezone.utc).replace(microsecond=0).isoformat(),
        "schema_version": "feedback-v1",
    })
    rx.physician_feedback = feedback
    if body.final_grade.strip():
        rx.pathology_grade = body.final_grade.strip()
    updated = record.model_copy(update={"research_extensions": rx})
    pet_ct_case.upsert_case(db, updated)
    labelled = sum(1 for item in feedback if item.get("diagnosis") and int(item.get("agreement_score") or 0) >= 1)
    return PhysicianFeedbackResponse(
        ok=True, exam_id=body.exam_id.strip(), feedback_count=len(feedback), training_ready_count=labelled
    )


@router.get("/omics/readiness", response_model=OmicsReadinessResponse)
def platform_omics_readiness(db: Session = Depends(get_db)) -> OmicsReadinessResponse:
    """Cohort gate before enabling model-training style omics analyses."""
    records = [pet_ct_case.orm_to_record(x) for x in pet_ct_case.list_all(db, limit=5000)]
    clinical = len(records)
    imaging = sum(1 for r in records if r.research_extensions.document_uploads or r.research_extensions.lesions)
    genomic = sum(
        1 for r in records
        if any(k.lower() in {"kras", "gans", "braf", "egfr", "gene", "分子"} for k in (r.research_extensions.lab_snapshot or {}))
    )
    labelled = sum(len(r.research_extensions.physician_feedback or []) for r in records)
    minimum = 50
    def module(n: int, label: str) -> dict[str, Any]:
        return {
            "label": label, "case_count": n, "ready": n >= minimum,
            "remaining": max(0, minimum - n),
            "next_step": "可进入特征质控、训练/验证集划分及锁库分析" if n >= minimum else f"还需积累 {max(0, minimum-n)} 例完成质控的队列数据",
        }
    return OmicsReadinessResponse(
        clinical_cases=clinical, imaging_cases=imaging, genomic_cases=genomic,
        physician_labeled_cases=labelled, minimum_cases=minimum,
        modules={
            "clinical_omics": module(clinical, "临床组学"),
            "radiomics": module(imaging, "影像组学"),
            "genomics": module(genomic, "基因组学"),
        },
    )


@router.post("/chat/analyze", response_model=PlatformChatAnalyzeResponse)
async def platform_chat_analyze(
    files: list[UploadFile] = File(default=[]),
    question: str = Form(""),
    variables: str = Form(""),
    outcome: str = Form(""),
    notes: str = Form(""),
    llm_provider: str = Form(""),
    db: Session = Depends(get_db),
    authorization: str | None = Header(default=None),
    x_guest_id: str | None = Header(default=None, alias="X-Guest-Id"),
) -> PlatformChatAnalyzeResponse:
    user, guest, snap = require_llm_quota(db, authorization=authorization, guest_id=x_guest_id)
    intent = AnalysisIntentBody(question=question, variables=variables, outcome=outcome, notes=notes)
    file_items: list[tuple[str, bytes]] = []
    for uf in files:
        content = await uf.read()
        file_items.append((uf.filename or "upload", content))
    result = await analyze_chat_uploads(
        file_items,
        intent,
        simple_qa_only=bool(snap.get("simple_qa_only")),
        llm_provider=llm_provider,
    )
    if result.llm_used:
        consume_llm_quota(db, user=user, guest=guest)
    return result


@router.post("/chat/save", response_model=PlatformSaveResponse)
def platform_chat_save(body: PetCtInterviewRecord, db: Session = Depends(get_db)) -> PlatformSaveResponse:
    if not body.patient_base_info.exam_id:
        raise HTTPException(status_code=400, detail="exam_id 不能为空")
    pet_ct_case.upsert_case(db, body)
    patient = record_to_patient_row(body)
    return PlatformSaveResponse(ok=True, patient=patient, exam_id=body.patient_base_info.exam_id)


@router.get("/diagnosis/demo", response_model=PlatformDiagnosisResult)
def platform_diagnosis_demo(db: Session = Depends(get_db)) -> PlatformDiagnosisResult:
    rows = pet_ct_case.list_all(db, limit=1)
    if not rows:
        raise HTTPException(status_code=404, detail="暂无病例，请先完成智能对话分析并入库")
    rec = pet_ct_case.orm_to_record(rows[0])
    return build_diagnosis(rec)


@router.get("/patients", response_model=list[PlatformPatientRow])
def platform_list_patients(
    keyword: str = "",
    grade_label: str = "",
    follow_up: bool = False,
    db: Session = Depends(get_db),
) -> list[PlatformPatientRow]:
    rows = pet_ct_case.list_all(db, limit=500)
    patients = [record_to_patient_row(pet_ct_case.orm_to_record(r)) for r in rows]
    g = grade_label.strip()
    if g and g not in ("全部", "all", "—"):
        patients = [p for p in patients if p.gradeLabel == g]
    if follow_up:
        patients = [p for p in patients if p.followUpStatus == "随访中"]
    k = keyword.strip().lower()
    if not k:
        return patients
    return [
        p
        for p in patients
        if k in p.id.lower()
        or k in p.name.lower()
        or k in (p.diagnosis or "").lower()
        or k in (p.department or "").lower()
        or k in (p.clinicalSummary or "").lower()
        or k in (p.pathologySummary or "").lower()
        or k in (p.imagingSummary or "").lower()
        or k in (p.treatmentMethod or "").lower()
        or k in (p.surgeryNumber or "").lower()
        or k in (p.ivChemotherapy or "").lower()
        or k in (p.ccScore or "").lower()
        or (p.pciScore is not None and k in str(p.pciScore))
    ]


@router.get("/imaging", response_model=list[PlatformImagingRow])
def platform_list_imaging(
    keyword: str = "",
    modality: str = "",
    db: Session = Depends(get_db),
) -> list[PlatformImagingRow]:
    rows = pet_ct_case.list_all(db, limit=500)
    imaging: list[PlatformImagingRow] = []
    for r in rows:
        item = record_to_imaging_row(pet_ct_case.orm_to_record(r))
        if item:
            imaging.append(item)
    k = keyword.strip().lower()
    m = modality.strip()
    out = imaging
    if k:
        out = [
            x
            for x in out
            if k in x.id.lower()
            or k in x.patientName.lower()
            or k in x.patientId.lower()
            or k in x.reportSummary.lower()
        ]
    if m:
        if m == "MR":
            out = [x for x in out if x.modality in ("MR", "MRI")]
        else:
            out = [x for x in out if x.modality == m]
    return out


@router.get("/imaging/{exam_id}", response_model=PlatformImagingRow)
def platform_get_imaging(exam_id: str, db: Session = Depends(get_db)) -> PlatformImagingRow:
    row = pet_ct_case.get_by_exam_id(db, exam_id)
    if row is None:
        raise HTTPException(status_code=404, detail="影像记录不存在")
    item = record_to_imaging_row(pet_ct_case.orm_to_record(row))
    if item is None:
        raise HTTPException(status_code=404, detail="该病例无影像数据")
    return item


@router.post("/research/run", response_model=PlatformResearchRunResponse)
async def platform_research_run(
    body: PlatformResearchRunBody,
    db: Session = Depends(get_db),
) -> PlatformResearchRunResponse:
    return await run_research_task(db, body)


@router.post("/pathology/grade", response_model=PathologyImagingGradeResult)
async def platform_pathology_grade(
    background_tasks: BackgroundTasks,
    files: list[UploadFile] = File(...),
    return_base64: bool = Form(True),
    save_to_db: bool = Form(False),
    save_annotation_dataset: bool = Form(False),
    run_pci: bool = Form(True),
    dcm_path: str = Form(""),
    use_cache: bool = Form(True),
    force_refresh: bool = Form(False),
    db: Session = Depends(get_db),
) -> PathologyImagingGradeResult:
    """Upload DICOM → CT merged API (segmentation + PCI in one call). Cached by file fingerprint."""
    import time

    t_start = time.perf_counter()
    file_items: list[tuple[str, bytes]] = []
    upload_names: list[str] = []
    for uf in files:
        name = uf.filename or "upload.dcm"
        upload_names.append(name)
        file_items.append((name, await uf.read()))
    t_read = time.perf_counter()

    fingerprint = compute_upload_fingerprint(file_items)
    t_fp = time.perf_counter()
    if use_cache and not force_refresh and settings.pathology_grade_cache_enabled:
        cached = load_grade_cache(fingerprint)
        if cached:
            cached = dict(cached)
            msg = str(cached.get("message") or "")
            if "缓存" not in msg:
                cached["message"] = "已使用缓存结果"
            if isinstance(cached.get("raw"), dict):
                raw_enriched = {**cached["raw"], "cache_hit": True, "fingerprint": fingerprint}
                if not raw_enriched.get("slice_manifest"):
                    disk_manifest = load_slice_manifest(fingerprint)
                    if disk_manifest:
                        raw_enriched["slice_manifest"] = disk_manifest
                        raw_enriched["slice_count"] = len(disk_manifest)
                cached["raw"] = raw_enriched
            return PathologyImagingGradeResult.model_validate(cached)

    raw = await predict_grade_from_imaging(file_items, return_base64=return_base64, run_pci=run_pci)
    t_ct = time.perf_counter()
    api_payload = raw.pop("_api_payload", None)
    if isinstance(api_payload, dict):
        api_payload = normalize_ct_api_payload(api_payload)
    raw_payload = raw.get("raw") if isinstance(raw.get("raw"), dict) else {}

    exam_id = ""
    saved = False
    if save_to_db and raw.get("status") == "ok":
        try:
            saved_record = await persist_pathology_imaging_result(db, raw, file_items=file_items)
            if saved_record is not None:
                exam_id = saved_record.patient_base_info.exam_id
                saved = True
        except Exception:
            saved = False

    annotation_dataset_id = ""
    annotation_slice_count = 0
    annotation_slices_with_mask = 0
    if save_annotation_dataset and raw.get("status") == "ok" and isinstance(api_payload, dict):
        try:
            ann = save_annotation_dataset_from_api(
                api_payload,
                file_items,
                exam_id=exam_id,
                session_id=str(api_payload.get("sessionId") or ""),
            )
            annotation_dataset_id = str(ann.get("dataset_id") or "")
            annotation_slice_count = int(ann.get("slice_count") or 0)
            annotation_slices_with_mask = int(ann.get("slices_with_mask") or 0)
            extra = (
                f"已保存 {annotation_slice_count} 层标注数据（{annotation_slices_with_mask} 层含病灶 mask）"
            )
            raw["message"] = f"{raw.get('message', '')} · {extra}".strip(" ·")
            if isinstance(raw_payload, dict):
                raw_payload["annotation_dataset"] = ann
        except Exception as exc:
            err = f"标注数据集保存失败：{exc}"
            raw["message"] = f"{raw.get('message', '')} · {err}".strip(" ·")

    pci_result: dict[str, Any] | None = raw.pop("pci", None) if isinstance(raw.get("pci"), dict) else None
    segmentation_done = raw.get("status") == "ok" and isinstance(api_payload, dict)
    # 合并接口 runPci=true：只解析响应内 pci，不再二次调用 genpci（避免额外 5+ 分钟）
    if run_pci and segmentation_done and not pci_result and isinstance(api_payload, dict):
        pci_result = try_parse_embedded_pci(api_payload)
        if not pci_result or pci_result.get("pci_score") is None:
            slice_pci = try_parse_pci_from_ct_slices(api_payload)
            if slice_pci:
                pci_result = slice_pci
        if pci_result and pci_result.get("status") == "ok":
            if pci_result.get("pci_score") is not None and not raw.get("grade_label"):
                raw["grade_label"] = f"PCI {pci_result['pci_score']}/36"
        elif not pci_result:
            pci_result = {
                "status": "pending",
                "message": "CT 合并接口未返回 pci 对象，请确认 CT 服务 runPci=true 且响应含 pciScore",
                "pci_score": None,
                "regions": [],
                "raw": {"pci_merged_api": True},
            }
            raw["message"] = f"{raw.get('message', '')} · {pci_result['message']}".strip(" ·")
    elif pci_result and isinstance(raw_payload, dict):
        if pci_result.get("pci_score") is not None and not raw.get("grade_label"):
            raw["grade_label"] = f"PCI {pci_result['pci_score']}/36"

    if isinstance(raw_payload, dict) and pci_result:
        raw_payload["pci"] = pci_result
        raw_payload["pci_paths_tried"] = pci_result.get("paths_tried", [])
        raw_payload["pci_merged_api"] = bool(raw_payload.get("pci_merged_api") or pci_result.get("source") == "ct_merged_pci")
        if api_payload and api_payload.get("sessionId"):
            raw_payload["sessionId"] = api_payload.get("sessionId")

    if isinstance(raw_payload, dict):
        raw_payload["timing_seconds"] = {
            "read": round(t_read - t_start, 2),
            "fingerprint": round(t_fp - t_read, 2),
            "ct_api": round(t_ct - t_fp, 2),
            "total": round(t_ct - t_start, 2),
        }
        raw_payload["fingerprint"] = fingerprint
        if raw.get("status") == "ok":
            if isinstance(api_payload, dict):
                manifest = build_slice_manifest(api_payload)
                if manifest:
                    raw_payload["slice_manifest"] = manifest
                    raw_payload["slice_count"] = len(manifest)
                    # Write PNGs before responding — frontend loads slices immediately after grade returns.
                    await asyncio.to_thread(save_slice_store, fingerprint, api_payload)
                    if not raw.get("result_image_base64"):
                        preview_b64 = first_annotated_slice_base64(api_payload)
                        if preview_b64:
                            raw["result_image_base64"] = preview_b64
            elif not raw_payload.get("slice_manifest"):
                disk_manifest = load_slice_manifest(fingerprint)
                if disk_manifest:
                    raw_payload["slice_manifest"] = disk_manifest
                    raw_payload["slice_count"] = len(disk_manifest)

    response = PathologyImagingGradeResult(
        status=str(raw.get("status", "")),
        message=str(raw.get("message", "")),
        grade_label=str(raw.get("grade_label", "")),
        confidence=raw.get("confidence"),
        result_image_base64=str(raw.get("result_image_base64", "")),
        dicom_count=int(raw.get("dicom_count") or 0),
        raw=raw_payload,
        exam_id=exam_id,
        saved=saved,
        annotation_dataset_id=annotation_dataset_id,
        annotation_slice_count=annotation_slice_count,
        annotation_slices_with_mask=annotation_slices_with_mask,
        pci=PciScoreResult.model_validate(pci_result) if pci_result else None,
    )

    if (
        settings.pathology_grade_cache_enabled
        and response.status == "ok"
        and (response.result_image_base64 or response.pci)
    ):
        background_tasks.add_task(
            save_grade_cache,
            fingerprint,
            slim_result_for_cache(response.model_dump(mode="json")),
            upload_names=upload_names,
        )

    return response


@router.post("/pathology/pci", response_model=PciScoreResult)
async def platform_pathology_pci(body: dict[str, Any]) -> PciScoreResult:
    """Direct PCI scoring when DICOM directory path is already known on server."""
    dcm_path = str(body.get("dcm_path") or body.get("dcmPath") or "").strip()
    if not dcm_path:
        raise HTTPException(status_code=400, detail="dcm_path 不能为空")
    result = await predict_pci_score(dcm_path)
    return PciScoreResult.model_validate(result)


@router.post("/pathology/pci/retry", response_model=PciScoreResult)
async def platform_pathology_pci_retry(body: dict[str, Any]) -> PciScoreResult:
    """Retry PCI after segmentation when only session / dataset id is known."""
    session_id = str(body.get("session_id") or body.get("sessionId") or "").strip()
    exam_id = str(body.get("exam_id") or body.get("examId") or "").strip()
    dcm_path = str(body.get("dcm_path") or body.get("dcmPath") or "").strip()
    dataset_id = str(body.get("annotation_dataset_id") or body.get("dataset_id") or "").strip()
    if dcm_path:
        result = await predict_pci_after_segmentation(
            {},
            dcm_path_override=dcm_path,
            segmentation_complete=True,
        )
        return PciScoreResult.model_validate(result)
    if dataset_id:
        try:
            manifest = load_annotation_manifest(dataset_id)
            session_id = session_id or str(manifest.get("session_id") or "")
            exam_id = exam_id or str(manifest.get("exam_id") or "")
            manifest_pci = try_parse_pci_from_manifest(manifest)
            if manifest_pci:
                return PciScoreResult.model_validate(manifest_pci)
        except FileNotFoundError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc
    if not session_id and not exam_id:
        raise HTTPException(status_code=400, detail="需要 session_id、annotation_dataset_id 或 dcm_path")
    ct_payload: dict[str, Any] = {}
    if session_id:
        ct_payload["sessionId"] = session_id
    upload_names = body.get("upload_names") or body.get("uploadNames")
    names = [str(x) for x in upload_names] if isinstance(upload_names, list) else None
    result = await predict_pci_after_segmentation(
        ct_payload,
        exam_id=exam_id,
        upload_names=names,
        segmentation_complete=True,
    )
    return PciScoreResult.model_validate(result)


@router.get("/pathology/slices/{fingerprint}/{index}")
def platform_pathology_slice_image(fingerprint: str, index: int) -> Response:
    """Return one annotated slice PNG for left/right browsing in the diagnosis UI."""
    if index < 0 or index > 5000:
        raise HTTPException(status_code=400, detail="无效的切片序号")
    data = get_slice_image_bytes(fingerprint, index)
    if not data:
        raise HTTPException(status_code=404, detail="切片图像尚未就绪，请稍候或重新分析")
    return Response(content=data, media_type="image/png")


@router.get("/pathology/annotation-datasets", response_model=list[AnnotationDatasetSummary])
def platform_list_annotation_datasets() -> list[AnnotationDatasetSummary]:
    return [AnnotationDatasetSummary.model_validate(x) for x in list_annotation_datasets()]


@router.get("/pathology/annotation-datasets/{dataset_id}")
def platform_get_annotation_dataset(dataset_id: str) -> dict[str, Any]:
    try:
        return load_annotation_manifest(dataset_id)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.get("/pathology/annotation-datasets/{dataset_id}/download")
def platform_download_annotation_dataset(dataset_id: str) -> FileResponse:
    try:
        zip_path = build_annotation_zip(dataset_id)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return FileResponse(
        path=str(zip_path),
        media_type="application/zip",
        filename=f"{dataset_id}_annotations.zip",
    )


@router.get("/pathology", response_model=list[PlatformPathologyRow])
def platform_list_pathology(keyword: str = "", db: Session = Depends(get_db)) -> list[PlatformPathologyRow]:
    rows = pet_ct_case.list_all(db, limit=500)
    out: list[PlatformPathologyRow] = []
    for r in rows:
        item = record_to_pathology_row(pet_ct_case.orm_to_record(r))
        if item:
            out.append(item)
    k = keyword.strip().lower()
    if k:
        out = [
            x
            for x in out
            if k in x.id.lower()
            or k in x.patientName.lower()
            or k in x.summary.lower()
            or k in x.gradeLabel.lower()
        ]
    return out


@router.post("/care-pathway/analyze", response_model=CarePathwayAnalyzeResponse)
async def platform_care_pathway_analyze(
    body: CarePathwayAnalyzeBody,
    db: Session = Depends(get_db),
    authorization: str | None = Header(default=None),
    x_guest_id: str | None = Header(default=None, alias="X-Guest-Id"),
) -> CarePathwayAnalyzeResponse:
    """Imaging report from CT API conclusion; treatment suggestions via ReachAPI LLM."""
    from app.services.billing_quota import resolve_identity
    from app.services.care_pathway_llm import analyze_care_pathway

    user, guest, snap = resolve_identity(db, authorization=authorization, guest_id=x_guest_id or "anonymous")
    # Free users with no remaining quota still get local evidence cards (no LLM polish)
    allow_llm = bool(snap.get("is_pro") or (snap.get("llm_remaining") or 0) > 0)
    raw = await analyze_care_pathway(
        body.imaging, body.record, allow_llm=allow_llm, llm_provider=body.llm_provider
    )
    treatment = raw.get("treatment") or {}
    if allow_llm and treatment.get("llm_used"):
        consume_llm_quota(db, user=user, guest=guest)
    elif not allow_llm and treatment.get("llm_used"):
        # Should not happen if care_pathway respects availability; belt-and-suspenders
        treatment = {**treatment, "llm_used": False}
    return CarePathwayAnalyzeResponse(
        imaging_report=str(raw.get("imaging_report") or ""),
        api_conclusion=str(raw.get("api_conclusion") or ""),
        inferred_diagnosis=str(raw.get("inferred_diagnosis") or ""),
        treatment=treatment,
        literature=raw.get("literature") or [],
    )


@router.post("/pathology/save", response_model=PlatformSaveResponse)
async def platform_pathology_save(body: PathologySaveRequest, db: Session = Depends(get_db)) -> PlatformSaveResponse:
    """Save analysis result to pathology + imaging databases after user confirms."""
    raw = body.result.model_dump()
    saved = await persist_pathology_imaging_result(
        db,
        raw,
        uploaded_file_names=body.uploaded_file_names,
        clinical_record=body.record,
    )
    if saved is None:
        raise HTTPException(status_code=400, detail="仅成功的分析结果可入库")
    patient = record_to_patient_row(saved)
    return PlatformSaveResponse(ok=True, patient=patient, exam_id=saved.patient_base_info.exam_id)


@router.put("/patients/update", response_model=PlatformSaveResponse)
def platform_patient_update(body: PlatformPatientUpdateRequest, db: Session = Depends(get_db)) -> PlatformSaveResponse:
    """Update editable patient-db cells and persist back to the case record."""
    from app.services.platform_adapters import apply_patient_row_to_record

    exam_id = (body.examId or body.patient.examId or "").strip()
    if not exam_id and body.patient.id:
        # PMP-prefixed display ids still map to exam_id without prefix when stored that way
        raw_id = body.patient.id
        exam_id = raw_id[3:] if raw_id.upper().startswith("PMP") else raw_id
    if not exam_id:
        raise HTTPException(status_code=400, detail="examId 不能为空")

    row = pet_ct_case.get_by_exam_id(db, exam_id)
    if row is None:
        # try with/without PMP prefix
        alt = f"PMP{exam_id}" if not exam_id.upper().startswith("PMP") else exam_id[3:]
        row = pet_ct_case.get_by_exam_id(db, alt)
        if row is not None:
            exam_id = alt
    if row is None:
        raise HTTPException(status_code=404, detail=f"未找到病例：{exam_id}")

    record = pet_ct_case.orm_to_record(row)
    updated = apply_patient_row_to_record(record, body.patient)
    if not updated.patient_base_info.exam_id:
        updated = updated.model_copy(
            update={"patient_base_info": updated.patient_base_info.model_copy(update={"exam_id": exam_id})}
        )
    pet_ct_case.upsert_case(db, updated)
    patient = record_to_patient_row(updated)
    return PlatformSaveResponse(ok=True, patient=patient, exam_id=updated.patient_base_info.exam_id)


@router.post("/research/publication-topics", response_model=PlatformPublicationTopicsResponse)
def platform_publication_topics(context: dict[str, Any]) -> PlatformPublicationTopicsResponse:
    return generate_publication_topics(context)


@router.post("/research/ppt-generate", response_model=PlatformPptGenerateResponse)
def platform_ppt_generate(body: PlatformPptGenerateBody) -> PlatformPptGenerateResponse:
    return generate_ppt_content(body)


@router.post("/research/grade-run", response_model=PlatformResearchRunResponse)
async def platform_research_grade_run(
    module: str = Form("imaging"),
    task_id: str = Form("grade-pred"),
    files: list[UploadFile] = File(default=[]),
    inclusion: str = Form(""),
    exclusion: str = Form(""),
    outcome: str = Form(""),
    indicators_json: str = Form("{}"),
    workflow_context_json: str = Form("{}"),
    db: Session = Depends(get_db),
) -> PlatformResearchRunResponse:
    """Research workbench: run pathology grade prediction with DICOM upload."""
    import json

    file_items = [(uf.filename or "upload.dcm", await uf.read()) for uf in files]
    mod = module if module in ("clinical", "imaging", "multimodal") else "imaging"
    try:
        indicators = json.loads(indicators_json) if indicators_json else {}
    except json.JSONDecodeError:
        indicators = {}
    try:
        workflow_context = json.loads(workflow_context_json) if workflow_context_json else {}
    except json.JSONDecodeError:
        workflow_context = {}
    body = PlatformResearchRunBody(
        module=mod,  # type: ignore[arg-type]
        task_id=task_id,
        inclusion=inclusion,
        exclusion=exclusion,
        outcome=outcome,
        indicators=indicators,
        workflow_context=workflow_context,
    )
    return await run_research_task(db, body, dicom_files=file_items or None)


@router.post("/research/radiomics-run", response_model=PlatformResearchRunResponse)
async def platform_radiomics_run(
    files: list[UploadFile] = File(default=[]),
    target_field: str = Form("病理分级"),
    target_value: str = Form("高级别"),
    roi_defined: bool = Form(True),
    use_annotated_image: bool = Form(False),
    indicators_json: str = Form("{}"),
) -> PlatformResearchRunResponse:
    from app.services.platform_radiomics import run_radiomics_analysis
    import json

    names = [uf.filename or "image.nii.gz" for uf in files]
    for uf in files:
        await uf.read()
    try:
        indicators = json.loads(indicators_json) if indicators_json else {}
    except json.JSONDecodeError:
        indicators = {}
    if use_annotated_image:
        indicators["annotated_image_roi"] = "true"
    return run_radiomics_analysis(
        filenames=names or (["annotated_lesion.png"] if use_annotated_image else []),
        target_field=target_field,
        target_value=target_value,
        roi_defined=roi_defined or use_annotated_image,
        indicators=indicators,
    )


@router.post("/knowledge/search", response_model=PlatformKnowledgeSearchResponse)
async def platform_knowledge_search(body: PlatformKnowledgeSearchBody) -> PlatformKnowledgeSearchResponse:
    return await search_knowledge(body)


@router.post("/knowledge/generate", response_model=PlatformKnowledgeGenerateResponse)
def platform_knowledge_generate(body: PlatformKnowledgeGenerateBody) -> PlatformKnowledgeGenerateResponse:
    return generate_document(body)


@router.post("/clinical-dataset/analyze", response_model=ClinicalDatasetAnalyzeResponse)
def platform_clinical_dataset_analyze(body: ClinicalDatasetAnalyzeBody) -> ClinicalDatasetAnalyzeResponse:
    from app.services.platform_clinical_dataset_stats import analyze_clinical_dataset

    try:
        result = analyze_clinical_dataset(body.model_dump())
        rows = result.pop("rows", [])
        summary = result.pop("summary", "")
        return ClinicalDatasetAnalyzeResponse(
            ok=True,
            analysis=body.analysis,
            summary=summary,
            rows=rows if isinstance(rows, list) else [],
            extra=result,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e)) from e
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"分析失败：{e}") from e


@router.get("/llm/providers")
def platform_llm_providers() -> dict[str, Any]:
    from app.services.llm_gateway import default_provider, list_provider_summaries

    providers = list_provider_summaries()
    return {"providers": providers, "default": default_provider()}


@router.get("/stats")
async def platform_stats(db: Session = Depends(get_db)) -> dict[str, Any]:
    from app.services.llm_gateway import count_models, default_provider, is_llm_available, llm_base_url, llm_chat_model

    rows = pet_ct_case.list_all(db, limit=5000)
    records = [pet_ct_case.orm_to_record(r) for r in rows]
    patients = [record_to_patient_row(r) for r in records]
    stats = build_platform_overview_stats(patients, records)
    llm_n = await count_models() if is_llm_available() else 0
    stats["llm_model_count"] = llm_n
    stats["llm_provider"] = default_provider() if is_llm_available() else "offline"
    stats["llm_chat_model"] = llm_chat_model() if is_llm_available() else ""
    stats["llm_base_url"] = llm_base_url() if is_llm_available() else ""
    return stats
