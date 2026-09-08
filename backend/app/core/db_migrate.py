"""Lightweight SQLite column adds for existing deployments (create_all does not alter)."""

from __future__ import annotations

from sqlalchemy import inspect, text

from app.core.config import settings
from app.core.database import engine


def ensure_sqlite_columns() -> None:
    if not settings.database_url.startswith("sqlite"):
        return
    insp = inspect(engine)
    if not insp.has_table("pet_ct_cases"):
        return
    cols = {c["name"] for c in insp.get_columns("pet_ct_cases")}
    alters: list[str] = []
    if "disease_id" not in cols:
        alters.append("ALTER TABLE pet_ct_cases ADD COLUMN disease_id INTEGER")
    if "patient_internal_id" not in cols:
        alters.append("ALTER TABLE pet_ct_cases ADD COLUMN patient_internal_id VARCHAR(64) DEFAULT ''")
    if "research_extensions" not in cols:
        alters.append("ALTER TABLE pet_ct_cases ADD COLUMN research_extensions TEXT DEFAULT '{}'")
    if not alters:
        return
    with engine.begin() as conn:
        for stmt in alters:
            conn.execute(text(stmt))
