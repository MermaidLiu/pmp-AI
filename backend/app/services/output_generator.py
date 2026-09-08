"""成果转化：科研报告 / PPT 提纲 / 疑难病例复盘（可接模板引擎与 LLM）。"""

from __future__ import annotations

from typing import Any

from app.models.domain import PetCtInterviewRecord


def build_research_report_markdown(record: PetCtInterviewRecord, extra: dict[str, Any] | None = None) -> str:
    ex = extra or {}
    p = record.patient_base_info
    iv = record.interview_info
    rx = record.research_extensions
    lines = [
        "# PMP Agent · 病例科研摘要报告",
        "",
        "## 基本信息",
        f"- 检查号：{p.exam_id}",
        f"- 病历号：{p.medical_record_id or '-'}",
        f"- 患者归并 ID：{rx.patient_internal_id or p.medical_record_id or '-'}",
        f"- 科室：{p.department}",
        "",
        "## 病种与 PET 分型",
        f"- 病种：{rx.primary_disease_name}（{rx.primary_disease_code}）",
        f"- 代谢表型标签：{', '.join(rx.pet_ct_phenotype_tags) or '—'}",
        "",
        "## 临床与检验",
        f"- 诊断摘要：{iv.clinical_diagnosis}",
        f"- 简要病史：{iv.brief_medical_history}",
        f"- 肌酐 / 尿素氮：{iv.creatinine} / {iv.urea_nitrogen}",
        f"- 检验快照：{rx.lab_snapshot}",
        f"- 甲功结构化：{rx.thyroid_panel_structured.model_dump()}",
        "",
        "## PET-CT 与定量",
        f"- 报告摘录：{rx.pet_ct_report_narrative or rx.imaging_report_text or '—'}",
        f"- 全局 SUV/MTV/TLG：{rx.global_quant.model_dump()}",
        f"- 病灶列表：{[x.model_dump() for x in rx.lesions]}",
        "",
        "## 发热待查要点",
        f"{rx.fuo_profile.model_dump()}",
        "",
        "## 附录",
        f"- 科研人员选定方向：{ex.get('research_directions', '—')}",
        f"- 队列挖掘提示：{ex.get('cohort_hint', '—')}",
        f"- 智能体蒸馏：{ex.get('distill', '—')}",
    ]
    if ex.get("generate_review"):
        lines.extend(
            [
                "",
                "## 综述草稿（占位，可接 PubMed / 院内知识库检索润色）",
                f"- 综述主题：{ex.get('review_topic', '—')}",
                f"- 与病种衔接：{rx.primary_disease_name}（{rx.primary_disease_code}）",
                "- 建议结构：背景 → 病理与影像表型 → PET 定量指标 → 队列与随访证据 → 空白与展望",
            ]
        )
    return "\n".join(lines)


def build_ppt_outline(record: PetCtInterviewRecord, research_topic: str | None = None) -> list[dict[str, str]]:
    p = record.patient_base_info
    rx = record.research_extensions
    topic_line = research_topic or f"{rx.primary_disease_name or '病例'} · PET-CT 科研价值"
    return [
        {"title": "封面", "bullets": f"{topic_line} · {p.exam_id} · {p.department}"},
        {"title": "研究背景与方向", "bullets": "病种特征 + 临床问题 + 拟定贡献点"},
        {"title": "病史与实验室", "bullets": "主诉 / 炎症与代谢指标 / 甲状腺与肾功能"},
        {"title": "PET-CT 与病理衔接", "bullets": "SUVmax / MTV / TLG + 高代谢灶与病理对照思路"},
        {"title": "队列、随访与统计", "bullets": "纳入标准 · 结局变量 · 多次显像对比"},
        {"title": "结论与转化", "bullets": "论文 / 专利 / 指南证据链占位"},
    ]


def build_difficult_case_review(record: PetCtInterviewRecord) -> dict[str, Any]:
    iv = record.interview_info
    rx = record.research_extensions
    return {
        "title": f"疑难病例复盘 · {record.patient_base_info.exam_id}",
        "clinical_puzzle": iv.clinical_diagnosis or "（待补充）",
        "imaging_angle": rx.pet_ct_report_narrative or rx.imaging_report_text or "（待补充影像结论）",
        "lab_angle": rx.lab_snapshot,
        "proposed_next_steps": [
            "完善感染与自身免疫血清学时间轴",
            "标注所有高代谢灶与解剖分区",
            "纳入科室队列做组间 SUV/MTV 比较",
        ],
    }
