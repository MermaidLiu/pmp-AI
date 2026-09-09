import { api, type PetCtInterviewRecord } from "./client";

/** CT 合并接口（分割+PCI），同学侧约 5 分钟；经本地上传+转发会略长 */
export const PATHOLOGY_GRADE_TIMEOUT_MS = 900_000;

export type DiagnosisProbability = { label: string; pct: number };

export type PlatformDiagnosis = {
  title: string;
  confidence: number;
  staging: string;
  evidence: string[];
  probabilities: DiagnosisProbability[];
  prognosis: Record<string, string>;
};

export type AssistedDiagnosis = {
  status: string;
  primary_impression: string;
  differential: DiagnosisProbability[];
  rationale: string[];
  guideline_refs: Array<{ fragment_id: string; title: string; version: string; section: string; excerpt: string }>;
  research_context: string[];
  safety_notes: string[];
  model_name: string;
  model_version: string;
  tooluniverse_used: boolean;
  generated_at: string;
};

export async function platformAssistedDiagnosis(
  record: PetCtInterviewRecord,
  imaging?: PathologyImagingGradeResult | null,
) {
  const { data } = await api.post<AssistedDiagnosis>("/api/v1/platform/assisted-diagnosis", {
    record,
    imaging: imaging ?? null,
    use_tooluniverse: true,
  });
  return data;
}

export async function platformSubmitPhysicianFeedback(body: {
  exam_id: string;
  diagnosis: string;
  agreement_score: number;
  final_grade?: string;
  comments?: string;
  physician_name?: string;
}) {
  const { data } = await api.post<{ ok: boolean; feedback_count: number; training_ready_count: number }>(
    "/api/v1/platform/assisted-diagnosis/feedback", body,
  );
  return data;
}

export async function platformOmicsReadiness() {
  const { data } = await api.get<{
    clinical_cases: number; imaging_cases: number; genomic_cases: number; physician_labeled_cases: number; minimum_cases: number;
    modules: Record<string, { label: string; case_count: number; ready: boolean; remaining: number; next_step: string }>;
  }>("/api/v1/platform/omics/readiness");
  return data;
}

export type PlatformPatient = {
  id: string;
  name: string;
  gender: string;
  age: number;
  diagnosis: string;
  stage: string;
  gene: string;
  enrolledAt: string;
  department: string;
  physician: string;
  smoking: string;
  ecog: string;
  chiefComplaint: string;
  pastHistory: string;
  familyHistory: string;
  admissionId: string;
  admissionTime: string;
  gradeLabel?: string;
  followUpStatus?: string;
  examId?: string;
  clinicalSummary?: string;
  pathologySummary?: string;
  imagingSummary?: string;
  pciScore?: number | null;
  hasAnnotatedImage?: boolean;
  modality?: string;
  dicomCount?: number;
  treatmentMethod?: string;
  surgeryNumber?: string;
  ivChemotherapy?: string;
  ccScore?: string;
};

export type PlatformImagingRecord = {
  id: string;
  patientId: string;
  patientName: string;
  modality: string;
  examItem: string;
  examDate: string;
  bodyPart: string;
  suvMax: number | null;
  mtv: number | null;
  tlg: number | null;
  lesionCount: number;
  dicomCount: number;
  hasPet: boolean;
  reportSummary: string;
  reportText: string;
  status: "已归档" | "待审核" | "解析中";
  hasAnnotatedImage?: boolean;
};

export type PlatformPathologyRecord = {
  id: string;
  patientId: string;
  patientName: string;
  sampleSite: string;
  stainType: string;
  gradeLabel: string;
  whoGrade: string;
  ki67: string;
  p53: string;
  pmpSubtype: string;
  slideCount: number;
  reportDate: string;
  pathologist: string;
  summary: string;
  confidence?: number | null;
  dicomCount?: number;
  status: "已签发" | "待复核" | "制片中";
  hasAnnotatedImage?: boolean;
};

export type PublicationTopic = {
  title: string;
  status: string;
  note: string;
  relevance: number;
};

export type PptSlide = {
  page: number;
  title: string;
  bullets: string[];
};

export type AnalysisIntent = {
  question: string;
  variables: string;
  outcome: string;
  notes: string;
};

export type PciRegionScore = {
  index?: number | null;
  key: string;
  label: string;
  score: number | null;
};

export type PciSliceScore = {
  index: number;
  filename: string;
  sc: number | null;
  region?: number | null;
};

export type PciScoreResult = {
  status: string;
  message: string;
  pci_score: number | null;
  is_positive: number | null;
  positive_rate: number | null;
  mesenteric_contracture: number | null;
  regions: PciRegionScore[];
  slice_scores?: PciSliceScore[];
  conclusion?: string;
  report_image_base64?: string;
  dcm_path_used?: string;
  raw?: Record<string, unknown>;
};

export type PathologyImagingGradeResult = {
  status: string;
  message: string;
  grade_label: string;
  confidence: number | null;
  result_image_base64: string;
  dicom_count: number;
  raw?: Record<string, unknown>;
  exam_id?: string;
  saved?: boolean;
  annotation_dataset_id?: string;
  annotation_slice_count?: number;
  annotation_slices_with_mask?: number;
  pci?: PciScoreResult | null;
};

export type AnnotationDatasetSummary = {
  dataset_id: string;
  session_id: string;
  exam_id: string;
  created_at: string;
  slice_count: number;
  slices_with_mask: number;
  total_lesion_pixels: number;
};

export type ChatAnalyzeResult = {
  diagnosis: PlatformDiagnosis;
  record: PetCtInterviewRecord;
  fusion_summary: string;
  ingest_notes: string[];
  pathology_imaging_status: string;
  pathology_imaging?: PathologyImagingGradeResult | null;
  ai_reply?: string;
  llm_model?: string;
  llm_used?: boolean;
  llm_provider?: string;
};

export type ResearchResultRow = {
  factor: string;
  metric: string;
  pValue: string;
  note: string;
  weight?: number;
};

export type CitationValidation = {
  doi?: string;
  pmid?: string;
  status: string;
  checked_at: string;
  message: string;
};

export type KnowledgeLiterature = {
  id: string;
  title: string;
  source: string;
  year: string;
  doi: string;
  pmid: string;
  relevance: number;
  journal?: string;
  doi_validation?: CitationValidation;
  pmid_validation?: CitationValidation;
  cited_at?: string;
  verifiable?: boolean;
  is_demo?: boolean;
  excerpt?: string;
  guideline_fragment_id?: string;
  guideline_version?: string;
};

export type AnswerPoint = { text: string; refs: number[] };

export async function platformChatAnalyze(
  files: File[],
  intent: AnalysisIntent,
  opts?: { llmProvider?: string },
) {
  const form = new FormData();
  files.forEach((f) => form.append("files", f));
  form.append("question", intent.question);
  form.append("variables", intent.variables);
  form.append("outcome", intent.outcome);
  form.append("notes", intent.notes);
  if (opts?.llmProvider) form.append("llm_provider", opts.llmProvider);
  const { data } = await api.post<ChatAnalyzeResult>("/api/v1/platform/chat/analyze", form, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return data;
}

export async function platformChatSave(record: PetCtInterviewRecord) {
  const { data } = await api.post<{ ok: boolean; patient: PlatformPatient; exam_id: string }>(
    "/api/v1/platform/chat/save",
    record,
  );
  return data;
}

export async function platformListPatients(opts?: {
  keyword?: string;
  gradeLabel?: string;
  followUp?: boolean;
}) {
  const params: Record<string, string | boolean> = {};
  if (opts?.keyword?.trim()) params.keyword = opts.keyword.trim();
  if (opts?.gradeLabel && opts.gradeLabel !== "全部") params.grade_label = opts.gradeLabel;
  if (opts?.followUp) params.follow_up = true;
  const { data } = await api.get<PlatformPatient[]>("/api/v1/platform/patients", { params });
  return data;
}

export async function platformListImaging(keyword = "", modality = "") {
  const { data } = await api.get<PlatformImagingRecord[]>("/api/v1/platform/imaging", {
    params: { ...(keyword ? { keyword } : {}), ...(modality ? { modality } : {}) },
  });
  return data;
}

export async function platformRunResearch(body: {
  module: "clinical" | "imaging" | "multimodal";
  task_id: string;
  fields?: string[];
  inclusion?: string;
  exclusion?: string;
  outcome?: string;
  split?: string;
  indicators?: Record<string, string>;
  workflow_context?: Record<string, unknown>;
}) {
  const { data } = await api.post<{
    module: string;
    task_id: string;
    task_title: string;
    rows: ResearchResultRow[];
    summary: string;
    n: number;
    auc?: number;
    c_index?: number;
    pathology_imaging_pending?: boolean;
    pathology_imaging?: PathologyImagingGradeResult | null;
  }>("/api/v1/platform/research/run", body);
  return data;
}

export type RadiomicsExtractResult = {
  ok: boolean;
  feature_count: number;
  features_preview: ResearchResultRow[];
  meta: Record<string, unknown>;
  message: string;
  pyradiomics_available: boolean;
};

export async function platformRadiomicsExtract(
  opts: {
    files?: File[];
    annotationDatasetId?: string;
  } = {},
) {
  const form = new FormData();
  (opts.files ?? []).forEach((f) => form.append("files", f));
  form.append("annotation_dataset_id", opts.annotationDatasetId ?? "");
  const { data } = await api.post<RadiomicsExtractResult>(
    "/api/v1/platform/research/radiomics-extract",
    form,
    {
      headers: { "Content-Type": "multipart/form-data" },
      timeout: PATHOLOGY_GRADE_TIMEOUT_MS,
    },
  );
  return data;
}

export async function platformRadiomicsRun(
  files: File[],
  opts: {
    targetField: string;
    targetValue: string;
    roiDefined: boolean;
    useAnnotatedImage?: boolean;
    annotationDatasetId?: string;
    indicators?: Record<string, string>;
  },
) {
  const form = new FormData();
  files.forEach((f) => form.append("files", f));
  form.append("target_field", opts.targetField);
  form.append("target_value", opts.targetValue);
  form.append("roi_defined", String(opts.roiDefined));
  form.append("use_annotated_image", String(Boolean(opts.useAnnotatedImage)));
  form.append("annotation_dataset_id", opts.annotationDatasetId ?? "");
  form.append("indicators_json", JSON.stringify(opts.indicators ?? {}));
  const { data } = await api.post<{
    rows: ResearchResultRow[];
    summary: string;
    auc?: number;
    task_title: string;
  }>("/api/v1/platform/research/radiomics-run", form, {
    headers: { "Content-Type": "multipart/form-data" },
    timeout: PATHOLOGY_GRADE_TIMEOUT_MS,
  });
  return data;
}

export async function platformPathologyGrade(
  files: File[],
  opts?: {
    returnBase64?: boolean;
    saveToDb?: boolean;
    saveAnnotationDataset?: boolean;
    runPci?: boolean;
    dcmPath?: string;
    useCache?: boolean;
    forceRefresh?: boolean;
  },
) {
  const form = new FormData();
  files.forEach((f) => form.append("files", f));
  form.append("save_to_db", String(opts?.saveToDb ?? false));
  form.append("save_annotation_dataset", String(opts?.saveAnnotationDataset ?? false));
  form.append("return_base64", String(opts?.returnBase64 ?? true));
  form.append("run_pci", String(opts?.runPci ?? true));
  form.append("use_cache", String(opts?.useCache ?? true));
  form.append("force_refresh", String(opts?.forceRefresh ?? false));
  if (opts?.dcmPath?.trim()) form.append("dcm_path", opts.dcmPath.trim());
  const { data } = await api.post<PathologyImagingGradeResult>("/api/v1/platform/pathology/grade", form, {
    headers: { "Content-Type": "multipart/form-data" },
    timeout: PATHOLOGY_GRADE_TIMEOUT_MS,
  });
  return data;
}

export async function platformRetryPci(opts: {
  sessionId?: string;
  examId?: string;
  annotationDatasetId?: string;
  dcmPath?: string;
  uploadNames?: string[];
}) {
  const { data } = await api.post<PciScoreResult>("/api/v1/platform/pathology/pci/retry", {
    session_id: opts.sessionId?.trim() || undefined,
    exam_id: opts.examId?.trim() || undefined,
    annotation_dataset_id: opts.annotationDatasetId?.trim() || undefined,
    dcm_path: opts.dcmPath?.trim() || undefined,
    upload_names: opts.uploadNames?.length ? opts.uploadNames : undefined,
  }, {
    timeout: 180_000,
  });
  return data;
}

export async function platformListAnnotationDatasets() {
  const { data } = await api.get<AnnotationDatasetSummary[]>("/api/v1/platform/pathology/annotation-datasets");
  return data;
}

export function platformAnnotationDatasetDownloadUrl(datasetId: string) {
  return `/api/v1/platform/pathology/annotation-datasets/${encodeURIComponent(datasetId)}/download`;
}

/** Blob download — avoids SPA href/new-tab issues and shows errors in UI. */
export async function platformDownloadAnnotationDataset(datasetId: string): Promise<void> {
  const response = await api.get<Blob>(platformAnnotationDatasetDownloadUrl(datasetId), {
    responseType: "blob",
    timeout: 600_000,
  });
  const blob = response.data;
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${datasetId}_annotations.zip`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export async function platformResearchGradeRun(
  files: File[],
  module: "clinical" | "imaging" | "multimodal",
  taskId: string,
  opts?: {
    inclusion?: string;
    exclusion?: string;
    outcome?: string;
    indicators?: Record<string, string>;
    workflow_context?: Record<string, unknown>;
  },
) {
  const form = new FormData();
  files.forEach((f) => form.append("files", f));
  form.append("module", module);
  form.append("task_id", taskId);
  if (opts?.inclusion) form.append("inclusion", opts.inclusion);
  if (opts?.exclusion) form.append("exclusion", opts.exclusion);
  if (opts?.outcome) form.append("outcome", opts.outcome);
  form.append("indicators_json", JSON.stringify(opts?.indicators ?? {}));
  form.append("workflow_context_json", JSON.stringify(opts?.workflow_context ?? {}));
  const { data } = await api.post<{
    module: string;
    task_id: string;
    task_title: string;
    rows: ResearchResultRow[];
    summary: string;
    n: number;
    auc?: number;
    pathology_imaging_pending?: boolean;
    pathology_imaging?: PathologyImagingGradeResult | null;
  }>("/api/v1/platform/research/grade-run", form, {
    headers: { "Content-Type": "multipart/form-data" },
    timeout: 480000,
  });
  return data;
}

export async function platformKnowledgeSearch(query: string, sources: string[] = [], allowDemo = false) {
  const { data } = await api.post<{
    query: string;
    hit_count: number;
    literature: KnowledgeLiterature[];
    answer_points: AnswerPoint[];
    stats: { hit: number; reviews: number; guidelines: number; selected: number; verifiable?: number };
    search_mode?: string;
    demo_mixed?: boolean;
    searched_at?: string;
    source_errors?: string[];
  }>("/api/v1/platform/knowledge/search", { query, sources, allow_demo: allowDemo });
  return data;
}

export async function platformKnowledgeGenerate(doc_type: string, query: string, literature_ids: string[]) {
  const { data } = await api.post<{
    doc_type: string;
    title: string;
    content: string;
    generated_at?: string;
    citation_records?: KnowledgeLiterature[];
  }>("/api/v1/platform/knowledge/generate", { doc_type, query, literature_ids });
  return data;
}

export async function platformListPathology(keyword = "") {
  const { data } = await api.get<PlatformPathologyRecord[]>("/api/v1/platform/pathology", {
    params: keyword ? { keyword } : {},
  });
  return data;
}

export async function platformSavePathologyAnalysis(
  result: PathologyImagingGradeResult,
  uploadedFileNames: string[] = [],
  record?: PetCtInterviewRecord | null,
) {
  const { data } = await api.post<{ ok: boolean; patient: PlatformPatient; exam_id: string }>(
    "/api/v1/platform/pathology/save",
    {
      result,
      uploaded_file_names: uploadedFileNames,
      ...(record ? { record } : {}),
    },
  );
  return data;
}

export async function platformUpdatePatient(patient: PlatformPatient, examId?: string) {
  const { data } = await api.put<{ ok: boolean; patient: PlatformPatient; exam_id: string }>(
    "/api/v1/platform/patients/update",
    { examId: examId || patient.examId || "", patient },
  );
  return data;
}

export type CarePathwayAnalyzeResult = {
  imaging_report: string;
  api_conclusion: string;
  inferred_diagnosis: string;
  treatment: {
    recommendations: string[];
    evidence_cards?: Array<{
      id: string;
      status: string;
      priority: string;
      recommendation: string;
      guideline_fragments: Array<{
        fragment_id: string;
        guideline_id: string;
        title: string;
        version: string;
        section: string;
        excerpt: string;
        source_type?: string;
        published_at?: string;
      }>;
      patient_evidence: Array<{
        id: string;
        kind: string;
        label: string;
        value: string;
        source: string;
      }>;
      generated_at: string;
      requires_mdt_confirmation: boolean;
    }>;
    grade_label: string;
    mdt_recommended: boolean;
    draft_status?: string;
    guideline_refs: string[];
    llm_used?: boolean;
    llm_model?: string;
  };
  literature: Array<{
    title: string;
    journal: string;
    year: string;
    pmid: string;
    doi?: string;
    verifiable?: boolean;
    cited_at?: string;
    is_demo?: boolean;
  }>;
};

export async function platformCarePathwayAnalyze(
  imaging: PathologyImagingGradeResult,
  record: PetCtInterviewRecord,
  opts?: { llmProvider?: string },
) {
  const { data } = await api.post<CarePathwayAnalyzeResult>("/api/v1/platform/care-pathway/analyze", {
    imaging,
    record,
    llm_provider: opts?.llmProvider || "",
  });
  return data;
}

export async function platformListLlmProviders() {
  const { data } = await api.get<{
    providers: Array<{
      id: "reachapi" | "deepseek";
      label: string;
      model: string;
      configured: boolean;
      base_url: string;
    }>;
    default: string;
  }>("/api/v1/platform/llm/providers");
  return data;
}

export async function platformPublicationTopics(context: Record<string, unknown>) {
  const { data } = await api.post<{
    existing_topics: PublicationTopic[];
    novel_topics: PublicationTopic[];
    summary: string;
  }>("/api/v1/platform/research/publication-topics", context);
  return data;
}

export async function platformPptGenerate(body: {
  scenario: "leadership" | "academic" | "government";
  title: string;
  pathology_grade?: string;
  dicom_count?: number;
  radiomics_summary?: string;
  template_filename?: string;
}) {
  const { data } = await api.post<{
    scenario: string;
    title: string;
    slides: PptSlide[];
    template_note: string;
  }>("/api/v1/platform/research/ppt-generate", body);
  return data;
}

export async function platformStats() {
  const { data } = await api.get<{
    patients: number;
    pending: number;
    analyzing: number;
    diagnosed: number;
    graded: number;
    with_annotation: number;
    imaging: number;
    annotation_models: number;
    llm_model_count?: number;
    llm_provider?: string;
    llm_chat_model?: string;
    dicom_estimate: number;
    prediction_accuracy_pct: number | null;
  }>("/api/v1/platform/stats");
  return data;
}

export type ClinicalAnalyzeResult = {
  ok: boolean;
  analysis: string;
  summary: string;
  rows: Record<string, unknown>[];
  extra: Record<string, unknown>;
  error?: string;
  offline?: boolean;
};

export async function platformClinicalDatasetAnalyze(body: {
  analysis: string;
  rows: Record<string, string>[];
  variables: { name: string; type: string; skipped?: boolean }[];
  selected_vars?: string[];
  split_var?: string;
  group_a?: string;
  group_b?: string;
  dependent?: string;
  independents?: string[];
  outcome_var?: string;
  predictor?: string;
  positive_class?: string;
  time_var?: string;
  event_var?: string;
  feature_vars?: string[];
  ml_model?: string;
  test_size?: number;
  p_threshold?: number;
  selection_method?: string;
  univariate_screen?: boolean;
  filter_criteria?: Record<string, string[]>;
  patient_id_field?: string;
  from_state_var?: string;
  state_var?: string;
  arima_order?: number[];
}) {
  const { data } = await api.post<ClinicalAnalyzeResult>("/api/v1/platform/clinical-dataset/analyze", body);
  return data;
}
