"""院方演示用模拟数据（不调用大模型 API 时可用）。"""

from __future__ import annotations

import json
from typing import Any

# 与 PetCtInterviewRecord 结构一致；姓名等为虚构示例
SAMPLE_INTERVIEW_RECORD: dict[str, Any] = {
    "patient_base_info": {
        "name": "演示患者",
        "gender": "男",
        "age": 62,
        "phone": "13800138000",
        "source": "门诊",
        "exam_id": "PET20260329001",
        "medical_record_id": "MR-DEMO-001",
        "admission_id": "",
        "outpatient_id": "OP-DEMO-001",
        "department": "核医学科",
        "doctor_phone": "",
        "exam_item": "全身 PET/CT（18F-FDG）",
        "height_cm": 172.0,
        "weight_kg": 70.0,
        "interview_doctor": "张医生",
        "interview_time": None,
        "patient_type": ["肿瘤筛查"],
        "is_free_report": False,
    },
    "interview_info": {
        "appetite_description": "食欲尚可",
        "weight_change": "近 3 月下降约 2 kg",
        "weight_change_detail": {"change_month": "3", "change_type": "下降", "change_kg": "2"},
        "consciousness": "清楚",
        "clinical_diagnosis": "左肺上叶占位，性质待查",
        "medical_history": {
            "smoking_history": "吸烟 30 年，20 支/日，已戒 1 年",
            "drinking_history": "偶饮",
            "tuberculosis_history": "无",
            "diabetes_history": "无",
            "menstruation_history": "",
            "family_tumor_history": "父亲肺癌史",
            "surgery_history": "无",
            "hepatitis_history": "无",
            "radiotherapy_history": "无",
            "medication_history": "无长期用药",
            "chemotherapy_history": "无",
            "trauma_history": "无",
            "allergy_history": "青霉素过敏",
            "targeted_therapy_history": "无",
            "eating_history": "",
        },
        "brief_medical_history": "咳嗽 2 月，偶痰中带血，外院 CT 提示肺占位。",
        "is_lung_cancer": "待病理",
        "thyroid_hormone": "",
        "nodule_diagnosis": "",
        "is_vascular_stenosis": "",
        "is_stent": "",
        "stent_position": "",
        "is_bypass": "",
        "is_dry_eye": "",
        "is_dry_mouth": "",
        "creatinine": "78",
        "creatinine_abnormal_value": "",
        "urea_nitrogen": "5.2",
    },
    "supplementary_interview_info": {
        "urea_nitrogen_abnormal_value": "",
        "chest_pain_type": [],
        "chest_pain_duration_hour": "",
        "is_hypertension": "是",
        "is_hyperlipidemia": "否",
        "is_nitroglycerin_relief": "",
        "surgery_position": "",
        "surgery_date": "",
        "radiotherapy_position": "",
        "radiotherapy_end_date": "",
        "chemotherapy_end_date": "",
        "trauma_position": "",
        "examination_history": {
            "heart_exam": True,
            "ecg": True,
            "renal_function": True,
            "thyroid_function": False,
            "blood_test": True,
            "coronary_cta": False,
            "coronary_angiography": False,
            "bronchoscopy": False,
            "xray": True,
            "prostate_ultrasound": False,
            "mr_plain_enhanced": True,
            "petct": True,
            "tumor_marker": True,
            "gastroscopy": False,
            "b_ultrasound": False,
            "ct_plain_enhanced": True,
            "pathology": False,
            "ect": False,
        },
        "other_examination": "",
    },
    "research_extensions": {
        "patient_internal_id": "MR-DEMO-001",
        "primary_disease_code": "ONCOLOGY",
        "primary_disease_name": "肿瘤相关",
        "pet_ct_phenotype_tags": ["局灶高代谢"],
        "fuo_profile": {},
        "thyroid_panel_structured": {},
        "lab_snapshot": {},
        "pet_ct_report_narrative": "演示：纵隔淋巴结代谢增高，SUVmax=8.2；MTV≈14.0 mL；TLG≈98.0。",
        "imaging_report_text": "",
        "lesions": [{"organ_or_region": "纵隔淋巴结", "suv_max": 8.2, "suv_mean": 4.5, "metabolic_pattern": "", "ct_correlation_note": ""}],
        "global_quant": {"suv_max": 8.2, "suv_mean": 4.2, "mtv": 14.0, "tlg": 98.0},
        "prior_exam_ids": [],
        "document_uploads": [],
    },
}

SAMPLE_EXTRACT_DEMO_NOTE = (
    "当前为演示说明：未安装 Tesseract 或未识别到文字时，上传图片可能得到空 OCR。"
    "演示环境请使用「示例问诊数据」接口或粘贴 JSON。"
)


def build_offline_demo_report(
    patient_data: dict[str, Any],
    research_topic: str,
    tool_stats_block: str,
    tool_literature_block: str,
    tool_paper_block: str,
) -> str:
    """在无大模型时拼装一份更像真实汇报的 Markdown（工具输出 + 固定模拟段落）。"""
    base = patient_data.get("patient_base_info") or {}
    exam_id = base.get("exam_id") or "（未填检查号）"
    age = base.get("age")
    gender = base.get("gender")
    diagnosis = (patient_data.get("interview_info") or {}).get("clinical_diagnosis") or "（未填临床诊断）"

    patient_json = ""
    try:
        patient_json = json.dumps(patient_data, ensure_ascii=False, indent=2)[:4000]
    except TypeError:
        patient_json = str(patient_data)[:4000]

    return f"""## 【演示模式】科研助手输出（未调用大模型）

> 本页内容为**院方演示用模拟流程**：未配置 `OPENAI_API_KEY` 或已开启演示开关时使用。数据为虚构或来自您当前表单，**不代表真实诊疗结论**。

### 研究主题
{research_topic}

### 病例摘要（来自当前结构化数据）
- 检查号：`{exam_id}`
- 年龄 / 性别：{age} / {gender}
- 临床诊断要点：{diagnosis}

### 模拟工作流（与真实接入大模型后的步骤一致）
1. **描述性统计（工具链）** — 见下节「统计分析」。
2. **文献与背景（占位）** — 见「文献综述」；正式环境可对接 PubMed / CNKI 等。
3. **论文骨架（占位）** — 见「论文结构草稿」；正式环境由模型在工具结果上续写。

### 统计分析（工具输出）
{tool_stats_block}

### 文献综述（工具输出）
{tool_literature_block}

### 模拟补充：可参考的检索策略（演示文案）
- 英文：`PET/CT` AND (`SUVmax` OR `MTV` OR `TLG`) AND (lung neoplasm OR NSCLC)
- 中文：`PET-CT` `代谢体积` `预后` `实体瘤`
- 近 5 年队列研究 + 指南（NCCN / CSCO）交叉核对。

### 论文结构草稿（工具输出）
{tool_paper_block}

### 附录：当前患者 JSON（截断）
```json
{patient_json}
```
"""


def sample_petct_analysis_demo() -> dict[str, Any]:
    """影像实验室演示用：无权重模型时的定量指标样例。"""
    return {
        "quantitative_metrics": {
            "suv_max": 8.7,
            "suv_mean": 4.2,
            "mtv": 12.5,
            "tlg": 156.3,
        },
        "image_report": (
            "【演示】模拟病灶代谢增高灶，SUVmax 偏高，建议结合病理与增强 CT 综合评估。"
            "正式环境将基于分割模型与 DICOM 体数据计算 MTV/TLG。"
        ),
        "segmentation_available": False,
        "notes": "当前为内置演示数据；配置 MONAI 权重后可尝试真实分割管线。",
    }
