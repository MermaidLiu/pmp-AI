"""Privacy-preserving ToolUniverse bridge for scientific evidence retrieval.

ToolUniverse is used as the AI4S tool layer, not as a patient-record transport.
Only a small de-identified disease/gene/grade query crosses this boundary.
"""

from __future__ import annotations

import asyncio
import logging
from typing import Any

from app.core.config import settings
from app.models.domain import PetCtInterviewRecord

logger = logging.getLogger(__name__)


def deidentified_research_query(record: PetCtInterviewRecord, grade_label: str = "") -> str:
    """Return scientific terms only; deliberately exclude direct identifiers/history."""
    rx = record.research_extensions
    disease = (rx.primary_disease_name or record.interview_info.clinical_diagnosis or "PMP").strip()
    genes = [str(v) for k, v in (rx.lab_snapshot or {}).items() if any(x in k.lower() for x in ("gene", "kras", "gans", "braf", "egfr")) and v]
    terms = [disease[:120], (grade_label or rx.pathology_grade or "未确定")]
    if genes:
        terms.append(" ".join(genes[:4])[:120])
    return " ".join(x for x in terms if x)


def _run_tooluniverse(query: str) -> tuple[list[str], bool]:
    if not settings.tooluniverse_enabled:
        return ["ToolUniverse 已由部署配置关闭。"], False
    try:
        from tooluniverse import ToolUniverse  # type: ignore[import-not-found]

        tu = ToolUniverse()
        tool_name = settings.tooluniverse_literature_tool
        # Tool_Finder_Keyword is the compact, version-stable discovery entrypoint.
        result = tu.run({"name": tool_name, "arguments": {"description": query, "limit": 5}})
        text = str(result).replace("\n", " ").strip()
        return ([f"ToolUniverse({tool_name})：{text[:900]}"] if text else ["ToolUniverse 未返回匹配工具。"], True)
    except ImportError:
        return ["ToolUniverse 未安装；已跳过外部 AI4S 工具检索。"], False
    except Exception as exc:  # external tools must never break clinical workflow
        logger.warning("ToolUniverse query failed: %s", exc)
        return [f"ToolUniverse 检索不可用：{str(exc)[:180]}"], False


async def scientific_context(record: PetCtInterviewRecord, grade_label: str = "") -> tuple[list[str], bool]:
    query = deidentified_research_query(record, grade_label)
    context, used = await asyncio.to_thread(_run_tooluniverse, query)
    return [f"脱敏科研查询：{query}", *context], used


