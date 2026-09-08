from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models.domain import CohortFilterBody, DiseaseCreate, DiseaseRead
from app.repositories import cohort as cohort_repo
from app.repositories import disease as disease_repo
from app.repositories import pet_ct_case

router = APIRouter()


@router.get("", response_model=list[DiseaseRead])
def list_diseases(db: Session = Depends(get_db)) -> list[DiseaseRead]:
    return [disease_repo.to_read(r) for r in disease_repo.list_diseases(db)]


@router.post("", response_model=DiseaseRead)
def create_disease(body: DiseaseCreate, db: Session = Depends(get_db)) -> DiseaseRead:
    if disease_repo.get_by_code(db, body.code):
        raise HTTPException(status_code=400, detail="病种 code 已存在")
    row = disease_repo.create_disease(db, body)
    return disease_repo.to_read(row)


@router.get("/{disease_id}/cases")
def cases_for_disease(disease_id: int, db: Session = Depends(get_db)) -> dict:
    dis = disease_repo.get_by_id(db, disease_id)
    if dis is None:
        raise HTTPException(status_code=404, detail="病种不存在")
    rows = cohort_repo.query_cases(db, CohortFilterBody(disease_id=disease_id, limit=500))
    return {
        "disease": disease_repo.to_read(dis).model_dump(),
        "n": len(rows),
        "exam_ids": [r.exam_id for r in rows],
    }


@router.get("/{disease_id}/cases/full")
def cases_full(disease_id: int, db: Session = Depends(get_db)) -> list[dict]:
    dis = disease_repo.get_by_id(db, disease_id)
    if dis is None:
        raise HTTPException(status_code=404, detail="病种不存在")
    rows = cohort_repo.query_cases(db, CohortFilterBody(disease_id=disease_id, limit=500))
    return [pet_ct_case.orm_to_record(r).model_dump(mode="json") for r in rows]
