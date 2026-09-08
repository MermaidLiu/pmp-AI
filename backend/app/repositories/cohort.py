from __future__ import annotations

from statistics import mean
from typing import Any

from sqlalchemy import Select, func, select
from sqlalchemy.orm import Session

from app.models.domain import CohortFilterBody, PetCtInterviewRecord
from app.models.orm import DiseaseORM, PetCtCaseORM
from app.repositories import pet_ct_case


def _apply_filters(q: Select[Any], filters: CohortFilterBody) -> Select[Any]:
    if filters.disease_id is not None:
        q = q.where(PetCtCaseORM.disease_id == filters.disease_id)
    if filters.department_contains:
        like = f"%{filters.department_contains}%"
        q = q.where(PetCtCaseORM.department.ilike(like))
    if filters.min_age is not None:
        q = q.where(PetCtCaseORM.age >= filters.min_age)
    if filters.max_age is not None:
        q = q.where(PetCtCaseORM.age <= filters.max_age)
    if filters.gender:
        q = q.where(PetCtCaseORM.gender == filters.gender)
    if filters.patient_internal_id:
        q = q.where(PetCtCaseORM.patient_internal_id == filters.patient_internal_id)
    return q


def query_cases(db: Session, filters: CohortFilterBody) -> list[PetCtCaseORM]:
    q = select(PetCtCaseORM)
    q = _apply_filters(q, filters)
    if filters.disease_code:
        dis = db.execute(select(DiseaseORM).where(DiseaseORM.code == filters.disease_code)).scalar_one_or_none()
        if dis is None:
            return []
        q = q.where(PetCtCaseORM.disease_id == dis.id)
    rows = list(db.execute(q.offset(filters.skip).limit(filters.limit)).scalars().all())
    if filters.phenotype_tag:
        tag = filters.phenotype_tag
        rows = [
            r
            for r in rows
            if tag in (r.research_extensions or {}).get("pet_ct_phenotype_tags", [])
        ]
    if filters.has_pet_lesion_suv is True:
        filtered: list[PetCtCaseORM] = []
        for r in rows:
            les = (r.research_extensions or {}).get("lesions") or []
            if any((isinstance(x, dict) and x.get("suv_max") is not None) for x in les):
                filtered.append(r)
        rows = filtered
    return rows


def cohort_summary(db: Session, filters: CohortFilterBody) -> dict[str, Any]:
    wide = CohortFilterBody(**{**filters.model_dump(), "limit": 10_000, "skip": 0})
    rows = query_cases(db, wide)
    if not rows:
        return {"n": 0, "message": "无匹配病例"}
    ages = [r.age for r in rows if r.age]
    genders = [r.gender for r in rows if r.gender]
    suv_vals: list[float] = []
    for r in rows:
        gq = (r.research_extensions or {}).get("global_quant") or {}
        if isinstance(gq, dict) and gq.get("suv_max") is not None:
            try:
                suv_vals.append(float(gq["suv_max"]))
            except (TypeError, ValueError):
                pass
        for le in (r.research_extensions or {}).get("lesions") or []:
            if isinstance(le, dict) and le.get("suv_max") is not None:
                try:
                    suv_vals.append(float(le["suv_max"]))
                except (TypeError, ValueError):
                    pass
    return {
        "n": len(rows),
        "age_mean": round(mean(ages), 2) if ages else None,
        "gender_counts": _count_str(genders),
        "suv_max_in_cohort": {"count": len(suv_vals), "max": max(suv_vals) if suv_vals else None},
    }


def _count_str(items: list[str]) -> dict[str, int]:
    m: dict[str, int] = {}
    for x in items:
        m[x] = m.get(x, 0) + 1
    return m


def count_estimate(db: Session, filters: CohortFilterBody) -> int:
    q = select(func.count()).select_from(PetCtCaseORM)
    q = _apply_filters(q, filters)
    if filters.disease_code:
        dis = db.execute(select(DiseaseORM).where(DiseaseORM.code == filters.disease_code)).scalar_one_or_none()
        if dis is None:
            return 0
        q = q.where(PetCtCaseORM.disease_id == dis.id)
    n = db.execute(q).scalar_one()
    return int(n or 0)


def rows_to_records(rows: list[PetCtCaseORM]) -> list[PetCtInterviewRecord]:
    return [pet_ct_case.orm_to_record(r) for r in rows]
