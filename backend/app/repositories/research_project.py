from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.domain import ResearchProjectCreate, ResearchProjectRead
from app.models.orm import ResearchProjectORM


def create_project(db: Session, payload: ResearchProjectCreate) -> ResearchProjectORM:
    row = ResearchProjectORM(
        title=payload.title,
        description=payload.description,
        research_topic=payload.research_topic,
        status=payload.status,
        linked_exam_ids=list(payload.linked_exam_ids),
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def list_projects(db: Session, skip: int = 0, limit: int = 50) -> list[ResearchProjectORM]:
    q = select(ResearchProjectORM).order_by(ResearchProjectORM.id.desc()).offset(skip).limit(limit)
    return list(db.execute(q).scalars().all())


def get_project(db: Session, project_id: int) -> ResearchProjectORM | None:
    return db.get(ResearchProjectORM, project_id)


def to_read(row: ResearchProjectORM) -> ResearchProjectRead:
    return ResearchProjectRead(
        id=row.id,
        title=row.title,
        description=row.description,
        research_topic=row.research_topic,
        status=row.status,
        created_at=row.created_at,
        updated_at=row.updated_at,
        linked_exam_ids=list(row.linked_exam_ids or []),
        extra_metadata=dict(row.extra_metadata or {}),
    )
