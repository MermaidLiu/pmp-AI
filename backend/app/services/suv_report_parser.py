"""从影像/报告文本中抽取 SUV、MTV、TLG 等定量描述（规则 + 正则，可接 LLM）。"""

from __future__ import annotations

import re
from typing import Any

from app.models.domain import PetCtImageMetrics, PetCtLesionItem


_SUVMAX_PATTERNS = [
    re.compile(r"SUVmax\s*[=：:]\s*([0-9]+\.?[0-9]*)", re.I),
    re.compile(r"SUV\s*max\s*[=：:]\s*([0-9]+\.?[0-9]*)", re.I),
    re.compile(r"最大(?:标准摄取值|SUV)\s*[=：:]?\s*([0-9]+\.?[0-9]*)", re.I),
]
_SUVMEAN_PATTERNS = [
    re.compile(r"SUVmean\s*[=：:]\s*([0-9]+\.?[0-9]*)", re.I),
    re.compile(r"平均SUV\s*[=：:]?\s*([0-9]+\.?[0-9]*)", re.I),
]
_MTV_PATTERNS = [
    re.compile(r"MTV\s*[=：:]\s*([0-9]+\.?[0-9]*)\s*(?:mL|ml|毫升)?", re.I),
    re.compile(r"代谢体积\s*[=：:]?\s*([0-9]+\.?[0-9]*)", re.I),
]
_TLG_PATTERNS = [
    re.compile(r"TLG\s*[=：:]\s*([0-9]+\.?[0-9]*)", re.I),
    re.compile(r"总糖酵解量\s*[=：:]?\s*([0-9]+\.?[0-9]*)", re.I),
]


def _first_float(patterns: list[re.Pattern[str]], text: str) -> float | None:
    for p in patterns:
        m = p.search(text)
        if m:
            try:
                return float(m.group(1))
            except ValueError:
                return None
    return None


def extract_global_metrics_from_text(text: str) -> PetCtImageMetrics:
    if not text:
        return PetCtImageMetrics()
    return PetCtImageMetrics(
        suv_max=_first_float(_SUVMAX_PATTERNS, text),
        suv_mean=_first_float(_SUVMEAN_PATTERNS, text),
        mtv=_first_float(_MTV_PATTERNS, text),
        tlg=_first_float(_TLG_PATTERNS, text),
    )


_LESION_LINE = re.compile(
    r"(?P<region>[\u4e00-\u9fffA-Za-z0-9、，,\s\-]{2,40}?)[：:，,]\s*SUVmax\s*[=：:]?\s*(?P<suv>[0-9]+\.?[0-9]*)",
    re.I,
)


def extract_lesion_lines(text: str) -> list[PetCtLesionItem]:
    items: list[PetCtLesionItem] = []
    for m in _LESION_LINE.finditer(text or ""):
        try:
            suv = float(m.group("suv"))
        except ValueError:
            continue
        region = (m.group("region") or "").strip().strip("，,")
        if region:
            items.append(PetCtLesionItem(organ_or_region=region, suv_max=suv))
    return items


def merge_metrics_into_extensions(extensions_dict: dict[str, Any], narrative: str) -> dict[str, Any]:
    g = extract_global_metrics_from_text(narrative).model_dump()
    cur = extensions_dict.get("global_quant") or {}
    merged_global = {k: cur.get(k) or g.get(k) for k in ("suv_max", "suv_mean", "mtv", "tlg")}
    extensions_dict = {**extensions_dict, "global_quant": merged_global}
    if narrative and not extensions_dict.get("pet_ct_report_narrative"):
        extensions_dict["pet_ct_report_narrative"] = narrative
    existing = extensions_dict.get("lesions") or []
    if narrative and not existing:
        extensions_dict["lesions"] = [x.model_dump() for x in extract_lesion_lines(narrative)]
    return extensions_dict
