from __future__ import annotations

import tempfile
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import Depends, FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session

from app.api.routes.platform import router as platform_router
from app.api.routes.diseases import router as diseases_router
from app.api.routes.lingxi_modules import router as lingxi_modules_router
from app.api.routes.auth_billing import router as auth_billing_router
from app.core.config import settings
from app.core.database import Base, SessionLocal, engine, get_db
from app.core.db_migrate import ensure_sqlite_columns
from app.models import orm as _orm  # noqa: F401 — register User/Guest/Payment tables
from app.demo_fixtures import (
    SAMPLE_EXTRACT_DEMO_NOTE,
    SAMPLE_INTERVIEW_RECORD,
    sample_petct_analysis_demo,
)
from app.models.domain import (
    PetCtInterviewRecord,
    ResearchProjectCreate,
    ResearchProjectRead,
)
from app.repositories import disease as disease_repo
from app.repositories import pet_ct_case, research_project
from app.services.data_extractor import DataExtractor
from app.services.petct_analyzer import PETCTAnalyzer
from app.services.platform_seed import seed_if_empty


@asynccontextmanager
async def lifespan(_: FastAPI):
    Path("data").mkdir(parents=True, exist_ok=True)
    Path("models").mkdir(parents=True, exist_ok=True)
    Base.metadata.create_all(bind=engine)
    ensure_sqlite_columns()
    with SessionLocal() as db:
        disease_repo.seed_default_diseases(db)
        seed_if_empty(db)
    yield


app = FastAPI(title=settings.app_name, version="1.0.0", lifespan=lifespan)

app.include_router(platform_router, prefix=f"{settings.api_prefix}/platform", tags=["Platform·工作台"])
app.include_router(auth_billing_router, prefix=f"{settings.api_prefix}/auth", tags=["账户·登录与PRO"])
app.include_router(diseases_router, prefix=f"{settings.api_prefix}/diseases", tags=["病种库"])
app.include_router(lingxi_modules_router, prefix=f"{settings.api_prefix}/modules", tags=["PMP Agent·核心模块"])

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_allow_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post(f"{settings.api_prefix}/cases", response_model=PetCtInterviewRecord)
def save_case(body: PetCtInterviewRecord, db: Session = Depends(get_db)) -> PetCtInterviewRecord:
    pet_ct_case.upsert_case(db, body)
    return body


@app.get(f"{settings.api_prefix}/cases/{{exam_id}}", response_model=PetCtInterviewRecord)
def get_case(exam_id: str, db: Session = Depends(get_db)) -> PetCtInterviewRecord:
    row = pet_ct_case.get_by_exam_id(db, exam_id)
    if row is None:
        raise HTTPException(status_code=404, detail="exam_id not found")
    return pet_ct_case.orm_to_record(row)


@app.post(f"{settings.api_prefix}/extract_data")
async def extract_data(file: UploadFile | None = File(None)) -> dict:
    extractor = DataExtractor()
    if file is None:
        raise HTTPException(status_code=400, detail="请上传问诊表单图片（multipart file）。")
    suffix = Path(file.filename or "upload").suffix or ".png"
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        content = await file.read()
        tmp.write(content)
        tmp_path = tmp.name
    try:
        return extractor.extract_from_image(tmp_path, source_name=file.filename or "upload")
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    finally:
        Path(tmp_path).unlink(missing_ok=True)


class ResearchRunBody(PetCtInterviewRecord):
    research_topic: str = "PET-CT 代谢特征与临床表型关联研究"


@app.post(f"{settings.api_prefix}/research/run")
def run_research(body: ResearchRunBody) -> dict[str, str]:
    from app.services.research_agent import ResearchAgent

    agent = ResearchAgent()
    patient = body.model_dump(mode="json")
    topic = patient.pop("research_topic", "")
    out = agent.run_research(patient, topic)
    return {"output": out}


@app.post(f"{settings.api_prefix}/petct/analyze")
def analyze_petct(petct_data: dict) -> dict:
    analyzer = PETCTAnalyzer()
    return analyzer.analyze_image(petct_data)


@app.post(f"{settings.api_prefix}/research/projects", response_model=ResearchProjectRead)
def create_research_project(
    body: ResearchProjectCreate, db: Session = Depends(get_db)
) -> ResearchProjectRead:
    row = research_project.create_project(db, body)
    return research_project.to_read(row)


@app.get(f"{settings.api_prefix}/research/projects", response_model=list[ResearchProjectRead])
def list_research_projects(
    skip: int = 0, limit: int = 50, db: Session = Depends(get_db)
) -> list[ResearchProjectRead]:
    rows = research_project.list_projects(db, skip=skip, limit=limit)
    return [research_project.to_read(r) for r in rows]


@app.get("/schema/petct-interview.json")
def interview_json_schema() -> dict:
    return PetCtInterviewRecord.model_json_schema()


@app.get(f"{settings.api_prefix}/demo/sample-interview")
def demo_sample_interview() -> dict:
    """院方演示：返回一份虚构但结构完整的问诊 JSON，可填入前端表单或调用保存接口。"""
    return SAMPLE_INTERVIEW_RECORD


@app.get(f"{settings.api_prefix}/demo/sample-petct-analysis")
def demo_sample_petct_analysis() -> dict:
    """院方演示：无分割权重时的 PET-CT 定量与报告文案样例。"""
    return sample_petct_analysis_demo()


@app.get(f"{settings.api_prefix}/demo/extract-note")
def demo_extract_note() -> dict[str, str]:
    """说明上传图片抽取在演示环境下的行为。"""
    return {"note": SAMPLE_EXTRACT_DEMO_NOTE}


def create_app() -> FastAPI:
    return app
