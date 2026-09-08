"""Research outputs: publication topics and PPT content from workflow context."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from app.models.platform_schemas import (
    PlatformPptGenerateBody,
    PlatformPptGenerateResponse,
    PlatformPublicationTopicsResponse,
    PublicationTopicRow,
    PptSlideOut,
)


def generate_publication_topics(context: dict[str, Any]) -> PlatformPublicationTopicsResponse:
    grade = str(context.get("pathology_grade") or "").strip()
    modality = str(context.get("modality") or "CT").strip()
    dicom_count = int(context.get("dicom_count") or 0)
    radiomics_summary = str(context.get("radiomics_summary") or "").strip()
    auc = context.get("radiomics_auc")

    disease = "腹膜假粘液瘤（PMP）" if any(k in grade + radiomics_summary for k in ("粘液", "PMP", "腹膜")) else "肿瘤"

    existing = [
        PublicationTopicRow(
            title=f"{modality} 影像组学预测{disease}病理分级：一项回顾性研究",
            status="已有类似研究",
            note="PubMed 可检索到 2019–2024 年多篇 CT/MRI Radiomics 分级预测文献",
            relevance=92,
        ),
        PublicationTopicRow(
            title=f"深度学习辅助{disease}病灶检测与分级一致性研究",
            status="已有类似研究",
            note="标注图 + 分级任务在临床验证类论文中较常见",
            relevance=88,
        ),
        PublicationTopicRow(
            title="多模态融合（影像 + 临床）对高级别病变风险分层",
            status="已有类似研究",
            note="联合建模方向发表量高，需突出 PMP 专病队列",
            relevance=85,
        ),
    ]

    novel = [
        PublicationTopicRow(
            title=f"基于 AI 标注病灶图的 {modality} Radiomics 特征与{disease}{grade or '分级'}的关联：单中心队列",
            status="创新方向",
            note=f"结合本次 {dicom_count or '—'} 张 DICOM 标注图与组学建模，强调「标注图 → 特征 → 分级」闭环",
            relevance=96,
        ),
        PublicationTopicRow(
            title=f"{disease}：标注可视化引导 ROI 的影像组学预后模型（{'AUC≈' + str(auc) if auc else '待计算'}）",
            status="创新方向",
            note="市面较少将 DICOM 标注 API 输出直接用于 Radiomics ROI 定义",
            relevance=94,
        ),
        PublicationTopicRow(
            title="PMP 专病库：从 DICOM 上传到科研延伸的多模态智能体工作流验证",
            status="创新方向",
            note="方法学 + 平台工作流论文，适合投医学信息学 / 数字健康期刊",
            relevance=90,
        ),
        PublicationTopicRow(
            title=f"高级别 vs 低级别{disease}：标注热区纹理特征的可解释性分析",
            status="创新方向",
            note="SHAP / Grad-CAM 结合标注图，填补「有标注但缺解释」的空白",
            relevance=87,
        ),
    ]

    summary = "基于当前病例的影像诊断分级与组学建模结果，以下为可发表选题建议。"
    if radiomics_summary:
        summary += f" 组学摘要：{radiomics_summary[:120]}"

    return PlatformPublicationTopicsResponse(
        existing_topics=existing,
        novel_topics=novel,
        summary=summary,
    )


def generate_ppt_content(body: PlatformPptGenerateBody) -> PlatformPptGenerateResponse:
    scenario = body.scenario or "academic"
    title = body.title or "PMP 专病科研汇报"
    grade = body.pathology_grade or "—"
    dicom = body.dicom_count or 0
    radiomics = body.radiomics_summary or "影像组学建模已完成"
    today = datetime.now().strftime("%Y-%m-%d")

    if scenario == "leadership":
        raw_slides = [
            {"page": 1, "title": title, "bullets": ["PMP 专病智能平台汇报", "汇报人：张医生 · 肿瘤内科", today]},
            {"page": 2, "title": "核心结论", "bullets": [f"影像 AI 分级：{grade}", f"已分析 {dicom} 张 DICOM", "已入库病理库 + 影像库", radiomics[:80]]},
            {"page": 3, "title": "科研与转化价值", "bullets": ["可支撑专病库论文与课题申报", "标注图 + 组学结果可复现", "下一步：多中心验证"]},
            {"page": 4, "title": "资源与计划", "bullets": ["需 GPU / 存储扩容（如需）", "建议 3 个月完成外部验证", "申请院级重点专项"]},
        ]
    elif scenario == "government":
        raw_slides = [
            {"page": 1, "title": title, "bullets": ["数字健康 · 医学 AI 应用示范", "腹膜假粘液瘤专病场景", today]},
            {"page": 2, "title": "建设成效", "bullets": ["DICOM 智能分析闭环", f"分级结果：{grade}", "数据安全入库与可追溯", "科研延伸赋能论文产出"]},
            {"page": 3, "title": "社会与卫生效益", "bullets": ["缩短影像诊断等待", "辅助基层同质化诊疗", "支撑区域专病中心建设"]},
            {"page": 4, "title": "下一步建议", "bullets": ["纳入区域卫生信息化示范", "多院联盟数据共享", "标准化 AI 标注接口推广"]},
        ]
    else:
        raw_slides = [
            {"page": 1, "title": title, "bullets": ["Background: PMP imaging AI workflow", f"Grade: {grade}", today]},
            {"page": 2, "title": "Methods", "bullets": [f"DICOM n={dicom}", "External API: annotated lesion PNG", "Radiomics feature selection", "Train/validation split"]},
            {"page": 3, "title": "Results", "bullets": [radiomics[:100], "Annotated visualization examples", "Feature importance ranking"]},
            {"page": 4, "title": "Discussion", "bullets": ["Novelty: API annotation → radiomics ROI", "Limitations: single-center", "Future: external validation"]},
        ]

    return PlatformPptGenerateResponse(
        scenario=scenario,
        title=title,
        slides=[PptSlideOut(page=s["page"], title=s["title"], bullets=s["bullets"]) for s in raw_slides],
        template_note="已按场景生成内容大纲；上传模板后将填充至对应占位页",
    )
