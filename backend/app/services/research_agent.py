"""LangChain research agent: statistics, literature stub, paper draft tools."""

from __future__ import annotations

import json
import os
from typing import Any

from app.core.config import settings
from app.demo_fixtures import build_offline_demo_report
from app.models.domain import PetCtInterviewRecord
from app.services.pathology_grader import analyze_case, correlate_clinical_indicators, recommend_literature


def _patient_summary(patient_data: dict[str, Any]) -> str:
    try:
        return json.dumps(patient_data, ensure_ascii=False, indent=2)[:12000]
    except TypeError:
        return str(patient_data)[:12000]


def statistical_analysis(data: str, research_topic: str) -> str:
    """对 PET-CT 相关结构化患者数据进行描述性统计摘要（可对接 pandas/scipy 扩展）。"""
    try:
        payload = json.loads(data) if data.strip().startswith("{") else {"raw": data}
    except json.JSONDecodeError:
        payload = {"raw": data}
    base = (payload.get("patient_base_info") or {}) if isinstance(payload, dict) else {}
    lines = [
        f"研究主题: {research_topic}",
        f"样本字段摘要: 年龄={base.get('age')}, 性别={base.get('gender')}, 科室={base.get('department')}",
        "统计模块占位：可接入 pandas.DataFrame 描述统计、t 检验、卡方、生存分析（lifelines）等。",
    ]
    return "\n".join(lines)


def pathology_grading(data: str) -> str:
    """对病例输出诊断结果：综合临床诊断、PET 报告与代谢指标，给出高级别/低级别判定及依据。"""
    try:
        payload = json.loads(data) if data.strip().startswith("{") else {}
        record = PetCtInterviewRecord.model_validate(payload)
    except (json.JSONDecodeError, Exception):
        return "无法解析病例 JSON，请提供完整的 PetCtInterviewRecord 结构。"
    result = analyze_case(record)
    g = result.grading
    lines = [
        f"【诊断结果】病理分级 {g.grade_label}（WHO {g.who_grade}）",
        f"综合评分：{g.composite_score} 分（{g.score_level}）",
        f"评分明细：{g.score_breakdown}",
        f"判定体系：{g.grade_system}",
        "证据：" + "；".join(g.evidence) if g.evidence else "证据：待补充",
        f"诊断摘要：{result.diagnosis_summary}",
    ]
    if g.biomarkers_suggested:
        lines.append(f"建议补充标志物：{', '.join(g.biomarkers_suggested)}")
    return "\n".join(lines)


def treatment_recommendations(data: str) -> str:
    """根据诊断结果给出治疗推荐与指南参考。"""
    try:
        payload = json.loads(data) if data.strip().startswith("{") else {}
        record = PetCtInterviewRecord.model_validate(payload)
    except (json.JSONDecodeError, Exception):
        return "无法解析病例 JSON。"
    result = analyze_case(record)
    t = result.treatment
    lines = [f"【治疗推荐 · {t.grade_label}】", f"MDT 建议：{'是' if t.mdt_recommended else '否'}"]
    lines.extend([f"- {r}" for r in t.recommendations])
    lines.append(f"指南参考：{', '.join(t.guideline_refs)}")
    return "\n".join(lines)


def clinical_correlation(indicators_json: str, disease_context: str = "") -> str:
    """分析医生输入的临床指标与诊断结果的可能相关性，并推荐文献。"""
    try:
        indicators = json.loads(indicators_json) if indicators_json.strip().startswith("{") else {}
    except json.JSONDecodeError:
        indicators = {"raw": indicators_json}
    result = correlate_clinical_indicators(indicators, disease_context)
    lines = ["【临床指标相关性】"]
    for f in result.correlated_factors:
        lines.append(
            f"- {f.get('indicator')}: {f.get('correlation')}（强度 {f.get('strength')}）"
            f" 值={f.get('input_value', '—')}"
        )
    if result.analysis_suggestions:
        lines.append("建议：" + "；".join(result.analysis_suggestions))
    if result.literature:
        lines.append("推荐文献：" + "；".join(x["title"] for x in result.literature[:3]))
    return "\n".join(lines) if len(lines) > 1 else "未检出已知相关性，请补充更多指标或入库更多病例。"


def literature_research(research_topic: str) -> str:
    """检索诊断结果相关文献；可按高级别/低级别主题推荐指南与综述。"""
    grade = "高级别" if "高" in research_topic else "低级别" if "低" in research_topic else "通用"
    refs = recommend_literature(grade, research_topic)
    lines = [f"关于「{research_topic}」的文献推荐（PMP Agent 知识库）："]
    for r in refs[:6]:
        lines.append(f"- {r['title']} ({r['journal']}, {r['year']})")
    lines.append("可对接 PubMed E-utilities、Semantic Scholar、CNKI 等 API 扩展实时检索。")
    return "\n".join(lines)


def knowledge_distillation(data: str) -> str:
    """对结构化 JSON 做科研知识蒸馏：提炼暴露（如 SUV/MTV）、结局（如退热/病理确诊）与混杂因素。"""
    try:
        payload = json.loads(data) if data.strip().startswith("{") else {}
    except json.JSONDecodeError:
        payload = {}
    rx = payload.get("research_extensions") or {}
    iv = payload.get("interview_info") or {}
    lines = [
        "【蒸馏要点】",
        f"- 病种线索：{rx.get('primary_disease_name') or iv.get('clinical_diagnosis')}",
        f"- PET 表型标签：{rx.get('pet_ct_phenotype_tags')}",
        f"- 关键检验：{rx.get('lab_snapshot')}",
        f"- 甲功结构：{rx.get('thyroid_panel_structured')}",
        f"- 发热待查画像：{rx.get('fuo_profile')}",
        "- 建议结局变量：退热时间、病理/基因确诊、激素减量后复发等（按队列定义）。",
    ]
    return "\n".join(lines)


def cohort_mining_suggestions(data: str, research_topic: str) -> str:
    """队列挖掘：根据字段分布建议纳排标准、分层变量与统计模型。"""
    return (
        f"【队列挖掘 · {research_topic}】\n"
        "- 纳入：同一病种编码 + 完整 PET 定量（SUVmax/MTV/TLG 至少一项）+ 肌酐/尿素氮记录。\n"
        "- 排除：显像剂过敏未完成检查、图像严重运动伪影。\n"
        "- 分层：按代谢表型标签、甲状腺轴、肾功能分层。\n"
        "- 模型：线性/秩和检验比较连续 SUV；逻辑回归关联退热/确诊；Cox 若定义时间-事件结局。\n"
    )


def auto_topic_selector(data: str) -> str:
    """自动选题：输出 3 个可执行的回顾性研究方向（中文）。"""
    try:
        payload = json.loads(data) if data.strip().startswith("{") else {}
    except json.JSONDecodeError:
        payload = {}
    dx = (payload.get("interview_info") or {}).get("clinical_diagnosis") or "目标疾病"
    return (
        "【候选选题】\n"
        f"1) {dx} 患者 PET 全身代谢负荷与实验室炎症/肾功能指标的相关性。\n"
        f"2) SUVmax/MTV/TLG 与发热待查病因确诊路径的关联（单中心回顾）。\n"
        "3) 风湿免疫病亚组中淋巴结高代谢模式与疾病活动度评分的探索性分析。\n"
    )


def paper_generation(analysis_result: str, literature_review: str) -> str:
    """根据统计摘要与文献综述生成 SCI 风格论文骨架（摘要/方法/结果/讨论）。"""
    return (
        "## Title\n（根据研究主题自动生成）\n\n"
        "## Abstract\n"
        "Background: ...\nMethods: PET/CT 定量指标与临床变量分析 ...\nResults: ...\nConclusion: ...\n\n"
        "## Methods\n"
        "患者纳入标准、影像采集与重建、分割与 SUV/MTV/TLG 计算、统计学方法 ...\n\n"
        "## Results\n"
        f"{analysis_result[:2000]}\n\n"
        "## Discussion\n"
        f"{literature_review[:2000]}\n"
    )


class ResearchAgent:
    def __init__(self, llm_model: str | None = None) -> None:
        self._model_name = llm_model or settings.research_llm_model
        self._executor: Any = None

    def _tool_fns(self) -> list[Any]:
        return [
            statistical_analysis,
            literature_research,
            knowledge_distillation,
            cohort_mining_suggestions,
            auto_topic_selector,
            paper_generation,
            pathology_grading,
            treatment_recommendations,
            clinical_correlation,
        ]

    def _create_executor(self) -> Any:
        from langchain_classic.agents import AgentExecutor, create_openai_tools_agent
        from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder
        from langchain_core.tools import tool
        from langchain_openai import ChatOpenAI

        from app.services.llm_gateway import llm_api_key, llm_base_url, llm_chat_model

        api_key = llm_api_key() or os.getenv("OPENAI_API_KEY", "")
        model_name = self._model_name or llm_chat_model()
        kwargs: dict[str, Any] = {
            "model": model_name,
            "temperature": 0.1,
        }
        if api_key:
            kwargs["api_key"] = api_key
        base = llm_base_url()
        if base:
            kwargs["base_url"] = base
        llm = ChatOpenAI(**kwargs)

        tools = [tool(fn) for fn in self._tool_fns()]
        prompt = ChatPromptTemplate.from_messages(
            [
                (
                    "system",
                    "你是 PMP Agent 的病理与 PET-CT 临床科研专家，面向以病为中心的队列与诊断结果分析。"
                    "请善用工具：诊断结果、治疗推荐、临床指标相关性、统计分析、文献综述、"
                    "知识蒸馏、队列挖掘建议、自动选题与论文骨架。"
                    "回答应专业、可执行，并明确下一步数据需求。",
                ),
                ("human", "{input}"),
                MessagesPlaceholder("agent_scratchpad"),
            ]
        )
        agent = create_openai_tools_agent(llm, tools, prompt)
        return AgentExecutor(agent=agent, tools=tools, verbose=False)

    def run_research(self, patient_data: dict[str, Any], research_topic: str) -> str:
        """运行科研智能体；无 API Key 或 demo_mode 时返回演示用离线报告。"""
        from app.services.llm_gateway import llm_api_key

        api_key = llm_api_key() or os.getenv("OPENAI_API_KEY", "")
        data_str = json.dumps(patient_data, ensure_ascii=False)
        use_offline_demo = settings.demo_mode or not api_key

        if use_offline_demo:
            a = statistical_analysis(data_str, research_topic)
            lit = literature_research(research_topic)
            paper = paper_generation(a, lit)
            return build_offline_demo_report(
                patient_data,
                research_topic,
                str(a),
                str(lit),
                str(paper),
            )

        if self._executor is None:
            self._executor = self._create_executor()
        user = (
            f"研究主题：{research_topic}\n\n患者与问诊结构化数据（JSON）：\n"
            f"{_patient_summary(patient_data)}\n\n"
            "请调用工具：先做统计摘要，再做文献综述，最后生成论文骨架。"
        )
        result = self._executor.invoke({"input": user})
        return str(result.get("output", result))

    def run_extended(
        self,
        patient_data: dict[str, Any],
        research_topic: str,
        tasks: list[str],
    ) -> dict[str, str]:
        """按任务子集执行工具链；无 API Key 时同样走离线工具拼装。"""
        from app.services.llm_gateway import llm_api_key

        api_key = llm_api_key() or os.getenv("OPENAI_API_KEY", "")
        data_str = json.dumps(patient_data, ensure_ascii=False)
        use_offline = settings.demo_mode or not api_key
        out: dict[str, str] = {}
        task_set = set(tasks) if tasks else {"topic", "distill", "stats", "cohort_hint", "paper"}

        if "topic" in task_set:
            out["topic"] = auto_topic_selector(data_str)
        if "distill" in task_set:
            out["distill"] = knowledge_distillation(data_str)
        if "stats" in task_set:
            out["stats"] = statistical_analysis(data_str, research_topic)
        if "cohort_hint" in task_set or "mine" in task_set:
            out["cohort_hint"] = cohort_mining_suggestions(data_str, research_topic)
        if "pathology" in task_set or "grade" in task_set:
            out["pathology"] = pathology_grading(data_str)
        if "treatment" in task_set:
            out["treatment"] = treatment_recommendations(data_str)
        lit = ""
        if "paper" in task_set:
            lit = literature_research(research_topic)
            out["literature"] = lit
            out["paper"] = paper_generation(out.get("stats", ""), lit)

        if use_offline and "paper" in task_set:
            out["markdown_bundle"] = build_offline_demo_report(
                patient_data,
                research_topic,
                out.get("stats", ""),
                lit or out.get("literature", ""),
                out.get("paper", ""),
            )
        elif not use_offline:
            if self._executor is None:
                self._executor = self._create_executor()
            user = (
                f"研究主题：{research_topic}\n\n结构化病例 JSON：\n{_patient_summary(patient_data)}\n\n"
                "请按需调用工具，输出：选题、知识蒸馏、统计摘要、队列挖掘建议与论文骨架。"
            )
            res = self._executor.invoke({"input": user})
            out["llm_synthesis"] = str(res.get("output", res))

        return out
