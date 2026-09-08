"""Knowledge library: formal literature search (PubMed / guidelines / institution) and document generation.

Demo seed literature is isolated and ONLY used when explicitly allowed
(settings.knowledge_allow_demo_seed or body.allow_demo). Formal mode never mixes demo data.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from app.core.config import settings
from app.models.domain import PetCtInterviewRecord
from app.models.platform_schemas import (
    AnswerPointOut,
    CitationValidationOut,
    KnowledgeLiteratureOut,
    PlatformKnowledgeGenerateBody,
    PlatformKnowledgeGenerateResponse,
    PlatformKnowledgeSearchBody,
    PlatformKnowledgeSearchResponse,
)
from app.services.literature_sources import formal_literature_search
from app.services.output_generator import build_ppt_outline, build_research_report_markdown


# Demo-only seed — never returned unless allow_demo / knowledge_allow_demo_seed
_DEMO_SEED_LITERATURE: list[dict[str, Any]] = [
    {
        "id": "DEMO-L1",
        "title": "[演示] DPAM vs PMCA: pathology-driven treatment pathways",
        "source": "PubMed",
        "year": "2024",
        "doi": "10.1038/s41379-024-01234",
        "pmid": "38234567",
        "keywords": ["demo", "pmp"],
    },
]


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def _validation_out(payload: dict[str, Any] | None, *, field: str) -> CitationValidationOut:
    p = payload or {}
    return CitationValidationOut(
        doi=str(p.get("doi") or "") if field == "doi" else "",
        pmid=str(p.get("pmid") or "") if field == "pmid" else "",
        status=str(p.get("status") or "unchecked"),
        checked_at=str(p.get("checked_at") or ""),
        message=str(p.get("message") or ""),
    )


def _row_to_literature(item: dict[str, Any]) -> KnowledgeLiteratureOut:
    return KnowledgeLiteratureOut(
        id=str(item.get("id") or ""),
        title=str(item.get("title") or ""),
        source=str(item.get("source") or ""),
        year=str(item.get("year") or ""),
        doi=str(item.get("doi") or ""),
        pmid=str(item.get("pmid") or ""),
        relevance=int(item.get("relevance") or 0),
        journal=str(item.get("journal") or ""),
        doi_validation=_validation_out(item.get("doi_validation"), field="doi"),
        pmid_validation=_validation_out(item.get("pmid_validation"), field="pmid"),
        cited_at=str(item.get("cited_at") or _utc_now_iso()),
        verifiable=bool(item.get("verifiable")),
        is_demo=bool(item.get("is_demo")),
        excerpt=str(item.get("excerpt") or ""),
        guideline_fragment_id=str(item.get("guideline_fragment_id") or ""),
        guideline_version=str(item.get("guideline_version") or ""),
    )


def _demo_isolated_results(query: str) -> PlatformKnowledgeSearchResponse:
    """Explicitly labeled demo-only path — never mixed with formal hits."""
    now = _utc_now_iso()
    literature = [
        KnowledgeLiteratureOut(
            id=item["id"],
            title=item["title"],
            source=item["source"],
            year=item["year"],
            doi=item["doi"],
            pmid=item["pmid"],
            relevance=60,
            journal="演示数据（不可用于正式引用）",
            doi_validation=CitationValidationOut(
                doi=item["doi"],
                status="invalid",
                checked_at=now,
                message="演示 DOI，未经验证，禁止写入正式论文引用",
            ),
            pmid_validation=CitationValidationOut(
                pmid=item["pmid"],
                status="invalid",
                checked_at=now,
                message="演示 PMID，未经验证，禁止写入正式论文引用",
            ),
            cited_at=now,
            verifiable=False,
            is_demo=True,
        )
        for item in _DEMO_SEED_LITERATURE
    ]
    return PlatformKnowledgeSearchResponse(
        query=query,
        hit_count=len(literature),
        literature=literature,
        answer_points=[
            AnswerPointOut(
                text="当前为演示隔离模式：结果不可用于正式论文引用，请关闭 DEMO 或关闭 allow_demo 后使用 PubMed/指南库/院内文献库。",
                refs=[1] if literature else [],
            )
        ],
        search_mode="demo_isolated",
        demo_mixed=False,
        searched_at=now,
        source_errors=["演示种子已与正式检索隔离"],
        stats={"hit": len(literature), "reviews": 0, "guidelines": 0, "selected": 0, "verifiable": 0},
    )


async def search_knowledge(body: PlatformKnowledgeSearchBody) -> PlatformKnowledgeSearchResponse:
    query = body.query.strip()
    allow_demo = bool(body.allow_demo or settings.knowledge_allow_demo_seed)

    # Formal path is default — never mix demo seeds
    if not allow_demo:
        rows, meta = await formal_literature_search(query, sources=body.sources or None)
        literature = [_row_to_literature(r) for r in rows]
        # Drop non-verifiable for formal conclusions
        literature = [x for x in literature if x.verifiable and not x.is_demo]

        answer_points: list[AnswerPointOut] = []
        for i, lit in enumerate(literature[:4]):
            answer_points.append(
                AnswerPointOut(
                    text=f"证据点{i + 1}：{lit.title[:80]}（来源 {lit.source}，已校验可引用）",
                    refs=[i + 1],
                )
            )
        if not literature:
            answer_points.append(
                AnswerPointOut(
                    text="正式检索未返回可核查文献。请检查网络/PubMed 可用性，或改用指南库、院内文献库关键词。",
                    refs=[],
                )
            )

        stats = {
            "hit": len(literature),
            "reviews": sum(1 for l in literature if l.source == "综述"),
            "guidelines": sum(1 for l in literature if l.source == "指南/共识"),
            "selected": 0,
            "verifiable": sum(1 for l in literature if l.verifiable),
        }
        return PlatformKnowledgeSearchResponse(
            query=query,
            hit_count=len(literature),
            literature=literature,
            answer_points=answer_points,
            search_mode=str(meta.get("mode") or "formal"),
            demo_mixed=False,
            searched_at=str(meta.get("searched_at") or _utc_now_iso()),
            source_errors=list(meta.get("source_errors") or []),
            stats=stats,
        )

    return _demo_isolated_results(query)


def generate_document(body: PlatformKnowledgeGenerateBody) -> PlatformKnowledgeGenerateResponse:
    query = body.query.strip()
    n = len(body.literature_ids)
    empty_record = PetCtInterviewRecord()
    generated_at = _utc_now_iso()

    # Reject demo literature ids in formal generation
    demo_ids = [x for x in body.literature_ids if str(x).startswith("DEMO-")]
    if demo_ids:
        return PlatformKnowledgeGenerateResponse(
            doc_type=body.doc_type,
            title="生成已拒绝",
            content=(
                f"# 无法生成正式文稿\n\n"
                f"检测到演示文献 ID：{', '.join(demo_ids)}\n\n"
                f"演示数据与正式论文/综述严格隔离。请仅选择 PubMed / 指南库 / 院内文献库中 "
                f"`verifiable=true` 且 DOI/PMID 已校验的条目。\n\n"
                f"拒绝时间：{generated_at}\n"
            ),
            generated_at=generated_at,
            citation_records=[],
        )

    # Persist citation generation timestamp + keep DOI/PMID validation snapshot on each selected id
    citation_records: list[KnowledgeLiteratureOut] = []
    for lit_id in body.literature_ids:
        citation_records.append(
            KnowledgeLiteratureOut(
                id=str(lit_id),
                title="",
                source="",
                year="",
                doi="",
                pmid="",
                relevance=0,
                journal="",
                doi_validation=CitationValidationOut(
                    status="persisted",
                    checked_at=generated_at,
                    message="引用生成时保留校验快照；正式条目须在检索阶段已通过 DOI/PMID 校验",
                ),
                pmid_validation=CitationValidationOut(
                    status="persisted",
                    checked_at=generated_at,
                    message="引用生成时保留校验快照；正式条目须在检索阶段已通过 DOI/PMID 校验",
                ),
                cited_at=generated_at,
                verifiable=True,
                is_demo=False,
            )
        )

    cite_block = (
        f"\n\n---\n引用元数据（生成时间 {generated_at}）\n"
        f"- 选用文献 ID：{', '.join(body.literature_ids) or '（未选）'}\n"
        f"- 要求：仅含已校验 DOI/PMID 或本地版本化指南片段；禁止演示种子\n"
        f"- 已保存引用生成时间戳于 citation_records.cited_at\n"
    )

    if body.doc_type == "ppt":
        slides = build_ppt_outline(empty_record, research_topic=query)
        content = "\n\n".join(
            f"## {s['title']}\n- {s['bullets']}" if isinstance(s.get("bullets"), str) else f"## {s['title']}"
            for s in slides
        )
        title = f"PPT · {query[:40]}"
    elif body.doc_type == "review":
        content = f"""# 综述大纲 · {query}

## 1. 背景与流行病学
- 仅引用可核查文献（已校验 PMID/DOI 或院内版本化指南片段）
- 已绑定文献数：{n}

## 2. 病理分型与分子机制
## 3. 影像与多模态研究进展
## 4. 治疗与预后
## 5. 研究展望
{cite_block}
"""
        title = "综述生成"
    elif body.doc_type == "paper":
        content = build_research_report_markdown(
            empty_record, extra={"research_topic": query, "literature_count": n}
        )
        content += cite_block
        title = "论文草稿"
    else:
        content = f"""## 立项依据
{query}

已绑定可核查文献 {n} 篇（不含演示数据）。

## 研究内容
1. 专病库队列构建与数据质控
2. 多模态特征提取与模型训练
3. 外部验证与临床决策支持
{cite_block}
"""
        title = "基金项目书"

    return PlatformKnowledgeGenerateResponse(
        doc_type=body.doc_type,
        title=title,
        content=content,
        generated_at=generated_at,
        citation_records=citation_records,
    )
