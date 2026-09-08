import axios from "axios";
import { getAuthToken, getGuestId } from "../lib/authSession";

export const api = axios.create({
  baseURL: "",
  timeout: 120000,
});

api.interceptors.request.use((config) => {
  config.headers.set("X-Guest-Id", getGuestId());
  const token = getAuthToken();
  if (token) {
    config.headers.set("Authorization", `Bearer ${token}`);
  }
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (error) => {
    const status = error?.response?.status;
    const detail = error?.response?.data?.detail;
    if (status === 402) {
      window.dispatchEvent(
        new CustomEvent("pmp-quota-exceeded", {
          detail: typeof detail === "object" ? detail : { message: String(detail || "额度已用尽") },
        }),
      );
    }
    return Promise.reject(error);
  },
);

export type PatientBaseInfo = {
  name: string;
  gender: string;
  age: number;
  phone: string;
  source: string;
  exam_id: string;
  medical_record_id: string;
  admission_id: string;
  outpatient_id: string;
  department: string;
  doctor_phone: string;
  exam_item: string;
  height_cm: number;
  weight_kg: number;
  interview_doctor: string;
  interview_time: string | null;
  patient_type: string[];
  is_free_report: boolean;
};

export type ResearchExtensions = {
  patient_internal_id?: string;
  primary_disease_code?: string;
  primary_disease_name?: string;
  pet_ct_phenotype_tags?: string[];
  fuo_profile?: Record<string, string>;
  thyroid_panel_structured?: Record<string, string>;
  lab_snapshot?: Record<string, string>;
  pet_ct_report_narrative?: string;
  imaging_report_text?: string;
  lesions?: Array<Record<string, unknown>>;
  global_quant?: { suv_max?: number | null; suv_mean?: number | null; mtv?: number | null; tlg?: number | null };
  prior_exam_ids?: string[];
  document_uploads?: Array<Record<string, unknown>>;
};

export type PetCtInterviewRecord = {
  patient_base_info: PatientBaseInfo;
  interview_info: Record<string, unknown>;
  supplementary_interview_info: Record<string, unknown>;
  research_extensions?: ResearchExtensions;
};

export type Disease = {
  id: number;
  code: string;
  name: string;
  category: string;
  description: string;
};

export async function saveCase(record: PetCtInterviewRecord) {
  const { data } = await api.post<PetCtInterviewRecord>("/api/v1/cases", record);
  return data;
}

export async function runResearch(record: PetCtInterviewRecord & { research_topic: string }) {
  const { data } = await api.post<{ output: string }>("/api/v1/research/run", record);
  return data;
}

export async function analyzePetCt(payload: Record<string, unknown>) {
  const { data } = await api.post<Record<string, unknown>>("/api/v1/petct/analyze", payload);
  return data;
}

export async function uploadFormImage(file: File) {
  const form = new FormData();
  form.append("file", file);
  const { data } = await api.post<Record<string, unknown>>("/api/v1/extract_data", form, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return data;
}

export async function listDiseases() {
  const { data } = await api.get<Disease[]>("/api/v1/diseases");
  return data;
}

export async function batchIngest(files: File[], persist: boolean) {
  const form = new FormData();
  files.forEach((f) => form.append("files", f));
  const { data } = await api.post<BatchIngestItem[]>(`/api/v1/modules/ingestion/batch?persist=${persist}`, form, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return data;
}

export type BatchIngestItem = {
  filename: string;
  ok: boolean;
  detail?: string;
  parsed?: Record<string, unknown>;
};

export async function classifyDisease(record: PetCtInterviewRecord, persist: boolean) {
  const { data } = await api.post<{ record: PetCtInterviewRecord }>(
    `/api/v1/modules/disease/classify?persist=${persist}&parse_report_metrics=true`,
    record,
  );
  return data;
}

export async function cohortSummary(filters: Record<string, unknown>) {
  const { data } = await api.post<Record<string, unknown>>("/api/v1/modules/disease/cohort-summary", filters);
  return data;
}

export async function runAgentExtended(body: {
  record: PetCtInterviewRecord;
  research_topic: string;
  tasks: string[];
}) {
  const { data } = await api.post<{ parts: Record<string, string> }>("/api/v1/modules/agent/run-extended", body);
  return data;
}

export async function fuseMultimodal(record: PetCtInterviewRecord) {
  const { data } = await api.post<Record<string, unknown>>("/api/v1/modules/multimodal/fuse", record);
  return data;
}

export async function cohortQuery(filters: Record<string, unknown>) {
  const { data } = await api.post<{ n: number; records: PetCtInterviewRecord[] }>(
    "/api/v1/modules/cohort/query",
    filters,
  );
  return data;
}

export async function followupCompare(baseline: string, followup: string) {
  const { data } = await api.post<Record<string, unknown>>("/api/v1/modules/cohort/followup-compare", {
    exam_id_baseline: baseline,
    exam_id_followup: followup,
  });
  return data;
}

export async function outputReport(record: PetCtInterviewRecord, extra?: Record<string, unknown>) {
  const { data } = await api.post<{ format: string; content: string }>("/api/v1/modules/outputs/report", {
    record,
    extra: extra ?? {},
  });
  return data;
}

export async function outputPpt(record: PetCtInterviewRecord, research_topic?: string) {
  const body =
    research_topic != null && research_topic !== ""
      ? { ...record, research_topic }
      : record;
  const { data } = await api.post<{ slides: Array<{ title: string; bullets: string }> }>(
    "/api/v1/modules/outputs/ppt-outline",
    body,
  );
  return data;
}

export async function outputCaseReview(record: PetCtInterviewRecord) {
  const { data } = await api.post<Record<string, unknown>>("/api/v1/modules/outputs/case-review", record);
  return data;
}

export type PathologyGradingDetail = {
  grade_label: string;
  pathology_grade: string;
  grade_system: string;
  who_grade: string;
  composite_score: number;
  score_level: string;
  confidence: number;
  score_breakdown: Record<string, number>;
  score_interpretation: string;
  evidence: string[];
  biomarkers_suggested: string[];
};

export type TreatmentRecommendation = {
  grade_label: string;
  recommendations: string[];
  guideline_refs: string[];
  mdt_recommended: boolean;
  draft_status?: string;
  evidence_cards?: Array<Record<string, unknown>>;
  llm_used?: boolean;
  llm_model?: string;
};

export type FeatureContributionItem = {
  feature: string;
  display_name: string;
  value: number;
  contribution: number;
  direction: string;
};

export type FeatureImportanceItem = {
  feature: string;
  display_name: string;
  importance: number;
};

export type ModelExplainability = {
  probabilities: Record<string, number>;
  feature_contributions: FeatureContributionItem[];
  global_feature_importance: FeatureImportanceItem[];
  prediction_source: string;
  explanation_method: string;
  pmp_evidence: string[];
};

export type PathologyAnalysisResult = {
  diagnosis_summary: string;
  inferred_diagnosis: string;
  grading: PathologyGradingDetail;
  treatment: TreatmentRecommendation;
  literature: Array<{ title: string; journal: string; year: string; pmid: string }>;
  multimodal_notes: string[];
  explainability?: ModelExplainability;
};

export type PathologyBatchCohortResult = {
  total: number;
  high_grade_count: number;
  low_grade_count: number;
  unknown_count: number;
  high_grade_cases: Array<Record<string, unknown>>;
  low_grade_cases: Array<Record<string, unknown>>;
  summary: string;
  target_distribution_note: string;
};

export type ClinicalCorrelationResult = {
  input_indicators: Record<string, string | number>;
  correlated_factors: Array<Record<string, unknown>>;
  literature: Array<{ title: string; journal: string; year: string; pmid: string }>;
  analysis_suggestions: string[];
  accumulated_cases_note: string;
};

export async function analyzePathology(record: PetCtInterviewRecord) {
  const { data } = await api.post<PathologyAnalysisResult>("/api/v1/modules/pathology/analyze", record);
  return data;
}

export async function pathologyBatchCohort(files: File[]) {
  const form = new FormData();
  files.forEach((f) => form.append("files", f));
  const { data } = await api.post<PathologyBatchCohortResult>("/api/v1/modules/pathology/batch-cohort", form, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return data;
}

export async function correlatePathology(body: {
  indicators: Record<string, string | number>;
  disease_context?: string;
}) {
  const { data } = await api.post<ClinicalCorrelationResult>("/api/v1/modules/pathology/correlation", body);
  return data;
}

export type TrainingStatus = {
  db_case_count: number;
  csv_exists: boolean;
  csv_path: string;
  model_exists: boolean;
  model_path: string;
  last_training: Record<string, unknown>;
  feature_importance?: FeatureImportanceItem[];
};

export type TrainingExportResult = {
  csv_path: string;
  total_rows: number;
  high_grade_count: number;
  low_grade_count: number;
  preview: Array<Record<string, unknown>>;
  meta?: Record<string, unknown>;
};

export type TrainingRunResult = {
  ok: boolean;
  message: string;
  accuracy: number;
  samples: number;
  high_grade_count: number;
  low_grade_count: number;
  model_path: string;
  feature_cols: string[];
  feature_importance?: FeatureImportanceItem[];
  meta?: Record<string, unknown>;
};

export async function getTrainingStatus() {
  const { data } = await api.get<TrainingStatus>("/api/v1/modules/training/status");
  return data;
}

export async function exportTrainingData() {
  const { data } = await api.post<TrainingExportResult>("/api/v1/modules/training/export");
  return data;
}

export async function runTraining() {
  const { data } = await api.post<TrainingRunResult>("/api/v1/modules/training/run");
  return data;
}

export function downloadTrainingCsv() {
  window.open("/api/v1/modules/training/download-csv", "_blank");
}
