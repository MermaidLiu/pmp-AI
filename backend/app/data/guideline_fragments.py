"""Local versioned guideline fragments for MDT treatment draft evidence cards.

These are curated, version-locked excerpts (not free-text guideline names).
Each fragment can be cited by id + version in treatment recommendations.
"""

from __future__ import annotations

from typing import Any


# Local institutional guideline fragment library (versioned).
GUIDELINE_FRAGMENTS: list[dict[str, Any]] = [
    {
        "id": "GF-CSCO-PMP-2023-01",
        "guideline_id": "CSCO-PMP-2023",
        "title": "腹膜假粘液瘤诊疗中国专家共识（2023）",
        "version": "2023.1",
        "section": "3.2 低级别（DPAM/LAMN）手术原则",
        "excerpt": "低级别黏液性肿瘤以完整切除为目标，在保证肿瘤学安全的前提下可考虑保留器官功能的保守性手术；术后需规范化随访。",
        "source_type": "指南/共识",
        "published_at": "2023-06-01",
        "applies_to_grades": ["低级别"],
        "tags": ["手术", "低级别", "器官保留"],
    },
    {
        "id": "GF-CSCO-PMP-2023-02",
        "guideline_id": "CSCO-PMP-2023",
        "title": "腹膜假粘液瘤诊疗中国专家共识（2023）",
        "version": "2023.1",
        "section": "3.3 高级别（PMCA）综合治疗",
        "excerpt": "高级别病变建议多学科讨论后制定以 CRS±HIPEC 及系统治疗为主的综合方案；化疗方案需个体化评估获益与毒性。",
        "source_type": "指南/共识",
        "published_at": "2023-06-01",
        "applies_to_grades": ["高级别"],
        "tags": ["MDT", "CRS", "HIPEC", "系统治疗"],
    },
    {
        "id": "GF-CSCO-PMP-2023-03",
        "guideline_id": "CSCO-PMP-2023",
        "title": "腹膜假粘液瘤诊疗中国专家共识（2023）",
        "version": "2023.1",
        "section": "4.1 随访监测",
        "excerpt": "高级别患者建议每 3 个月影像及肿瘤标志物监测；低级别可每 6 个月随访，关注进展为高级别的信号。",
        "source_type": "指南/共识",
        "published_at": "2023-06-01",
        "applies_to_grades": ["高级别", "低级别", "未确定"],
        "tags": ["随访", "标志物", "影像"],
    },
    {
        "id": "GF-NCCN-PSM-2024-01",
        "guideline_id": "NCCN-PSM-2024",
        "title": "NCCN Guidelines · Peritoneal Surface Malignancies",
        "version": "2024.2",
        "section": "Principles of Surgery / Systemic Therapy",
        "excerpt": "Treatment decisions for peritoneal surface malignancies should be individualized after MDT review; cytoreductive surgery with or without HIPEC may be considered in selected patients.",
        "source_type": "指南/共识",
        "published_at": "2024-03-15",
        "applies_to_grades": ["高级别", "低级别", "未确定"],
        "tags": ["MDT", "CRS", "HIPEC"],
    },
    {
        "id": "GF-WHO-5TH-01",
        "guideline_id": "WHO-DIGESTIVE-5TH",
        "title": "WHO Classification of Tumours · Digestive System Tumours (5th ed.)",
        "version": "5th",
        "section": "Appendiceal mucinous neoplasms · Grading",
        "excerpt": "Histologic grade (low vs high) is a critical determinant of prognosis and therapy selection; indeterminate grade warrants additional pathology workup before definitive treatment planning.",
        "source_type": "指南/共识",
        "published_at": "2019-01-01",
        "applies_to_grades": ["未确定", "高级别", "低级别"],
        "tags": ["分级", "病理"],
    },
    {
        "id": "GF-INST-PMP-PATH-01",
        "guideline_id": "INST-PMP-SOP-2024",
        "title": "院内 PMP 多学科诊疗 SOP",
        "version": "2024.4",
        "section": "病理未定级时的处置",
        "excerpt": "影像 AI 或初步报告分级未确定时，应补充免疫组化（Ki-67、p53 等）及必要时分子检测，并提交 MDT 确认后再启动根治性系统治疗。",
        "source_type": "院内规范",
        "published_at": "2024-04-01",
        "applies_to_grades": ["未确定"],
        "tags": ["病理补充", "MDT", "IHC"],
    },
]


def get_fragment(fragment_id: str) -> dict[str, Any] | None:
    for item in GUIDELINE_FRAGMENTS:
        if item["id"] == fragment_id:
            return item
    return None


def fragments_for_grade(grade_label: str) -> list[dict[str, Any]]:
    grade = grade_label or "未确定"
    matched = [f for f in GUIDELINE_FRAGMENTS if grade in f.get("applies_to_grades", [])]
    return matched or [f for f in GUIDELINE_FRAGMENTS if "未确定" in f.get("applies_to_grades", [])]


def fragment_citation(fragment: dict[str, Any]) -> dict[str, Any]:
    """Serializable citation pointer for evidence cards."""
    return {
        "fragment_id": fragment["id"],
        "guideline_id": fragment["guideline_id"],
        "title": fragment["title"],
        "version": fragment["version"],
        "section": fragment["section"],
        "excerpt": fragment["excerpt"],
        "source_type": fragment.get("source_type", "指南/共识"),
        "published_at": fragment.get("published_at", ""),
    }
