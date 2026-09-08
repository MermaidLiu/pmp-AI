"""Formal literature sources: PubMed E-utilities, local guideline library, institution lit.

Demo seed data is NEVER mixed into production search results.
All returned citations carry DOI/PMID validation status and timestamps.
"""

from __future__ import annotations

import logging
import re
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from typing import Any, Literal

import httpx

from app.core.config import settings
from app.data.guideline_fragments import GUIDELINE_FRAGMENTS

logger = logging.getLogger(__name__)

ValidationStatus = Literal["valid", "invalid", "unchecked", "unavailable"]

# Institution / local literature (real curated entries — not demo seeds for PubMed DOI spoofing)
_INSTITUTION_LITERATURE: list[dict[str, Any]] = [
    {
        "id": "INST-001",
        "title": "院内 PMP 专病队列基线特征与随访报告（内部）",
        "source": "内部文献",
        "year": "2024",
        "doi": "",
        "pmid": "",
        "journal": "院内专病库",
        "keywords": ["pmp", "专病库", "队列", "随访", "腹膜", "假粘液"],
        "url": "",
    },
    {
        "id": "INST-002",
        "title": "腹膜假粘液瘤多学科诊疗路径院内共识纪要",
        "source": "内部文献",
        "year": "2023",
        "doi": "",
        "pmid": "",
        "journal": "院内 MDT",
        "keywords": ["mdt", "诊疗路径", "pmp", "共识"],
        "url": "",
    },
]


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def _normalize_doi(doi: str) -> str:
    s = (doi or "").strip()
    s = re.sub(r"^https?://(dx\.)?doi\.org/", "", s, flags=re.I)
    return s.strip()


def _normalize_pmid(pmid: str) -> str:
    s = (pmid or "").strip()
    if s in ("—", "-", "N/A", "n/a"):
        return ""
    return s


async def validate_pmid(pmid: str) -> dict[str, Any]:
    """Validate PMID via NCBI ESummary. Returns validation payload."""
    pmid = _normalize_pmid(pmid)
    checked_at = _utc_now_iso()
    if not pmid or not pmid.isdigit():
        return {
            "pmid": pmid,
            "status": "invalid" if pmid else "unchecked",
            "checked_at": checked_at,
            "message": "PMID 缺失或格式无效",
        }
    url = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi"
    params = {
        "db": "pubmed",
        "id": pmid,
        "retmode": "json",
        "tool": "DeepAgent",
        "email": getattr(settings, "pubmed_email", "") or "research@localhost",
    }
    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            resp = await client.get(url, params=params)
            resp.raise_for_status()
            data = resp.json()
        result = (data.get("result") or {}).get(pmid)
        if not result or result.get("error"):
            return {
                "pmid": pmid,
                "status": "invalid",
                "checked_at": checked_at,
                "message": "PubMed 未找到该 PMID",
            }
        return {
            "pmid": pmid,
            "status": "valid",
            "checked_at": checked_at,
            "message": "PubMed 校验通过",
            "title": result.get("title") or "",
            "journal": (result.get("fulljournalname") or result.get("source") or ""),
            "year": str((result.get("pubdate") or "")[:4]),
            "doi": _extract_doi_from_esummary(result),
        }
    except Exception as exc:
        logger.warning("PMID validation failed for %s: %s", pmid, exc)
        return {
            "pmid": pmid,
            "status": "unavailable",
            "checked_at": checked_at,
            "message": f"PubMed 校验暂不可用：{exc}",
        }


async def validate_doi(doi: str) -> dict[str, Any]:
    """Validate DOI via doi.org content negotiation (JSON)."""
    doi = _normalize_doi(doi)
    checked_at = _utc_now_iso()
    if not doi or "/" not in doi:
        return {
            "doi": doi,
            "status": "invalid" if doi else "unchecked",
            "checked_at": checked_at,
            "message": "DOI 缺失或格式无效",
        }
    url = f"https://doi.org/{doi}"
    headers = {"Accept": "application/vnd.citationstyles.csl+json"}
    try:
        async with httpx.AsyncClient(timeout=20.0, follow_redirects=True) as client:
            resp = await client.get(url, headers=headers)
            if resp.status_code == 404:
                return {
                    "doi": doi,
                    "status": "invalid",
                    "checked_at": checked_at,
                    "message": "DOI 未解析到有效记录",
                }
            resp.raise_for_status()
            data = resp.json()
        title = ""
        if isinstance(data.get("title"), str):
            title = data["title"]
        elif isinstance(data.get("title"), list) and data["title"]:
            title = str(data["title"][0])
        return {
            "doi": doi,
            "status": "valid",
            "checked_at": checked_at,
            "message": "DOI 校验通过",
            "title": title,
            "year": str((data.get("issued") or {}).get("date-parts", [[""]])[0][0] or ""),
        }
    except Exception as exc:
        logger.warning("DOI validation failed for %s: %s", doi, exc)
        return {
            "doi": doi,
            "status": "unavailable",
            "checked_at": checked_at,
            "message": f"DOI 校验暂不可用：{exc}",
        }


def _extract_doi_from_esummary(result: dict[str, Any]) -> str:
    for item in result.get("articleids") or []:
        if isinstance(item, dict) and item.get("idtype") == "doi":
            return _normalize_doi(str(item.get("value") or ""))
    return ""


async def search_pubmed(query: str, retmax: int = 10) -> list[dict[str, Any]]:
    """Search PubMed via ESearch + ESummary. Returns formal citation records."""
    q = (query or "").strip()
    if not q:
        return []
    tool = "DeepAgent"
    email = getattr(settings, "pubmed_email", "") or "research@localhost"
    base = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils"
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            esearch = await client.get(
                f"{base}/esearch.fcgi",
                params={
                    "db": "pubmed",
                    "term": q,
                    "retmax": retmax,
                    "retmode": "json",
                    "sort": "relevance",
                    "tool": tool,
                    "email": email,
                },
            )
            esearch.raise_for_status()
            ids = (esearch.json().get("esearchresult") or {}).get("idlist") or []
            if not ids:
                return []
            esummary = await client.get(
                f"{base}/esummary.fcgi",
                params={
                    "db": "pubmed",
                    "id": ",".join(ids),
                    "retmode": "json",
                    "tool": tool,
                    "email": email,
                },
            )
            esummary.raise_for_status()
            result = esummary.json().get("result") or {}
    except Exception as exc:
        logger.warning("PubMed search failed: %s", exc)
        return []

    rows: list[dict[str, Any]] = []
    checked_at = _utc_now_iso()
    for i, pmid in enumerate(ids):
        item = result.get(pmid) or {}
        if not item or item.get("error"):
            continue
        doi = _extract_doi_from_esummary(item)
        rows.append(
            {
                "id": f"PMID-{pmid}",
                "title": item.get("title") or f"PMID {pmid}",
                "source": "PubMed",
                "year": str((item.get("pubdate") or "")[:4]),
                "doi": doi,
                "pmid": pmid,
                "journal": item.get("fulljournalname") or item.get("source") or "",
                "relevance": max(50, 98 - i * 3),
                "doi_validation": {
                    "doi": doi,
                    "status": "valid" if doi else "unchecked",
                    "checked_at": checked_at,
                    "message": "随 PubMed ESummary 返回" if doi else "无 DOI",
                },
                "pmid_validation": {
                    "pmid": pmid,
                    "status": "valid",
                    "checked_at": checked_at,
                    "message": "PubMed ESummary 命中",
                },
                "cited_at": checked_at,
                "is_demo": False,
                "verifiable": True,
            }
        )
    return rows


def search_guideline_library(query: str) -> list[dict[str, Any]]:
    """Search local versioned guideline fragments as citable literature entries."""
    tokens = re.findall(r"[\u4e00-\u9fffA-Za-z0-9]+", (query or "").lower())
    checked_at = _utc_now_iso()
    rows: list[dict[str, Any]] = []
    for frag in GUIDELINE_FRAGMENTS:
        blob = " ".join(
            [
                frag["title"],
                frag["section"],
                frag["excerpt"],
                " ".join(frag.get("tags") or []),
            ]
        ).lower()
        score = 40
        for t in tokens:
            if len(t) < 2:
                continue
            if t in blob:
                score += 15
        if score < 50 and tokens:
            continue
        rows.append(
            {
                "id": frag["id"],
                "title": f"{frag['title']} · {frag['section']}",
                "source": "指南/共识",
                "year": (frag.get("published_at") or "")[:4],
                "doi": "",
                "pmid": "",
                "journal": f"版本 {frag['version']}",
                "relevance": min(99, score),
                "doi_validation": {
                    "doi": "",
                    "status": "unchecked",
                    "checked_at": checked_at,
                    "message": "本地指南片段，无 DOI",
                },
                "pmid_validation": {
                    "pmid": "",
                    "status": "unchecked",
                    "checked_at": checked_at,
                    "message": "本地指南片段，无 PMID",
                },
                "cited_at": checked_at,
                "is_demo": False,
                "verifiable": True,
                "guideline_fragment_id": frag["id"],
                "guideline_version": frag["version"],
                "excerpt": frag["excerpt"],
            }
        )
    rows.sort(key=lambda x: -x["relevance"])
    return rows


def search_institution_library(query: str) -> list[dict[str, Any]]:
    tokens = re.findall(r"[\u4e00-\u9fffA-Za-z0-9]+", (query or "").lower())
    checked_at = _utc_now_iso()
    rows: list[dict[str, Any]] = []
    for item in _INSTITUTION_LITERATURE:
        blob = " ".join([item["title"], " ".join(item.get("keywords") or [])]).lower()
        score = 40
        for t in tokens:
            if len(t) < 2:
                continue
            if t in blob:
                score += 14
        if score < 50 and tokens:
            continue
        rows.append(
            {
                "id": item["id"],
                "title": item["title"],
                "source": item["source"],
                "year": item["year"],
                "doi": item.get("doi") or "",
                "pmid": item.get("pmid") or "",
                "journal": item.get("journal") or "院内文献库",
                "relevance": min(95, score),
                "doi_validation": {
                    "doi": item.get("doi") or "",
                    "status": "unchecked",
                    "checked_at": checked_at,
                    "message": "院内文献，通常无 DOI",
                },
                "pmid_validation": {
                    "pmid": item.get("pmid") or "",
                    "status": "unchecked",
                    "checked_at": checked_at,
                    "message": "院内文献，通常无 PMID",
                },
                "cited_at": checked_at,
                "is_demo": False,
                "verifiable": True,
            }
        )
    rows.sort(key=lambda x: -x["relevance"])
    return rows


async def enrich_with_validation(item: dict[str, Any], *, force: bool = False) -> dict[str, Any]:
    """Optionally re-validate DOI/PMID for a citation record."""
    out = dict(item)
    pmid = _normalize_pmid(str(out.get("pmid") or ""))
    doi = _normalize_doi(str(out.get("doi") or ""))
    if pmid and (force or (out.get("pmid_validation") or {}).get("status") != "valid"):
        out["pmid_validation"] = await validate_pmid(pmid)
        if out["pmid_validation"].get("status") == "valid" and not out.get("title"):
            out["title"] = out["pmid_validation"].get("title") or out.get("title")
    if doi and (force or (out.get("doi_validation") or {}).get("status") not in ("valid", "unchecked")):
        out["doi_validation"] = await validate_doi(doi)
    out["cited_at"] = out.get("cited_at") or _utc_now_iso()
    out["is_demo"] = False
    # Verifiable if PubMed/DOI valid OR local guideline/institution with stable id
    pv = (out.get("pmid_validation") or {}).get("status")
    dv = (out.get("doi_validation") or {}).get("status")
    local_ok = out.get("source") in ("指南/共识", "内部文献", "专病库") and bool(out.get("id"))
    out["verifiable"] = pv == "valid" or dv == "valid" or local_ok
    return out


async def formal_literature_search(
    query: str,
    sources: list[str] | None = None,
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    """Production search — never returns demo seed literature."""
    wanted = set(sources or ["PubMed", "指南/共识", "内部文献", "专病库"])
    rows: list[dict[str, Any]] = []
    errors: list[str] = []

    if "PubMed" in wanted:
        pubmed_rows = await search_pubmed(query, retmax=8)
        if not pubmed_rows:
            errors.append("PubMed 无命中或接口暂不可用")
        rows.extend(pubmed_rows)

    if "指南/共识" in wanted:
        rows.extend(search_guideline_library(query))

    if wanted & {"内部文献", "专病库"}:
        rows.extend(search_institution_library(query))

    # Deduplicate by id / pmid
    seen: set[str] = set()
    unique: list[dict[str, Any]] = []
    for r in sorted(rows, key=lambda x: -int(x.get("relevance") or 0)):
        key = r.get("pmid") or r.get("id") or r.get("title")
        if not key or key in seen:
            continue
        seen.add(str(key))
        unique.append(r)

    meta = {
        "mode": "formal",
        "demo_mixed": False,
        "searched_at": _utc_now_iso(),
        "source_errors": errors,
        "hit_count": len(unique),
    }
    return unique, meta
