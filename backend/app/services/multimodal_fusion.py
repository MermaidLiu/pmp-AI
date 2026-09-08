"""PET-CT 多模态：影像定量 + 问诊检验 + 病灶列表 → 关联摘要与可视化载荷。"""

from __future__ import annotations

from typing import Any

from app.models.domain import PetCtInterviewRecord


def fuse_patient_multimodal(record: PetCtInterviewRecord) -> dict[str, Any]:
    p = record.patient_base_info
    iv = record.interview_info
    rx = record.research_extensions
    labs = rx.lab_snapshot or {
        "creatinine": iv.creatinine,
        "urea_nitrogen": iv.urea_nitrogen,
        "thyroid_hormone_text": iv.thyroid_hormone,
    }
    thy = rx.thyroid_panel_structured.model_dump()
    lesions = [x.model_dump() for x in rx.lesions]
    gq = rx.global_quant.model_dump()
    chart_lesion_suv = [
        {"region": x.get("organ_or_region") or "", "suv_max": x.get("suv_max")}
        for x in lesions
        if x.get("suv_max") is not None
    ]
    narrative_bits = [
        f"患者 {p.name or '（匿名）'} / {p.gender or '-'} / {p.age or '-'} 岁",
        f"科室：{p.department or '-'}；诊断要点：{iv.clinical_diagnosis or '-'}",
        f"病种标签：{rx.primary_disease_name or '-'} ({rx.primary_disease_code or '-'})",
        f"代谢表型：{', '.join(rx.pet_ct_phenotype_tags) if rx.pet_ct_phenotype_tags else '（未分型）'}",
    ]
    fusion_summary = (
        "多模态融合要点：将 PET 病灶 SUV 与肾功能（肌酐/尿素氮）、甲状腺轴及发热待查病史并读。"
        f" 全局 SUVmax={gq.get('suv_max')}, MTV={gq.get('mtv')}, TLG={gq.get('tlg')}；"
        f" 检验快照：{labs}；结构化甲功：{thy}。"
    )
    return {
        "patient_header": narrative_bits,
        "labs": labs,
        "thyroid_structured": thy,
        "global_quant": gq,
        "lesions": lesions,
        "fuo_profile": rx.fuo_profile.model_dump(),
        "chart": {
            "lesion_suv_bars": chart_lesion_suv,
            "lab_radar_labels": ["肌酐(文本)", "尿素氮(文本)", "甲功文本", "病灶数"],
            "lab_radar_values": [
                1.0 if labs.get("creatinine") else 0.0,
                1.0 if labs.get("urea_nitrogen") else 0.0,
                1.0 if labs.get("thyroid_hormone_text") else 0.0,
                float(len(lesions)),
            ],
        },
        "fusion_summary": fusion_summary,
    }
