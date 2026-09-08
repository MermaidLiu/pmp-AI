"""Convert PetCtInterviewRecord ↔ Platform UI row types."""

from __future__ import annotations

import re
from datetime import datetime
from typing import Any

from app.models.domain import PetCtInterviewRecord
from app.models.platform_schemas import (
    DiagnosisProbability,
    PlatformDiagnosisResult,
    PlatformImagingRow,
    PlatformPathologyRow,
    PlatformPatientRow,
)


def _text_blob(record: PetCtInterviewRecord) -> str:
    p = record.patient_base_info
    iv = record.interview_info
    rx = record.research_extensions
    parts = [
        iv.clinical_diagnosis or "",
        iv.brief_medical_history or "",
        rx.pet_ct_report_narrative or "",
        rx.imaging_report_text or "",
        p.exam_item or "",
    ]
    return " ".join(parts)


def _infer_staging(text: str) -> str:
    m = re.search(r"c?T(\d)[a-z]?N(\d)M(\d)", text, re.I)
    if m:
        t, n, m0 = m.groups()
        stage_map = {
            ("1", "0", "0"): "IA期",
            ("2", "0", "0"): "IB期",
            ("2", "1", "0"): "IIB期",
            ("3", "1", "0"): "IIIA期",
            ("4", "2", "0"): "IIIB期",
        }
        roman = stage_map.get((t, n, m0), f"cT{t}N{n}M{m0}")
        return f"cT{t}N{n}M{m0} · {roman}"
    if re.search(r"I{1,3}[AB]?期|IV期|II期|III期", text):
        m2 = re.search(r"([IV]+[AB]?期)", text)
        if m2:
            return m2.group(1)
    return "分期待完善"


def _differential_probabilities(text: str, primary: str) -> list[DiagnosisProbability]:
    """Rule-based disease differential (not imaging pathology grade)."""
    lower = text.lower()
    candidates: list[tuple[str, int]] = []

    if any(k in text for k in ("肺", "lung", "NSCLC", "腺癌", "鳞癌")):
        candidates = [
            ("右肺腺癌", 72),
            ("鳞癌", 12),
            ("大细胞癌", 6),
            ("小细胞癌", 5),
            ("其他", 5),
        ]
        if "鳞" in text:
            candidates = [("鳞癌", 68), ("腺癌", 18), ("小细胞癌", 8), ("其他", 6)]
        elif "小细胞" in text:
            candidates = [("小细胞癌", 78), ("鳞癌", 10), ("腺癌", 8), ("其他", 4)]
    elif any(k in lower for k in ("pmp", "假粘液", "腹膜假粘液", "dpam", "pmca", "appendiceal")):
        candidates = [
            ("腹膜假粘液瘤（DPAM）", 55),
            ("腹膜粘液癌（PMCA）", 28),
            ("低级别阑尾粘液性肿瘤", 12),
            ("其他腹膜肿瘤", 5),
        ]
    elif any(k in text for k in ("结肠", "直肠", "结直肠", "粘液腺癌")):
        candidates = [
            ("结肠粘液腺癌", 70),
            ("转移性腺癌", 15),
            ("神经内分泌肿瘤", 8),
            ("其他", 7),
        ]
    elif any(k in text for k in ("甲状腺", "结节")):
        candidates = [
            ("甲状腺乳头状癌", 65),
            ("甲状腺滤泡癌", 18),
            ("良性结节", 12),
            ("其他", 5),
        ]
    else:
        dx = primary or "待明确诊断"
        candidates = [(dx, 85), ("炎性/良性病变", 8), ("转移性肿瘤", 4), ("其他", 3)]

    if primary and candidates[0][0] != primary:
        candidates = [(primary, max(candidates[0][1], 80))] + [
            (c[0], c[1]) for c in candidates if c[0] != primary
        ][:4]
    total = sum(c[1] for c in candidates)
    return [DiagnosisProbability(label=label, pct=round(100 * w / total)) for label, w in candidates]


def build_diagnosis(record: PetCtInterviewRecord, intent_question: str = "") -> PlatformDiagnosisResult:
    text = _text_blob(record)
    iv = record.interview_info
    rx = record.research_extensions
    primary = (iv.clinical_diagnosis or rx.primary_disease_name or "待明确诊断").strip()
    if len(primary) > 48:
        primary = primary[:45] + "…"

    evidence: list[str] = []
    narrative = rx.pet_ct_report_narrative or rx.imaging_report_text or ""
    if narrative:
        suv_m = re.search(r"SUV(?:max)?[：:\s=]*([0-9]+\.?[0-9]*)", narrative, re.I)
        snippet = narrative.strip().split("\n")[0][:120]
        if suv_m:
            evidence.append(f"影像：{snippet}，SUVmax {suv_m.group(1)}")
        else:
            evidence.append(f"影像：{snippet}")
    if iv.clinical_diagnosis:
        evidence.append(f"临床：{iv.clinical_diagnosis[:100]}")
    mh = iv.medical_history
    if mh.smoking_history:
        evidence.append(f"病史：{mh.smoking_history[:60]}")
    if mh.family_tumor_history:
        evidence.append(f"家族史：{mh.family_tumor_history[:60]}")
    if rx.lab_snapshot:
        labs = ", ".join(f"{k}={v}" for k, v in list(rx.lab_snapshot.items())[:3] if v)
        if labs:
            evidence.append(f"检验：{labs}")
    if intent_question:
        evidence.append(f"分析需求：{intent_question[:80]}")

    probs = _differential_probabilities(text, primary)
    top = probs[0]
    confidence = min(0.98, max(0.55, top.pct / 100.0))

    return PlatformDiagnosisResult(
        title=top.label if top.pct >= 50 else primary,
        confidence=round(confidence, 2),
        staging=_infer_staging(text),
        evidence=evidence or ["上传数据已解析，建议补充病理与分子检测以完善鉴别诊断。"],
        probabilities=probs,
        prognosis={},
    )


def _extract_pci_score(text: str) -> int | None:
    m = re.search(r"PCI\s*总分[：:\s]*(\d+)", text, re.I)
    if m:
        return int(m.group(1))
    m = re.search(r"PCI\s*(\d+)\s*/\s*36", text, re.I)
    if m:
        return int(m.group(1))
    return None


def _lab_field(lab: dict[str, Any], *keys: str, default: str = "—") -> str:
    for key in keys:
        val = lab.get(key)
        if val is not None and str(val).strip():
            return str(val).strip()
    return default


def _lab_clinical_summary(lab: dict[str, Any]) -> str:
    parts: list[str] = []
    tnm = lab.get("TNM分期")
    if tnm is not None and str(tnm).strip():
        parts.append(f"TNM {tnm}")
    for key in ("CEA", "CA125", "CA19-9", "CA199"):
        if key == "CA199" and lab.get("CA19-9"):
            continue
        val = lab.get(key)
        if val is not None and str(val).strip():
            label = "CA19-9" if key == "CA199" else key
            parts.append(f"{label} {val}")
    return " · ".join(parts) if parts else ""


def _normalize_grade_label(grade: str, pci_score: int | None, narrative: str = "") -> str:
    from app.services.pathology_grader import infer_histologic_grade_label

    g = (grade or "").strip()
    if g in ("高级别", "低级别", "未确定"):
        return g
    inferred = infer_histologic_grade_label(g, narrative)
    if inferred in ("高级别", "低级别"):
        return inferred
    if g.upper().startswith("PCI"):
        return inferred if inferred != "未确定" else "—"
    return g or "—"


def record_to_patient_row(record: PetCtInterviewRecord, row_id: str | None = None) -> PlatformPatientRow:
    p = record.patient_base_info
    iv = record.interview_info
    rx = record.research_extensions
    mh = iv.medical_history
    pid = row_id or rx.patient_internal_id or p.medical_record_id or p.exam_id or ""
    if pid and not str(pid).upper().startswith("PMP"):
        pid = f"PMP{pid}"
    if not pid:
        pid = f"PMP{datetime.now().strftime('%Y%m%d%H%M')}"

    enrolled = ""
    if p.interview_time:
        enrolled = p.interview_time.strftime("%Y-%m-%d") if hasattr(p.interview_time, "strftime") else str(p.interview_time)[:10]
    if not enrolled:
        enrolled = datetime.now().strftime("%Y-%m-%d")

    grade_raw = rx.pathology_grade or "—"
    narrative = rx.pet_ct_report_narrative or rx.imaging_report_text or ""
    pci_score = _extract_pci_score(narrative) or _extract_pci_score(grade_raw)
    grade = _normalize_grade_label(grade_raw, pci_score, narrative)

    lab = rx.lab_snapshot or {}
    lab_txt = _lab_clinical_summary(lab)
    clinical_parts = [iv.brief_medical_history[:120] if iv.brief_medical_history else ""]
    if lab_txt:
        clinical_parts.append(lab_txt)
    clinical_summary = " · ".join(p for p in clinical_parts if p) or "—"

    path_parts: list[str] = []
    if grade and grade != "—":
        path_parts.append(grade)
    if rx.pathology_confidence is not None:
        path_parts.append(f"置信度 {rx.pathology_confidence * 100:.0f}%")
    if rx.pathology_evidence:
        path_parts.append(rx.pathology_evidence[0][:60])
    pathology_summary = " · ".join(path_parts) if path_parts else "—"

    dicom_count = 0
    for u in rx.document_uploads or []:
        if isinstance(u, dict) and u.get("kind") == "dicom":
            dicom_count += int(u.get("dicom_count") or u.get("count") or 1)
    modality = "CT"
    if re.search(r"PET|FDG", (p.exam_item or "") + narrative, re.I):
        modality = "PET-CT"
    img_parts: list[str] = [modality]
    if dicom_count:
        img_parts.append(f"{dicom_count} 层 DICOM")
    if pci_score is not None:
        img_parts.append(f"PCI {pci_score}/36")
    if _has_pathology_imaging_artifact(rx):
        img_parts.append("含分割图")
    imaging_summary = " · ".join(img_parts)

    gene = "—"
    for key in ("EGFR", "egfr", "KRAS", "kras", "gene", "分子"):
        if key in lab and lab[key]:
            gene = str(lab[key])
            break

    return PlatformPatientRow(
        id=pid,
        name=p.name or "未知",
        gender=p.gender or "—",
        age=p.age or 0,
        diagnosis=iv.clinical_diagnosis or rx.primary_disease_name or "待诊断",
        stage=_infer_staging(_text_blob(record)).split(" · ")[-1] if _infer_staging(_text_blob(record)) else "—",
        gene=gene,
        enrolledAt=enrolled,
        department=p.department or "—",
        physician=p.interview_doctor or "—",
        smoking=mh.smoking_history or "—",
        ecog="—",
        chiefComplaint=iv.brief_medical_history[:80] if iv.brief_medical_history else "—",
        pastHistory=iv.brief_medical_history or "—",
        familyHistory=mh.family_tumor_history or "—",
        admissionId=p.admission_id or p.outpatient_id or "—",
        admissionTime=enrolled,
        gradeLabel=grade if grade else "—",
        followUpStatus=(
            "随访中"
            if rx.prior_exam_ids or "随访队列" in (rx.pet_ct_phenotype_tags or [])
            else "—"
        ),
        examId=p.exam_id or "",
        clinicalSummary=clinical_summary,
        pathologySummary=pathology_summary,
        imagingSummary=imaging_summary,
        pciScore=pci_score,
        hasAnnotatedImage=_has_pathology_imaging_artifact(rx),
        modality=modality,
        dicomCount=dicom_count,
        treatmentMethod=_lab_field(lab, "治疗方式", "treatmentMethod"),
        surgeryNumber=_lab_field(lab, "第几次手术", "surgeryNumber"),
        ivChemotherapy=_lab_field(lab, "是否静脉化疗", "ivChemotherapy"),
        ccScore=_lab_field(lab, "CC评分", "CC", "ccScore"),
    )


def apply_patient_row_to_record(
    record: PetCtInterviewRecord,
    row: PlatformPatientRow,
) -> PetCtInterviewRecord:
    """Merge editable patient-table fields back into a full case record."""
    p = record.patient_base_info
    iv = record.interview_info
    rx = record.research_extensions
    lab = dict(rx.lab_snapshot or {})

    def _clean(v: str | None, fallback: str = "") -> str:
        if v is None:
            return fallback
        t = str(v).strip()
        if not t or t == "—":
            return fallback
        return t

    name = _clean(row.name, p.name or "")
    gender = _clean(row.gender, p.gender or "")
    department = _clean(row.department, p.department or "")
    physician = _clean(row.physician, p.interview_doctor or "")
    diagnosis = _clean(row.diagnosis, iv.clinical_diagnosis or "")
    chief = _clean(row.chiefComplaint, "")
    treatment = _clean(row.treatmentMethod)
    surgery = _clean(row.surgeryNumber)
    iv_chemo = _clean(row.ivChemotherapy)
    cc = _clean(row.ccScore)
    grade = _clean(row.gradeLabel)

    if treatment:
        lab["治疗方式"] = treatment
    if surgery:
        lab["第几次手术"] = surgery
    if iv_chemo:
        lab["是否静脉化疗"] = iv_chemo
    if cc:
        lab["CC评分"] = cc

    tags = list(rx.pet_ct_phenotype_tags or [])
    follow = _clean(row.followUpStatus)
    if follow == "随访中":
        if "随访队列" not in tags:
            tags.append("随访队列")
    elif follow and follow != "随访中":
        tags = [t for t in tags if t != "随访队列"]

    age = row.age if isinstance(row.age, int) and row.age > 0 else (p.age or 0)

    new_p = p.model_copy(
        update={
            "name": name or p.name,
            "gender": gender or p.gender,
            "age": age,
            "department": department or p.department,
            "interview_doctor": physician or p.interview_doctor,
            "exam_id": _clean(row.examId, p.exam_id or "") or p.exam_id,
            "admission_id": _clean(row.admissionId, p.admission_id or "") or p.admission_id,
        }
    )
    brief = chief or iv.brief_medical_history
    if row.clinicalSummary and row.clinicalSummary not in ("—", "") and not chief:
        # keep existing brief when clinicalSummary is a derived display string
        brief = iv.brief_medical_history
    new_iv = iv.model_copy(
        update={
            "clinical_diagnosis": diagnosis or iv.clinical_diagnosis,
            "brief_medical_history": brief,
        }
    )
    new_rx = rx.model_copy(
        update={
            "lab_snapshot": lab,
            "pathology_grade": grade or rx.pathology_grade or "",
            "pet_ct_phenotype_tags": tags,
            "primary_disease_name": diagnosis or rx.primary_disease_name or "",
        }
    )
    return record.model_copy(
        update={
            "patient_base_info": new_p,
            "interview_info": new_iv,
            "research_extensions": new_rx,
        }
    )


def _has_pathology_imaging_artifact(rx) -> bool:
    for u in rx.document_uploads or []:
        if isinstance(u, dict) and u.get("source") == "pathology_imaging_api":
            return True
    return bool((rx.pathology_grade or "").strip())


def is_patient_graded(row: PlatformPatientRow) -> bool:
    return row.gradeLabel in ("高级别", "低级别")


def is_patient_diagnosed(row: PlatformPatientRow) -> bool:
    return row.pciScore is not None or is_patient_graded(row)


def is_patient_analyzing(row: PlatformPatientRow) -> bool:
    if is_patient_diagnosed(row):
        return False
    return bool(row.hasAnnotatedImage or (row.dicomCount or 0) > 0)


def patient_workflow_status(row: PlatformPatientRow) -> str:
    if is_patient_diagnosed(row):
        return "diagnosed"
    if is_patient_analyzing(row):
        return "analyzing"
    return "pending"


def count_pathology_imaging_runs(record: PetCtInterviewRecord) -> int:
    n = 0
    rx = record.research_extensions
    for u in rx.document_uploads or []:
        if isinstance(u, dict) and u.get("source") == "pathology_imaging_api":
            n += 1
    return n


def build_platform_overview_stats(
    patient_rows: list[PlatformPatientRow],
    records: list[PetCtInterviewRecord],
) -> dict[str, int | float | None]:
    pending = analyzing = diagnosed = graded = with_annotation = 0
    for p in patient_rows:
        status = patient_workflow_status(p)
        if status == "pending":
            pending += 1
        elif status == "analyzing":
            analyzing += 1
        else:
            diagnosed += 1
        if is_patient_graded(p):
            graded += 1
        if p.hasAnnotatedImage:
            with_annotation += 1

    imaging_n = sum(1 for r in records if record_to_imaging_row(r))
    model_runs = sum(count_pathology_imaging_runs(r) for r in records)
    denom = diagnosed + analyzing
    accuracy = round(100.0 * diagnosed / denom, 1) if denom else None

    return {
        "patients": len(patient_rows),
        "pending": pending,
        "analyzing": analyzing,
        "diagnosed": diagnosed,
        "graded": graded,
        "with_annotation": with_annotation,
        "imaging": imaging_n,
        "annotation_models": model_runs,
        "llm_model_count": 0,
        "llm_provider": "reachapi",
        "dicom_estimate": imaging_n * 400,
        "prediction_accuracy_pct": accuracy,
    }


def record_to_imaging_row(record: PetCtInterviewRecord) -> PlatformImagingRow | None:
    p = record.patient_base_info
    rx = record.research_extensions
    narrative = rx.pet_ct_report_narrative or rx.imaging_report_text or ""
    has_pathology = bool(rx.pathology_grade.strip())
    if not narrative and not rx.lesions and not rx.global_quant.suv_max and not has_pathology:
        uploads = rx.document_uploads or []
        dicom_uploads = [u for u in uploads if isinstance(u, dict) and u.get("kind") == "dicom"]
        if not dicom_uploads:
            return None

    exam_item = p.exam_item or "影像检查"
    modality = "CT"
    if re.search(r"PET|FDG", exam_item + narrative, re.I):
        modality = "PET-CT"
    elif re.search(r"\bCT\b|计算机断层", exam_item, re.I) and not re.search(r"PET", exam_item, re.I):
        modality = "CT"
    elif re.search(r"MR|MRI|磁共振", exam_item, re.I):
        modality = "MRI"
    elif re.search(r"超声|B超", exam_item):
        modality = "超声"

    gq = rx.global_quant
    if has_pathology:
        conf_txt = ""
        if rx.pathology_confidence is not None:
            conf_txt = f"（置信度 {rx.pathology_confidence * 100:.0f}%）"
        summary = f"影像诊断分析：{rx.pathology_grade}{conf_txt}"
    else:
        summary = narrative.strip().split("\n")[0][:120] if narrative else exam_item

    dicom_count = 0
    for u in rx.document_uploads or []:
        if isinstance(u, dict) and u.get("kind") == "dicom":
            dicom_count += int(u.get("dicom_count") or u.get("count") or 1)
    if dicom_count == 0 and narrative:
        dicom_count = max(1, len(rx.lesions) * 200)

    exam_date = ""
    if p.interview_time:
        exam_date = p.interview_time.strftime("%Y-%m-%d") if hasattr(p.interview_time, "strftime") else str(p.interview_time)[:10]
    if not exam_date:
        exam_date = datetime.now().strftime("%Y-%m-%d")

    body_part = "—"
    for le in rx.lesions:
        if le.organ_or_region:
            body_part = le.organ_or_region
            break
    if body_part == "—" and narrative:
        for kw in ("肺", "腹", "肝", "纵隔", "盆腔", "甲状腺"):
            if kw in narrative:
                body_part = kw
                break

    return PlatformImagingRow(
        id=p.exam_id or f"IMG-{exam_date.replace('-', '')}",
        patientId=rx.patient_internal_id or p.medical_record_id or p.exam_id,
        patientName=p.name or "未知",
        modality=modality,
        examItem=exam_item,
        examDate=exam_date,
        bodyPart=body_part,
        suvMax=gq.suv_max,
        mtv=gq.mtv,
        tlg=gq.tlg,
        lesionCount=len(rx.lesions),
        dicomCount=dicom_count or 1,
        hasPet=bool(re.search(r"PET|FDG|代谢", exam_item + narrative, re.I)),
        reportSummary=summary,
        reportText=narrative or f"【检查项目】{exam_item}\n【备注】由平台自动入库生成。",
        status="已归档",
        hasAnnotatedImage=_has_pathology_imaging_artifact(rx),
    )


def record_to_pathology_row(record: PetCtInterviewRecord) -> PlatformPathologyRow | None:
    p = record.patient_base_info
    rx = record.research_extensions
    grade = (rx.pathology_grade or "").strip()
    narrative = rx.imaging_report_text or rx.pet_ct_report_narrative or ""
    if not grade and "影像诊断分析" not in narrative:
        return None

    dicom_count = 0
    for u in rx.document_uploads or []:
        if isinstance(u, dict) and u.get("kind") == "dicom":
            dicom_count += int(u.get("dicom_count") or u.get("count") or 1)

    exam_date = ""
    if p.interview_time:
        exam_date = p.interview_time.strftime("%Y-%m-%d") if hasattr(p.interview_time, "strftime") else str(p.interview_time)[:10]
    if not exam_date:
        exam_date = datetime.now().strftime("%Y-%m-%d")

    conf_txt = ""
    if rx.pathology_confidence is not None:
        conf_txt = f" · 置信度 {rx.pathology_confidence * 100:.0f}%"

    summary = grade or narrative.strip().split("\n")[0][:160]
    if rx.pathology_evidence:
        summary = f"{summary} · {rx.pathology_evidence[0][:80]}"

    return PlatformPathologyRow(
        id=f"PATH-{p.exam_id}" if p.exam_id else f"PATH-{exam_date.replace('-', '')}",
        patientId=rx.patient_internal_id or p.medical_record_id or p.exam_id or "—",
        patientName=p.name or "未知",
        sampleSite=p.exam_item or "DICOM 影像",
        stainType="AI 影像诊断",
        gradeLabel=grade or "待判定",
        whoGrade="—",
        ki67="—",
        p53="—",
        pmpSubtype="—",
        slideCount=dicom_count or 1,
        reportDate=exam_date,
        pathologist="AI 影像诊断分析",
        summary=summary + conf_txt,
        confidence=rx.pathology_confidence,
        dicomCount=dicom_count or 1,
        status="已签发",
        hasAnnotatedImage=_has_pathology_imaging_artifact(rx),
    )


def merge_records(records: list[PetCtInterviewRecord]) -> PetCtInterviewRecord:
    if not records:
        raise ValueError("无有效解析记录")
    base = records[0].model_copy(deep=True)
    for rec in records[1:]:
        p2 = rec.patient_base_info
        for field in ("name", "gender", "age", "department", "exam_item", "medical_record_id"):
            if not getattr(base.patient_base_info, field) and getattr(p2, field):
                setattr(base.patient_base_info, field, getattr(p2, field))
        if rec.interview_info.clinical_diagnosis and not base.interview_info.clinical_diagnosis:
            base.interview_info.clinical_diagnosis = rec.interview_info.clinical_diagnosis
        if rec.interview_info.brief_medical_history and not base.interview_info.brief_medical_history:
            base.interview_info.brief_medical_history = rec.interview_info.brief_medical_history
        rx2 = rec.research_extensions
        rx = base.research_extensions
        if rx2.pet_ct_report_narrative:
            rx.pet_ct_report_narrative = (rx.pet_ct_report_narrative + "\n" + rx2.pet_ct_report_narrative).strip()
        if rx2.imaging_report_text:
            rx.imaging_report_text = (rx.imaging_report_text + "\n" + rx2.imaging_report_text).strip()
        rx.lesions.extend(rx2.lesions)
        rx.document_uploads.extend(rx2.document_uploads)
        if rx2.global_quant.suv_max and not rx.global_quant.suv_max:
            rx.global_quant = rx2.global_quant
        base.research_extensions = rx
    if not base.patient_base_info.exam_id:
        base.patient_base_info.exam_id = f"PET{datetime.now().strftime('%Y%m%d%H%M%S')}"
    return base
