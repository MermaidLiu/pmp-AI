"""Pydantic models aligned with PET-CT interview JSON schemas (API & validation)."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class PatientBaseInfo(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    name: str = ""
    gender: str = ""
    age: int = 0
    phone: str = ""
    source: str = ""
    exam_id: str = ""
    medical_record_id: str = ""
    admission_id: str = ""
    outpatient_id: str = ""
    department: str = ""
    doctor_phone: str = ""
    exam_item: str = ""
    height_cm: float = 0.0
    weight_kg: float = 0.0
    interview_doctor: str = ""
    interview_time: datetime | None = None
    patient_type: list[str] = Field(default_factory=list)
    is_free_report: bool = False


class WeightChangeDetail(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    change_month: str = ""
    change_type: str = ""
    change_kg: str = ""


class MedicalHistory(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    smoking_history: str = ""
    drinking_history: str = ""
    tuberculosis_history: str = ""
    diabetes_history: str = ""
    menstruation_history: str = ""
    family_tumor_history: str = ""
    surgery_history: str = ""
    hepatitis_history: str = ""
    radiotherapy_history: str = ""
    medication_history: str = ""
    chemotherapy_history: str = ""
    trauma_history: str = ""
    allergy_history: str = ""
    targeted_therapy_history: str = ""
    eating_history: str = ""


class InterviewInfo(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    appetite_description: str = ""
    weight_change: str = ""
    weight_change_detail: WeightChangeDetail = Field(default_factory=WeightChangeDetail)
    consciousness: str = ""
    clinical_diagnosis: str = ""
    medical_history: MedicalHistory = Field(default_factory=MedicalHistory)
    brief_medical_history: str = ""
    is_lung_cancer: str = ""
    thyroid_hormone: str = ""
    nodule_diagnosis: str = ""
    is_vascular_stenosis: str = ""
    is_stent: str = ""
    stent_position: str = ""
    is_bypass: str = ""
    is_dry_eye: str = ""
    is_dry_mouth: str = ""
    creatinine: str = ""
    creatinine_abnormal_value: str = ""
    urea_nitrogen: str = ""


class ExaminationHistory(BaseModel):
    heart_exam: bool = False
    ecg: bool = False
    renal_function: bool = False
    thyroid_function: bool = False
    blood_test: bool = False
    coronary_cta: bool = False
    coronary_angiography: bool = False
    bronchoscopy: bool = False
    xray: bool = False
    prostate_ultrasound: bool = False
    mr_plain_enhanced: bool = False
    petct: bool = False
    tumor_marker: bool = False
    gastroscopy: bool = False
    b_ultrasound: bool = False
    ct_plain_enhanced: bool = False
    pathology: bool = False
    ect: bool = False


class SupplementaryInterviewInfo(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    urea_nitrogen_abnormal_value: str = ""
    chest_pain_type: list[str] = Field(default_factory=list)
    chest_pain_duration_hour: str = ""
    is_hypertension: str = ""
    is_hyperlipidemia: str = ""
    is_nitroglycerin_relief: str = ""
    surgery_position: str = ""
    surgery_date: str = ""
    radiotherapy_position: str = ""
    radiotherapy_end_date: str = ""
    chemotherapy_end_date: str = ""
    trauma_position: str = ""
    examination_history: ExaminationHistory = Field(default_factory=ExaminationHistory)
    other_examination: str = ""


class PetCtImageMetrics(BaseModel):
    suv_max: float | None = None
    suv_mean: float | None = None
    mtv: float | None = None
    tlg: float | None = None


class FuoClinicalProfile(BaseModel):
    """发热待查（FUO）与全身炎症相关病史摘要，与问诊单及病程记录对齐。"""

    model_config = ConfigDict(str_strip_whitespace=True)

    fever_duration: str = ""
    max_temperature_c: str = ""
    fever_pattern: str = ""
    antipyretic_response: str = ""
    infection_workup_summary: str = ""
    rheumatic_immunology_clues: str = ""
    steroid_or_immunosuppressor_exposure: str = ""


class ThyroidPanelStructured(BaseModel):
    """甲状腺检验结构化字段（与 interview_info.thyroid_hormone 文本互补）。"""

    model_config = ConfigDict(str_strip_whitespace=True)

    tsh: str = ""
    ft3: str = ""
    ft4: str = ""
    tg_ab: str = ""
    tpo_ab: str = ""
    notes: str = ""


class PetCtLesionItem(BaseModel):
    """病灶级 PET-CT 代谢特征，用于分型与多模态关联。"""

    model_config = ConfigDict(str_strip_whitespace=True)

    organ_or_region: str = ""
    suv_max: float | None = None
    suv_mean: float | None = None
    metabolic_pattern: str = ""
    ct_correlation_note: str = ""


class PetCtResearchExtensions(BaseModel):
    """科研扩展：以病为中心、PET 定量、随访链、报告与上传元数据。"""

    model_config = ConfigDict(str_strip_whitespace=True)

    patient_internal_id: str = Field(
        default="",
        description="院内同一患者多次检查归并键（可与病历号一致）",
    )
    primary_disease_code: str = ""
    primary_disease_name: str = ""
    pet_ct_phenotype_tags: list[str] = Field(default_factory=list)
    fuo_profile: FuoClinicalProfile = Field(default_factory=FuoClinicalProfile)
    thyroid_panel_structured: ThyroidPanelStructured = Field(default_factory=ThyroidPanelStructured)
    lab_snapshot: dict[str, str] = Field(
        default_factory=dict,
        description="肌酐/尿素氮等键值对，便于与影像指标融合分析",
    )
    pet_ct_report_narrative: str = ""
    imaging_report_text: str = ""
    lesions: list[PetCtLesionItem] = Field(default_factory=list)
    global_quant: PetCtImageMetrics = Field(default_factory=PetCtImageMetrics)
    prior_exam_ids: list[str] = Field(default_factory=list)
    document_uploads: list[dict[str, Any]] = Field(
        default_factory=list,
        description="批量上传文件元数据：filename, kind, ocr_excerpt",
    )
    pathology_grade: str = Field(default="", description="诊断结果：高级别 | 低级别 | 未确定")
    pathology_confidence: float | None = None
    pathology_evidence: list[str] = Field(default_factory=list)
    # Auditable decision-support ledger. These values live in the existing JSON
    # research extension and therefore do not require a destructive DB migration.
    ai_assisted_diagnosis: dict[str, Any] = Field(default_factory=dict)
    physician_feedback: list[dict[str, Any]] = Field(default_factory=list)
    omics_artifacts: dict[str, Any] = Field(default_factory=dict)


class PetCtInterviewRecord(BaseModel):
    """Full interview bundle for API I/O."""

    patient_base_info: PatientBaseInfo = Field(default_factory=PatientBaseInfo)
    interview_info: InterviewInfo = Field(default_factory=InterviewInfo)
    supplementary_interview_info: SupplementaryInterviewInfo = Field(
        default_factory=SupplementaryInterviewInfo
    )
    research_extensions: PetCtResearchExtensions = Field(default_factory=PetCtResearchExtensions)


class PptOutlineInput(PetCtInterviewRecord):
    """病例 JSON 与可选选题，用于个性化 PPT 页纲。"""

    research_topic: str | None = None


class ResearchProjectBase(BaseModel):
    title: str
    description: str = ""
    research_topic: str = ""
    status: str = Field(default="draft", description="draft | active | completed | archived")


class ResearchProjectCreate(ResearchProjectBase):
    linked_exam_ids: list[str] = Field(default_factory=list)


class ResearchProjectRead(ResearchProjectBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    created_at: datetime | None = None
    updated_at: datetime | None = None
    linked_exam_ids: list[str] = Field(default_factory=list)
    extra_metadata: dict[str, Any] = Field(default_factory=dict)


class PetCtAnalysisResult(BaseModel):
    quantitative_metrics: PetCtImageMetrics = Field(default_factory=PetCtImageMetrics)
    image_report: str = ""
    segmentation_available: bool = False
    notes: str = ""


class DiseaseBase(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    code: str
    name: str
    category: str = ""
    description: str = ""


class DiseaseCreate(DiseaseBase):
    pass


class DiseaseRead(DiseaseBase):
    model_config = ConfigDict(from_attributes=True)

    id: int


class CohortFilterBody(BaseModel):
    """患者队列筛选：以病种为中心，可按检验、科室、代谢标签过滤。"""

    disease_id: int | None = None
    disease_code: str | None = None
    department_contains: str | None = None
    min_age: int | None = None
    max_age: int | None = None
    gender: str | None = None
    has_pet_lesion_suv: bool | None = None
    phenotype_tag: str | None = None
    patient_internal_id: str | None = None
    skip: int = 0
    limit: int = 200


class FollowupCompareBody(BaseModel):
    exam_id_baseline: str
    exam_id_followup: str


class AgentExtendedRunBody(BaseModel):
    record: PetCtInterviewRecord
    research_topic: str = "PET-CT 多模态科研蒸馏"
    tasks: list[str] = Field(
        default_factory=lambda: [
            "topic",
            "distill",
            "stats",
            "cohort_hint",
            "paper",
        ],
        description="topic | distill | stats | cohort_hint | paper | mine",
    )


class BatchIngestResultItem(BaseModel):
    filename: str
    ok: bool
    detail: str = ""
    parsed: dict[str, Any] | None = None


class PathologyGradingDetail(BaseModel):
    """诊断结果判定详情（含病理分级与评分）。"""

    grade_label: str = Field(description="病理分级：高级别 | 低级别 | 未确定")
    pathology_grade: str = Field(default="", description="病理分级展示名，与 grade_label 一致")
    grade_system: str = ""
    who_grade: str = Field(default="", description="WHO 分级，如 G1 / G2 / G3")
    composite_score: float = Field(default=0.0, description="综合评分 0–100，越高倾向高级别")
    score_level: str = Field(default="", description="评分档位：低危 / 中危 / 高危")
    confidence: float = 0.0
    score_breakdown: dict[str, float] = Field(
        default_factory=dict,
        description="评分明细：形态学、增殖活性、影像代谢等",
    )
    score_interpretation: str = ""
    evidence: list[str] = Field(default_factory=list)
    biomarkers_suggested: list[str] = Field(default_factory=list)


class FeatureContributionItem(BaseModel):
    feature: str = ""
    display_name: str = ""
    value: float = 0.0
    contribution: float = 0.0
    direction: str = ""


class FeatureImportanceItem(BaseModel):
    feature: str = ""
    display_name: str = ""
    importance: float = 0.0


class ModelExplainability(BaseModel):
    """模型可解释性：概率、特征贡献、全局重要性、腹腔粘液瘤专用依据。"""

    probabilities: dict[str, float] = Field(default_factory=dict)
    feature_contributions: list[FeatureContributionItem] = Field(default_factory=list)
    global_feature_importance: list[FeatureImportanceItem] = Field(default_factory=list)
    prediction_source: str = ""
    explanation_method: str = ""
    pmp_evidence: list[str] = Field(default_factory=list)


class TreatmentRecommendation(BaseModel):
    """基于诊断结果的治疗推荐（MDT 待确认草案）。"""

    grade_label: str = ""
    recommendations: list[str] = Field(default_factory=list)
    guideline_refs: list[str] = Field(default_factory=list)
    mdt_recommended: bool = False
    draft_status: str = "MDT待确认草案"
    evidence_cards: list[dict[str, Any]] = Field(default_factory=list)


class PathologyAnalysisResult(BaseModel):
    """影像 + 临床综合病理分析输出。"""

    diagnosis_summary: str = ""
    inferred_diagnosis: str = ""
    grading: PathologyGradingDetail = Field(default_factory=PathologyGradingDetail)
    treatment: TreatmentRecommendation = Field(default_factory=TreatmentRecommendation)
    literature: list[dict[str, str]] = Field(default_factory=list)
    multimodal_notes: list[str] = Field(default_factory=list)
    explainability: ModelExplainability = Field(default_factory=ModelExplainability)


class PathologyBatchCohortResult(BaseModel):
    """批量 DICOM 上传后的高/低级别队列统计。"""

    total: int = 0
    high_grade_count: int = 0
    low_grade_count: int = 0
    unknown_count: int = 0
    high_grade_cases: list[dict[str, Any]] = Field(default_factory=list)
    low_grade_cases: list[dict[str, Any]] = Field(default_factory=list)
    summary: str = ""
    target_distribution_note: str = ""


class ClinicalCorrelationBody(BaseModel):
    """医生输入临床指标，请求相关性分析。"""

    indicators: dict[str, str | float] = Field(default_factory=dict)
    disease_context: str = ""


class ClinicalCorrelationResult(BaseModel):
    """临床指标与诊断结果的相关性分析。"""

    input_indicators: dict[str, str | float] = Field(default_factory=dict)
    correlated_factors: list[dict[str, Any]] = Field(default_factory=list)
    literature: list[dict[str, str]] = Field(default_factory=list)
    analysis_suggestions: list[str] = Field(default_factory=list)
    accumulated_cases_note: str = ""
