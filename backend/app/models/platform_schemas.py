"""Platform UI API schemas (aligned with frontend mock types)."""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field

from app.models.domain import PetCtInterviewRecord


class DiagnosisProbability(BaseModel):
    label: str
    pct: int


class PlatformDiagnosisResult(BaseModel):
    title: str
    confidence: float
    staging: str
    evidence: list[str] = Field(default_factory=list)
    probabilities: list[DiagnosisProbability] = Field(default_factory=list)
    prognosis: dict[str, str] = Field(default_factory=dict)


class PlatformPatientRow(BaseModel):
    id: str
    name: str
    gender: str
    age: int
    diagnosis: str
    stage: str
    gene: str
    enrolledAt: str
    department: str
    physician: str
    smoking: str
    ecog: str
    chiefComplaint: str
    pastHistory: str
    familyHistory: str
    admissionId: str
    admissionTime: str
    gradeLabel: str = "—"
    followUpStatus: str = "—"
    examId: str = ""
    clinicalSummary: str = ""
    pathologySummary: str = ""
    imagingSummary: str = ""
    pciScore: int | None = None
    hasAnnotatedImage: bool = False
    modality: str = ""
    dicomCount: int = 0
    treatmentMethod: str = "—"
    surgeryNumber: str = "—"
    ivChemotherapy: str = "—"
    ccScore: str = "—"


class PlatformImagingRow(BaseModel):
    id: str
    patientId: str
    patientName: str
    modality: str
    examItem: str
    examDate: str
    bodyPart: str
    suvMax: float | None = None
    mtv: float | None = None
    tlg: float | None = None
    lesionCount: int = 0
    dicomCount: int = 0
    hasPet: bool = False
    reportSummary: str = ""
    reportText: str = ""
    status: Literal["已归档", "待审核", "解析中"] = "已归档"
    hasAnnotatedImage: bool = False


class PlatformPathologyRow(BaseModel):
    id: str
    patientId: str
    patientName: str
    sampleSite: str = "—"
    stainType: str = "影像 AI 分析"
    gradeLabel: str = "—"
    whoGrade: str = "—"
    ki67: str = "—"
    p53: str = "—"
    pmpSubtype: str = "—"
    slideCount: int = 0
    reportDate: str = ""
    pathologist: str = "AI 影像诊断"
    summary: str = ""
    confidence: float | None = None
    dicomCount: int = 0
    status: Literal["已签发", "待复核", "制片中"] = "已签发"
    hasAnnotatedImage: bool = False


class AnalysisIntentBody(BaseModel):
    question: str = ""
    variables: str = ""
    outcome: str = ""
    notes: str = ""


class PciRegionScore(BaseModel):
    index: int | None = None
    key: str = ""
    label: str = ""
    score: int | None = None


class PciSliceScore(BaseModel):
    index: int = 0
    filename: str = ""
    sc: int | None = None
    region: int | None = None


class PciScoreResult(BaseModel):
    status: str = ""
    message: str = ""
    pci_score: int | None = None
    is_positive: int | None = None
    positive_rate: float | None = None
    mesenteric_contracture: int | None = None
    regions: list[PciRegionScore] = Field(default_factory=list)
    slice_scores: list[PciSliceScore] = Field(default_factory=list)
    conclusion: str = ""
    report_image_base64: str = ""
    dcm_path_used: str = ""
    raw: dict[str, Any] = Field(default_factory=dict)


class PathologyImagingGradeResult(BaseModel):
    status: str = ""
    message: str = ""
    grade_label: str = ""
    confidence: float | None = None
    result_image_base64: str = ""
    dicom_count: int = 0
    raw: dict[str, Any] = Field(default_factory=dict)
    exam_id: str = ""
    saved: bool = False
    annotation_dataset_id: str = ""
    annotation_slice_count: int = 0
    annotation_slices_with_mask: int = 0
    pci: PciScoreResult | None = None


class AnnotationDatasetSummary(BaseModel):
    dataset_id: str
    session_id: str = ""
    exam_id: str = ""
    created_at: str = ""
    slice_count: int = 0
    slices_with_mask: int = 0
    total_lesion_pixels: int = 0


class PlatformChatAnalyzeResponse(BaseModel):
    diagnosis: PlatformDiagnosisResult
    record: PetCtInterviewRecord
    fusion_summary: str = ""
    ingest_notes: list[str] = Field(default_factory=list)
    pathology_imaging_status: str = ""
    pathology_imaging: PathologyImagingGradeResult | None = None
    ai_reply: str = ""
    llm_model: str = ""
    llm_used: bool = False
    llm_provider: str = ""


class PathologySaveRequest(BaseModel):
    result: PathologyImagingGradeResult
    uploaded_file_names: list[str] = Field(default_factory=list)
    record: PetCtInterviewRecord | None = None


class PlatformPatientUpdateRequest(BaseModel):
    """Partial patient-table edit payload (double-click cells → save)."""

    examId: str = ""
    patient: PlatformPatientRow


class CarePathwayAnalyzeBody(BaseModel):
    imaging: PathologyImagingGradeResult
    record: PetCtInterviewRecord
    llm_provider: str = ""


class GuidelineFragmentRef(BaseModel):
    fragment_id: str = ""
    guideline_id: str = ""
    title: str = ""
    version: str = ""
    section: str = ""
    excerpt: str = ""
    source_type: str = "指南/共识"
    published_at: str = ""


class PlatformAssistedDiagnosisBody(BaseModel):
    """Clinical decision support request. The result is always a draft for review."""

    record: PetCtInterviewRecord
    imaging: PathologyImagingGradeResult | None = None
    use_tooluniverse: bool = True


class PlatformAssistedDiagnosisResponse(BaseModel):
    status: str = "draft"
    primary_impression: str = ""
    differential: list[DiagnosisProbability] = Field(default_factory=list)
    rationale: list[str] = Field(default_factory=list)
    guideline_refs: list[GuidelineFragmentRef] = Field(default_factory=list)
    research_context: list[str] = Field(default_factory=list)
    safety_notes: list[str] = Field(default_factory=list)
    model_name: str = "rule-engine"
    model_version: str = ""
    tooluniverse_used: bool = False
    generated_at: str = ""


class PhysicianFeedbackBody(BaseModel):
    exam_id: str
    diagnosis: str = Field(min_length=1, max_length=1000)
    agreement_score: int = Field(ge=1, le=5)
    final_grade: str = ""
    comments: str = Field(default="", max_length=2000)
    physician_name: str = Field(default="", max_length=128)


class PhysicianFeedbackResponse(BaseModel):
    ok: bool
    exam_id: str
    feedback_count: int
    training_ready_count: int


class OmicsReadinessResponse(BaseModel):
    clinical_cases: int = 0
    imaging_cases: int = 0
    genomic_cases: int = 0
    physician_labeled_cases: int = 0
    minimum_cases: int = 50
    modules: dict[str, dict[str, Any]] = Field(default_factory=dict)


class PatientEvidenceRef(BaseModel):
    id: str = ""
    kind: str = ""
    label: str = ""
    value: str = ""
    source: str = ""


class TreatmentEvidenceCard(BaseModel):
    """MDT 待确认草案：每条治疗推荐绑定本地版本化指南片段与患者证据。"""

    id: str = ""
    status: str = "MDT待确认草案"
    priority: str = ""
    recommendation: str = ""
    guideline_fragments: list[GuidelineFragmentRef] = Field(default_factory=list)
    patient_evidence: list[PatientEvidenceRef] = Field(default_factory=list)
    generated_at: str = ""
    requires_mdt_confirmation: bool = True


class CarePathwayTreatmentBlock(BaseModel):
    recommendations: list[str] = Field(default_factory=list)
    evidence_cards: list[TreatmentEvidenceCard] = Field(default_factory=list)
    grade_label: str = ""
    mdt_recommended: bool = True
    draft_status: str = "MDT待确认草案"
    guideline_refs: list[str] = Field(default_factory=list)
    llm_used: bool = False
    llm_model: str = ""


class CarePathwayAnalyzeResponse(BaseModel):
    imaging_report: str = ""
    api_conclusion: str = ""
    inferred_diagnosis: str = ""
    treatment: CarePathwayTreatmentBlock = Field(default_factory=CarePathwayTreatmentBlock)
    literature: list[dict[str, Any]] = Field(default_factory=list)


class PublicationTopicRow(BaseModel):
    title: str
    status: str
    note: str = ""
    relevance: int = 0


class PlatformPublicationTopicsResponse(BaseModel):
    existing_topics: list[PublicationTopicRow] = Field(default_factory=list)
    novel_topics: list[PublicationTopicRow] = Field(default_factory=list)
    summary: str = ""


class PptSlideOut(BaseModel):
    page: int
    title: str
    bullets: list[str] = Field(default_factory=list)


class PlatformPptGenerateBody(BaseModel):
    scenario: Literal["leadership", "academic", "government"] = "academic"
    title: str = ""
    pathology_grade: str = ""
    dicom_count: int = 0
    radiomics_summary: str = ""
    template_filename: str = ""


class PlatformPptGenerateResponse(BaseModel):
    scenario: str
    title: str
    slides: list[PptSlideOut] = Field(default_factory=list)
    template_note: str = ""


class PlatformSaveResponse(BaseModel):
    ok: bool
    patient: PlatformPatientRow
    exam_id: str


class ResearchResultRowOut(BaseModel):
    factor: str
    metric: str
    pValue: str
    note: str
    weight: float | None = None


class PlatformResearchRunBody(BaseModel):
    module: Literal["clinical", "imaging", "multimodal"]
    task_id: str
    fields: list[str] = Field(default_factory=list)
    inclusion: str = ""
    exclusion: str = ""
    outcome: str = ""
    indicators: dict[str, str] = Field(default_factory=dict)
    workflow_context: dict[str, Any] = Field(default_factory=dict)


class PlatformResearchRunResponse(BaseModel):
    module: str
    task_id: str
    task_title: str
    rows: list[ResearchResultRowOut]
    summary: str
    n: int
    auc: float | None = None
    c_index: float | None = None
    pathology_imaging_pending: bool = False
    pathology_imaging: PathologyImagingGradeResult | None = None


class RadiomicsExtractResponse(BaseModel):
    ok: bool
    feature_count: int = 0
    features_preview: list[ResearchResultRowOut] = Field(default_factory=list)
    meta: dict[str, Any] = Field(default_factory=dict)
    message: str = ""
    pyradiomics_available: bool = False


class CitationValidationOut(BaseModel):
    doi: str = ""
    pmid: str = ""
    status: str = "unchecked"  # valid | invalid | unchecked | unavailable
    checked_at: str = ""
    message: str = ""


class KnowledgeLiteratureOut(BaseModel):
    id: str
    title: str
    source: str
    year: str
    doi: str
    pmid: str
    relevance: int
    journal: str = ""
    doi_validation: CitationValidationOut = Field(default_factory=CitationValidationOut)
    pmid_validation: CitationValidationOut = Field(default_factory=CitationValidationOut)
    cited_at: str = ""
    verifiable: bool = False
    is_demo: bool = False
    excerpt: str = ""
    guideline_fragment_id: str = ""
    guideline_version: str = ""


class AnswerPointOut(BaseModel):
    text: str
    refs: list[int]


class PlatformKnowledgeSearchBody(BaseModel):
    query: str
    sources: list[str] = Field(default_factory=list)
    allow_demo: bool = False  # 正式模式禁止混入演示种子数据


class PlatformKnowledgeSearchResponse(BaseModel):
    query: str
    hit_count: int
    literature: list[KnowledgeLiteratureOut]
    answer_points: list[AnswerPointOut]
    search_mode: str = "formal"  # formal | demo_isolated
    demo_mixed: bool = False
    searched_at: str = ""
    source_errors: list[str] = Field(default_factory=list)
    stats: dict[str, int]


class PlatformKnowledgeGenerateBody(BaseModel):
    doc_type: Literal["review", "paper", "grant", "ppt"]
    query: str
    literature_ids: list[str] = Field(default_factory=list)


class PlatformKnowledgeGenerateResponse(BaseModel):
    doc_type: str
    title: str
    content: str
    generated_at: str = ""
    citation_records: list[KnowledgeLiteratureOut] = Field(default_factory=list)


class ClinicalVariableIn(BaseModel):
    name: str
    type: str = "text"
    skipped: bool = False


class ClinicalDatasetAnalyzeBody(BaseModel):
    analysis: str
    rows: list[dict[str, str]] = Field(default_factory=list)
    variables: list[ClinicalVariableIn] = Field(default_factory=list)
    selected_vars: list[str] = Field(default_factory=list)
    split_var: str | None = None
    group_a: str | None = None
    group_b: str | None = None
    dependent: str | None = None
    independents: list[str] = Field(default_factory=list)
    outcome_var: str | None = None
    predictor: str | None = None
    positive_class: str | None = None
    time_var: str | None = None
    event_var: str | None = None
    feature_vars: list[str] = Field(default_factory=list)
    ml_model: str = "random_forest"
    test_size: float = 0.3
    p_threshold: float = 0.10
    selection_method: str = "stepwise"
    univariate_screen: bool = False
    filter_criteria: dict[str, list[str]] = Field(default_factory=dict)
    patient_id_field: str | None = None
    from_state_var: str | None = None
    state_var: str | None = None
    arima_order: list[int] = Field(default_factory=lambda: [1, 1, 1])


class ClinicalDatasetAnalyzeResponse(BaseModel):
    ok: bool = True
    analysis: str
    summary: str = ""
    rows: list[dict[str, Any]] = Field(default_factory=list)
    extra: dict[str, Any] = Field(default_factory=dict)
    error: str = ""
