"""Treatment evidence cards: MDT draft recommendations linked to guideline fragments + patient evidence."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from app.data.guideline_fragments import (
    fragment_citation,
    fragments_for_grade,
    get_fragment,
)
from app.models.domain import PetCtInterviewRecord
from app.models.platform_schemas import PathologyImagingGradeResult


DRAFT_STATUS = "MDT待确认草案"


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def collect_patient_evidence(
    imaging: PathologyImagingGradeResult,
    record: PetCtInterviewRecord,
    *,
    grade_label: str,
    api_conclusion: str,
    pci: dict[str, Any],
) -> list[dict[str, Any]]:
    """Structured patient-side evidence pointers for each card to cite."""
    evidence: list[dict[str, Any]] = []
    if api_conclusion:
        evidence.append(
            {
                "id": "PE-API-CONCLUSION",
                "kind": "imaging_conclusion",
                "label": "CT 接口病理/PCI 结论",
                "value": api_conclusion[:400],
                "source": "pathology_imaging_api",
            }
        )
    if grade_label:
        evidence.append(
            {
                "id": "PE-GRADE",
                "kind": "pathology_grade",
                "label": "推断组织学分级",
                "value": grade_label,
                "source": "care_pathway",
            }
        )
    if pci.get("pci_score") is not None:
        evidence.append(
            {
                "id": "PE-PCI-SCORE",
                "kind": "pci_score",
                "label": "PCI 总分",
                "value": f"{pci.get('pci_score')}/36",
                "source": "pci_api",
            }
        )
    if pci.get("is_positive") is not None:
        rate = pci.get("positive_rate")
        rate_txt = ""
        if rate is not None:
            try:
                r = float(rate)
                rate_txt = f"（阳性概率 {r * 100 if r <= 1 else r:.0f}%）"
            except (TypeError, ValueError):
                rate_txt = ""
        evidence.append(
            {
                "id": "PE-PCI-POS",
                "kind": "pci_positive",
                "label": "PCI 阴阳性",
                "value": f"{'阳性' if pci.get('is_positive') else '阴性'}{rate_txt}",
                "source": "pci_api",
            }
        )
    iv = record.interview_info
    if iv.clinical_diagnosis:
        evidence.append(
            {
                "id": "PE-CLINICAL-DX",
                "kind": "clinical_diagnosis",
                "label": "临床诊断",
                "value": iv.clinical_diagnosis,
                "source": "workflow_case",
            }
        )
    rx = record.research_extensions
    lab = rx.lab_snapshot or {}
    for key in ("CEA", "CA125", "CA19-9", "治疗方式", "第几次手术", "是否静脉化疗", "CC评分"):
        val = lab.get(key)
        if val:
            evidence.append(
                {
                    "id": f"PE-LAB-{key}",
                    "kind": "lab_or_treatment",
                    "label": key,
                    "value": str(val),
                    "source": "clinical_dataset",
                }
            )
    return evidence


# Template: recommendation text + preferred guideline fragment ids + which patient evidence ids to attach
_CARD_TEMPLATES: dict[str, list[dict[str, Any]]] = {
    "高级别": [
        {
            "recommendation": "提交 MDT：制定以 CRS±HIPEC 及系统治疗为主的综合方案，化疗获益需个体化评估",
            "fragment_ids": ["GF-CSCO-PMP-2023-02", "GF-NCCN-PSM-2024-01"],
            "patient_evidence_ids": ["PE-GRADE", "PE-API-CONCLUSION", "PE-PCI-SCORE"],
            "priority": "首选草案",
        },
        {
            "recommendation": "高级别随访：每 3 个月影像及肿瘤标志物监测，关注复发转移",
            "fragment_ids": ["GF-CSCO-PMP-2023-03"],
            "patient_evidence_ids": ["PE-GRADE", "PE-LAB-CEA", "PE-LAB-CA125", "PE-LAB-CA19-9"],
            "priority": "随访草案",
        },
        {
            "recommendation": "完善可切除性与残留病灶评估后，再决定手术范围与系统治疗时序",
            "fragment_ids": ["GF-NCCN-PSM-2024-01"],
            "patient_evidence_ids": ["PE-PCI-SCORE", "PE-PCI-POS", "PE-CLINICAL-DX"],
            "priority": "备选草案",
        },
    ],
    "低级别": [
        {
            "recommendation": "评估手术范围：低级别病变可考虑保留器官功能的保守性手术",
            "fragment_ids": ["GF-CSCO-PMP-2023-01", "GF-NCCN-PSM-2024-01"],
            "patient_evidence_ids": ["PE-GRADE", "PE-API-CONCLUSION", "PE-PCI-SCORE"],
            "priority": "首选草案",
        },
        {
            "recommendation": "低级别以手术为主，系统化疗获益有限，需个体化评估后提交 MDT 确认",
            "fragment_ids": ["GF-CSCO-PMP-2023-01", "GF-WHO-5TH-01"],
            "patient_evidence_ids": ["PE-GRADE", "PE-CLINICAL-DX"],
            "priority": "备选草案",
        },
        {
            "recommendation": "定期随访：每 6 个月影像及标志物监测，关注进展为高级别的信号",
            "fragment_ids": ["GF-CSCO-PMP-2023-03"],
            "patient_evidence_ids": ["PE-GRADE", "PE-LAB-CEA", "PE-LAB-CA125"],
            "priority": "随访草案",
        },
    ],
    "未确定": [
        {
            "recommendation": "补充病理免疫组化（Ki-67、p53 等）及必要时分子检测，明确分级后再制定根治方案",
            "fragment_ids": ["GF-INST-PMP-PATH-01", "GF-WHO-5TH-01"],
            "patient_evidence_ids": ["PE-GRADE", "PE-API-CONCLUSION"],
            "priority": "首选草案",
        },
        {
            "recommendation": "多学科会诊明确分级与可切除性后再启动系统治疗，避免不可逆过度治疗",
            "fragment_ids": ["GF-INST-PMP-PATH-01", "GF-NCCN-PSM-2024-01"],
            "patient_evidence_ids": ["PE-PCI-SCORE", "PE-CLINICAL-DX"],
            "priority": "MDT 草案",
        },
        {
            "recommendation": "完善影像随访基线：记录 PCI 与标志物，待分级确认后按共识调整间隔",
            "fragment_ids": ["GF-CSCO-PMP-2023-03"],
            "patient_evidence_ids": ["PE-PCI-SCORE", "PE-PCI-POS", "PE-LAB-CEA"],
            "priority": "随访草案",
        },
    ],
}


def build_evidence_cards(
    *,
    grade_label: str,
    patient_evidence: list[dict[str, Any]],
    llm_lines: list[str] | None = None,
) -> list[dict[str, Any]]:
    """Build MDT draft evidence cards. LLM lines only refine text; evidence links stay local+patient."""
    grade = grade_label if grade_label in _CARD_TEMPLATES else "未确定"
    templates = _CARD_TEMPLATES[grade]
    pe_by_id = {e["id"]: e for e in patient_evidence}
    available_fragments = {f["id"]: f for f in fragments_for_grade(grade)}
    # Also allow any fragment referenced in templates
    for t in templates:
        for fid in t["fragment_ids"]:
            frag = get_fragment(fid)
            if frag:
                available_fragments[fid] = frag

    cards: list[dict[str, Any]] = []
    generated_at = _utc_now_iso()
    for i, tmpl in enumerate(templates):
        text = tmpl["recommendation"]
        if llm_lines and i < len(llm_lines) and len(llm_lines[i]) > 8:
            # Keep LLM wording but never drop evidence linkage
            text = llm_lines[i].strip()

        guideline_refs = []
        for fid in tmpl["fragment_ids"]:
            frag = available_fragments.get(fid) or get_fragment(fid)
            if frag:
                guideline_refs.append(fragment_citation(frag))

        pe_refs = []
        for eid in tmpl["patient_evidence_ids"]:
            if eid in pe_by_id:
                pe_refs.append(pe_by_id[eid])
        # Always attach grade + conclusion if present
        for required in ("PE-GRADE", "PE-API-CONCLUSION"):
            if required in pe_by_id and pe_by_id[required] not in pe_refs:
                pe_refs.append(pe_by_id[required])

        cards.append(
            {
                "id": f"EC-{grade}-{i + 1}",
                "status": DRAFT_STATUS,
                "priority": tmpl["priority"],
                "recommendation": text,
                "guideline_fragments": guideline_refs,
                "patient_evidence": pe_refs,
                "generated_at": generated_at,
                "requires_mdt_confirmation": True,
            }
        )
    return cards


def cards_to_legacy_lines(cards: list[dict[str, Any]]) -> list[str]:
    return [str(c.get("recommendation") or "").strip() for c in cards if c.get("recommendation")]


def unique_guideline_titles(cards: list[dict[str, Any]]) -> list[str]:
    seen: set[str] = set()
    out: list[str] = []
    for card in cards:
        for g in card.get("guideline_fragments") or []:
            label = f"{g.get('title')}（v{g.get('version')} · {g.get('section')}）"
            if label not in seen:
                seen.add(label)
                out.append(label)
    return out
