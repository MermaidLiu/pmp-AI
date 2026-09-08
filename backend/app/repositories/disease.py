from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.domain import DiseaseCreate, DiseaseRead
from app.models.orm import DiseaseORM, PetCtCaseORM


def list_diseases(db: Session) -> list[DiseaseORM]:
    return list(db.execute(select(DiseaseORM).order_by(DiseaseORM.id)).scalars().all())


def get_by_id(db: Session, disease_id: int) -> DiseaseORM | None:
    return db.get(DiseaseORM, disease_id)


def get_by_code(db: Session, code: str) -> DiseaseORM | None:
    return db.execute(select(DiseaseORM).where(DiseaseORM.code == code)).scalar_one_or_none()


def create_disease(db: Session, body: DiseaseCreate) -> DiseaseORM:
    row = DiseaseORM(
        code=body.code,
        name=body.name,
        category=body.category,
        description=body.description,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def to_read(row: DiseaseORM) -> DiseaseRead:
    return DiseaseRead(
        id=row.id,
        code=row.code,
        name=row.name,
        category=row.category,
        description=row.description,
    )


def seed_default_diseases(db: Session) -> int:
    """Idempotent seed; returns number of rows inserted."""
    defaults = [
        ("FUO", "发热待查", "感染与炎症", "不明原因发热相关 PET-CT 科研队列"),
        ("RHEUM_IMMU", "风湿免疫病", "自身免疫", "关节炎、血管炎、结缔组织病等"),
        ("ONCOLOGY", "肿瘤相关", "肿瘤", "原发或转移性肿瘤代谢评估"),
        ("FEVER_SEPSIS", "脓毒症与重症感染", "感染", "重症感染炎症负荷评估"),
        ("VASCULITIS", "大血管炎", "风湿免疫", "大动脉炎等血管炎性病变"),
    ]
    inserted = 0
    for code, name, cat, desc in defaults:
        if get_by_code(db, code):
            continue
        create_disease(db, DiseaseCreate(code=code, name=name, category=cat, description=desc))
        inserted += 1
    return inserted


def count_cases_for_disease(db: Session, disease_id: int) -> int:
    return (
        db.execute(select(PetCtCaseORM).where(PetCtCaseORM.disease_id == disease_id))
        .scalars()
        .all()
        .__len__()
    )
