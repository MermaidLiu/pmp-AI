from __future__ import annotations

from typing import Any

from sqlalchemy.orm import Session

from app.repositories import pet_ct_case


def _gq(row: Any) -> dict[str, Any]:
    return (row.research_extensions or {}).get("global_quant") or {}


def compare_exams(db: Session, exam_id_baseline: str, exam_id_followup: str) -> dict[str, Any]:
    ra = pet_ct_case.get_by_exam_id(db, exam_id_baseline)
    rb = pet_ct_case.get_by_exam_id(db, exam_id_followup)
    if ra is None or rb is None:
        missing = []
        if ra is None:
            missing.append(exam_id_baseline)
        if rb is None:
            missing.append(exam_id_followup)
        return {"ok": False, "missing_exam_ids": missing}
    ga, gb = _gq(ra), _gq(rb)
    delta: dict[str, float | None] = {}
    for k in ("suv_max", "suv_mean", "mtv", "tlg"):
        va, vb = ga.get(k), gb.get(k)
        try:
            if va is not None and vb is not None:
                delta[k] = float(vb) - float(va)
            else:
                delta[k] = None
        except (TypeError, ValueError):
            delta[k] = None
    return {
        "ok": True,
        "baseline_exam_id": exam_id_baseline,
        "followup_exam_id": exam_id_followup,
        "baseline_global_quant": ga,
        "followup_global_quant": gb,
        "delta": delta,
        "baseline_lesions": (ra.research_extensions or {}).get("lesions") or [],
        "followup_lesions": (rb.research_extensions or {}).get("lesions") or [],
    }
