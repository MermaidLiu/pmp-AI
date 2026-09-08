"""病种与 PET-CT 代谢表型：结合临床诊断、科室、病史的规则分型（可替换为模型）。"""

from __future__ import annotations

import re
from typing import Any

from app.models.domain import FuoClinicalProfile, PetCtInterviewRecord, PetCtResearchExtensions


_FUO_KEYS = ("发热待查", "不明原因发热", "FUO", "发热")
_RHEUM_KEYS = ("风湿", "类风湿", "狼疮", "血管炎", "免疫", "干燥综合征", "强直")


def infer_disease_code_and_name(record: PetCtInterviewRecord) -> tuple[str, str]:
    diag = (record.interview_info.clinical_diagnosis or "").strip()
    dept = (record.patient_base_info.department or "").strip()
    brief = (record.interview_info.brief_medical_history or "").strip()
    blob = f"{diag} {dept} {brief}"
    if any(k in blob for k in _FUO_KEYS):
        return "FUO", "发热待查"
    if any(k in blob for k in _RHEUM_KEYS):
        return "RHEUM_IMMU", "风湿免疫病"
    if "肿瘤" in diag or "癌" in diag or "占位" in diag:
        return "ONCOLOGY", "肿瘤相关"
    return "FUO", "发热待查"


def infer_pet_phenotype_tags(record: PetCtInterviewRecord) -> list[str]:
    tags: list[str] = []
    les = record.research_extensions.lesions
    if les:
        tags.append("局灶高代谢")
        if any((x.suv_max or 0) >= 10 for x in les):
            tags.append("高SUV负荷")
    gq = record.research_extensions.global_quant
    if gq.suv_max and gq.suv_max >= 8:
        tags.append("全身代谢活跃")
    if record.supplementary_interview_info.examination_history.petct:
        tags.append("既往PET检查史")
    thy = record.research_extensions.thyroid_panel_structured
    if any([thy.tsh, thy.ft3, thy.ft4]) or (record.interview_info.thyroid_hormone or "").strip() not in (
        "",
        "正常",
    ):
        tags.append("甲状腺轴相关")
    cr = (record.interview_info.creatinine or "").lower()
    if cr and cr not in ("正常", "none", "n/a"):
        tags.append("肾功能指标在案")
    return list(dict.fromkeys(tags))


def sync_fuo_profile_from_history(record: PetCtInterviewRecord) -> dict[str, Any]:
    """从简要病史中粗提取发热病程关键词（演示级规则）。"""
    text = record.interview_info.brief_medical_history or ""
    out: dict[str, Any] = {}
    m = re.search(r"发热\s*([0-9一二两三四五六七八九十半\+\-个月年周天]+)", text)
    if m:
        out["fever_duration"] = m.group(0)
    if "激素" in text:
        out["steroid_or_immunosuppressor_exposure"] = "病史提及激素或免疫调节治疗"
    if any(x in text for x in ("感染", "培养", "病原")):
        out["infection_workup_summary"] = "病史提及感染相关评估（细节请查检验）"
    if any(x in text for x in ("关节", "皮疹", "口腔溃疡", "雷诺")):
        out["rheumatic_immunology_clues"] = "病史提及风湿免疫相关线索"
    return out


def build_typed_extensions(record: PetCtInterviewRecord) -> PetCtResearchExtensions:
    ext = record.research_extensions.model_copy(deep=True)
    code, name = infer_disease_code_and_name(record)
    if not ext.primary_disease_code:
        ext.primary_disease_code = code
    if not ext.primary_disease_name:
        ext.primary_disease_name = name
    tags = infer_pet_phenotype_tags(record)
    ext.pet_ct_phenotype_tags = list(dict.fromkeys([*ext.pet_ct_phenotype_tags, *tags]))
    fuo_patch = sync_fuo_profile_from_history(record)
    if fuo_patch:
        fp = ext.fuo_profile.model_dump()
        for k, v in fuo_patch.items():
            if not fp.get(k):
                fp[k] = v
        ext.fuo_profile = FuoClinicalProfile.model_validate(fp)
    return ext


def apply_classification(record: PetCtInterviewRecord) -> PetCtInterviewRecord:
    return record.model_copy(update={"research_extensions": build_typed_extensions(record)})
