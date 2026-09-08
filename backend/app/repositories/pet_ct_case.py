from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.domain import (
    InterviewInfo,
    PatientBaseInfo,
    PetCtInterviewRecord,
    PetCtResearchExtensions,
    SupplementaryInterviewInfo,
)
from app.models.orm import DiseaseORM, PetCtCaseORM


def record_to_orm(rec: PetCtInterviewRecord, existing: PetCtCaseORM | None = None) -> PetCtCaseORM:
    p = rec.patient_base_info
    row = existing or PetCtCaseORM()
    row.name = p.name
    row.gender = p.gender
    row.age = p.age
    row.phone = p.phone
    row.source = p.source
    row.exam_id = p.exam_id
    row.medical_record_id = p.medical_record_id
    row.admission_id = p.admission_id
    row.outpatient_id = p.outpatient_id
    row.department = p.department
    row.doctor_phone = p.doctor_phone
    row.exam_item = p.exam_item
    row.height_cm = p.height_cm
    row.weight_kg = p.weight_kg
    row.interview_doctor = p.interview_doctor
    row.interview_time = p.interview_time
    row.patient_type = list(p.patient_type)
    row.is_free_report = p.is_free_report
    row.interview_info = rec.interview_info.model_dump(mode="json")
    row.supplementary_interview_info = rec.supplementary_interview_info.model_dump(mode="json")
    ext_merged = rec.research_extensions.model_dump(mode="json")
    if not ext_merged.get("lab_snapshot"):
        ext_merged["lab_snapshot"] = {
            "creatinine": rec.interview_info.creatinine,
            "urea_nitrogen": rec.interview_info.urea_nitrogen,
            "creatinine_abnormal_value": rec.interview_info.creatinine_abnormal_value,
            "urea_nitrogen_abnormal_value": rec.supplementary_interview_info.urea_nitrogen_abnormal_value,
            "thyroid_hormone_text": rec.interview_info.thyroid_hormone,
        }
    ext = PetCtResearchExtensions.model_validate(ext_merged)
    row.patient_internal_id = ext.patient_internal_id or p.medical_record_id or ""
    row.research_extensions = ext.model_dump(mode="json")
    return row


def orm_to_record(row: PetCtCaseORM) -> PetCtInterviewRecord:
    return PetCtInterviewRecord(
        patient_base_info=PatientBaseInfo(
            name=row.name,
            gender=row.gender,
            age=row.age,
            phone=row.phone,
            source=row.source,
            exam_id=row.exam_id,
            medical_record_id=row.medical_record_id,
            admission_id=row.admission_id,
            outpatient_id=row.outpatient_id,
            department=row.department,
            doctor_phone=row.doctor_phone,
            exam_item=row.exam_item,
            height_cm=row.height_cm,
            weight_kg=row.weight_kg,
            interview_doctor=row.interview_doctor,
            interview_time=row.interview_time,
            patient_type=list(row.patient_type or []),
            is_free_report=row.is_free_report,
        ),
        interview_info=InterviewInfo.model_validate(row.interview_info or {}),
        supplementary_interview_info=SupplementaryInterviewInfo.model_validate(
            row.supplementary_interview_info or {}
        ),
        research_extensions=PetCtResearchExtensions.model_validate(row.research_extensions or {}),
    )


def upsert_case(db: Session, rec: PetCtInterviewRecord) -> PetCtCaseORM:
    exam_id = rec.patient_base_info.exam_id
    if not exam_id:
        raise ValueError("patient_base_info.exam_id is required for persistence")

    existing = db.execute(select(PetCtCaseORM).where(PetCtCaseORM.exam_id == exam_id)).scalar_one_or_none()
    row = record_to_orm(rec, existing=existing)
    code = (rec.research_extensions.primary_disease_code or "").strip()
    if code:
        dis = db.execute(select(DiseaseORM).where(DiseaseORM.code == code)).scalar_one_or_none()
        if dis is not None:
            row.disease_id = dis.id
    if existing is None:
        db.add(row)
    db.commit()
    db.refresh(row)
    return row


def get_by_exam_id(db: Session, exam_id: str) -> PetCtCaseORM | None:
    return db.execute(select(PetCtCaseORM).where(PetCtCaseORM.exam_id == exam_id)).scalar_one_or_none()


def list_all(db: Session, skip: int = 0, limit: int = 500) -> list[PetCtCaseORM]:
    return list(
        db.execute(
            select(PetCtCaseORM).order_by(PetCtCaseORM.updated_at.desc()).offset(skip).limit(limit)
        ).scalars().all()
    )


def count_all(db: Session) -> int:
    from sqlalchemy import func

    n = db.execute(select(func.count()).select_from(PetCtCaseORM)).scalar_one()
    return int(n or 0)
