import type { PathologyAnalysisResult, PetCtInterviewRecord } from "../api/client";
import { mapWorkflowRecordToTemplateRow, saveWorkflowClinicalBridgeEntry } from "./clinicalDataset/template";
import { saveWorkflowCase } from "./workflowCase";

const FOLLOWUP_KEY = "pmp_followup_queue";
export const FOLLOWUP_PHENOTYPE_TAG = "随访队列";

export type FollowUpEntry = {
  exam_id: string;
  clinical_diagnosis: string;
  grade_label: string;
  who_grade: string;
  composite_score: number;
  department: string;
  age: number;
  gender: string;
  enrolled_at: string;
};

function readQueue(): FollowUpEntry[] {
  try {
    const raw = localStorage.getItem(FOLLOWUP_KEY);
    if (raw) return JSON.parse(raw) as FollowUpEntry[];
  } catch {
    /* ignore */
  }
  return [];
}

function writeQueue(entries: FollowUpEntry[]): void {
  localStorage.setItem(FOLLOWUP_KEY, JSON.stringify(entries));
}

export function listFollowUpQueue(): FollowUpEntry[] {
  return readQueue();
}

export function isInFollowUpQueue(examId: string): boolean {
  if (!examId) return false;
  return readQueue().some((e) => e.exam_id === examId);
}

export function enrichRecordWithPathology(
  record: PetCtInterviewRecord,
  analysis: PathologyAnalysisResult,
): PetCtInterviewRecord {
  const g = analysis.grading;
  const tags = new Set(record.research_extensions?.pet_ct_phenotype_tags || []);
  tags.add(FOLLOWUP_PHENOTYPE_TAG);
  return {
    ...record,
    research_extensions: {
      ...record.research_extensions,
      primary_disease_code: record.research_extensions?.primary_disease_code || "PATH",
      pathology_grade: g.grade_label,
      pathology_confidence: g.confidence,
      pathology_evidence: g.evidence,
      pet_ct_phenotype_tags: Array.from(tags),
    },
  };
}

export async function addToFollowUpQueue(
  record: PetCtInterviewRecord,
  analysis: PathologyAnalysisResult,
  persist: (r: PetCtInterviewRecord) => Promise<unknown>,
): Promise<FollowUpEntry> {
  const examId = record.patient_base_info.exam_id?.trim() || `CASE-${Date.now()}`;
  const enriched = enrichRecordWithPathology(
    {
      ...record,
      patient_base_info: { ...record.patient_base_info, exam_id: examId },
    },
    analysis,
  );
  saveWorkflowCase(enriched);
  await persist(enriched);

  // 工作台临床 → 科研 Excel 模板桥接，供随访→科研分析自动映射
  const tpl = mapWorkflowRecordToTemplateRow(enriched);
  saveWorkflowClinicalBridgeEntry(examId, tpl);
  if (tpl.患者ID) saveWorkflowClinicalBridgeEntry(tpl.患者ID, tpl);

  const entry: FollowUpEntry = {
    exam_id: examId,
    clinical_diagnosis: enriched.interview_info.clinical_diagnosis || analysis.inferred_diagnosis,
    grade_label: analysis.grading.grade_label,
    who_grade: analysis.grading.who_grade,
    composite_score: analysis.grading.composite_score,
    department: enriched.patient_base_info.department || "",
    age: enriched.patient_base_info.age || 0,
    gender: enriched.patient_base_info.gender || "",
    enrolled_at: new Date().toISOString(),
  };

  const queue = readQueue().filter((e) => e.exam_id !== examId);
  queue.unshift(entry);
  writeQueue(queue);
  return entry;
}
