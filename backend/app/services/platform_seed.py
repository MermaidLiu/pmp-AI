"""Seed demo cases when database is empty."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy.orm import Session

from app.models.domain import PetCtInterviewRecord
from app.repositories import pet_ct_case


_DEMO_CASES: list[dict] = [
    {
        "patient_base_info": {
            "name": "王建国",
            "gender": "男",
            "age": 58,
            "exam_id": "IMG-20240515-001",
            "medical_record_id": "PMP00012345",
            "department": "肿瘤内科",
            "exam_item": "18F-FDG PET/CT 全身显像",
            "interview_doctor": "张医生",
            "interview_time": "2024-05-20T00:00:00",
        },
        "interview_info": {
            "clinical_diagnosis": "右肺腺癌",
            "brief_medical_history": "咳嗽、胸闷2月",
            "medical_history": {
                "smoking_history": "吸烟30年",
                "family_tumor_history": "父亲肺癌史",
            },
        },
        "research_extensions": {
            "patient_internal_id": "PMP00012345",
            "pathology_grade": "高级别",
            "pet_ct_report_narrative": "右肺上叶占位 3.2cm，SUVmax 8.6，纵隔淋巴结肿大",
            "global_quant": {"suv_max": 8.6, "mtv": 42.5, "tlg": 186.3},
            "lesions": [{"organ_or_region": "右肺上叶", "suv_max": 8.6}],
            "lab_snapshot": {"EGFR": "19del 阳性"},
        },
    },
    {
        "patient_base_info": {
            "name": "李秀英",
            "gender": "女",
            "age": 62,
            "exam_id": "IMG-20240518-002",
            "medical_record_id": "PMP00012346",
            "department": "妇科肿瘤科",
            "exam_item": "全腹 MRI 增强",
            "interview_doctor": "刘医生",
            "interview_time": "2024-05-18T00:00:00",
        },
        "interview_info": {
            "clinical_diagnosis": "腹膜假粘液瘤",
            "brief_medical_history": "腹胀3月",
            "medical_history": {"smoking_history": "无"},
        },
        "research_extensions": {
            "patient_internal_id": "PMP00012346",
            "pathology_grade": "低级别",
            "imaging_report_text": "腹腔大量粘液性腹水，腹膜增厚",
            "primary_disease_name": "腹膜假粘液瘤",
        },
    },
    {
        "patient_base_info": {
            "name": "陈志远",
            "gender": "男",
            "age": 45,
            "exam_id": "IMG-20240512-003",
            "medical_record_id": "PMP00012347",
            "department": "胃肠外科",
            "exam_item": "结肠 CT 增强",
            "interview_doctor": "王医生",
            "interview_time": "2024-05-15T00:00:00",
        },
        "interview_info": {
            "clinical_diagnosis": "结肠粘液腺癌",
            "brief_medical_history": "便血1月",
        },
        "research_extensions": {
            "patient_internal_id": "PMP00012347",
            "pathology_grade": "高级别",
            "imaging_report_text": "升结肠壁增厚，周围淋巴结肿大",
            "lab_snapshot": {"KRAS": "突变阳性"},
        },
    },
]


def seed_if_empty(db: Session) -> int:
    if pet_ct_case.count_all(db) > 0:
        return 0
    n = 0
    for raw in _DEMO_CASES:
        rec = PetCtInterviewRecord.model_validate(raw)
        pet_ct_case.upsert_case(db, rec)
        n += 1
    return n
