import type { PathologyAnalysisResult, PetCtInterviewRecord } from "../api/client";
import type { PathologyImagingGradeResult, PciScoreResult } from "../api/platform";
import { platformCarePathwayAnalyze } from "../api/platform";
import { buildPciConclusion } from "./pciRegions";
import { getWorkflowCase } from "./workflowCase";

function getPci(imaging: PathologyImagingGradeResult): PciScoreResult | undefined {
  return imaging.pci ?? (imaging.raw?.pci as PciScoreResult | undefined);
}

/** Infer histologic grade from API conclusion — PCI score is tumor burden, not grade. */
export function inferHistologicGradeLabel(...texts: (string | undefined | null)[]): string {
  for (const raw of texts) {
    const s = String(raw || "").trim();
    if (s === "高级别" || s === "低级别" || s === "未确定") return s;
  }
  const combined = texts.map((t) => String(t || "")).join(" ");
  if (!combined.trim()) return "";
  const low =
    /低级别|低级|G1|高分化|交界性|LAMN|黏液性.*低/i.test(combined) &&
    !/高级别|G3|低分化|未分化/i.test(combined);
  const high = /高级别|G3|低分化|未分化|高级别浆液/i.test(combined);
  if (low && !high) return "低级别";
  if (high && !low) return "高级别";
  if (low && high) return "未确定";
  return "";
}

export type GuidelineFragmentRef = {
  fragment_id: string;
  guideline_id: string;
  title: string;
  version: string;
  section: string;
  excerpt: string;
  source_type?: string;
  published_at?: string;
};

export type PatientEvidenceRef = {
  id: string;
  kind: string;
  label: string;
  value: string;
  source: string;
};

export type TreatmentEvidenceCard = {
  id: string;
  status: string;
  priority: string;
  recommendation: string;
  guideline_fragments: GuidelineFragmentRef[];
  patient_evidence: PatientEvidenceRef[];
  generated_at: string;
  requires_mdt_confirmation: boolean;
};

export type CarePathwayResult = {
  imaging_report: string;
  api_conclusion: string;
  inferred_diagnosis: string;
  treatment: {
    recommendations: string[];
    evidence_cards?: TreatmentEvidenceCard[];
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

/** Merge workflow clinical fields + platform imaging/PCI into a case record for care-pathway API. */
export function buildRecordForCarePathway(
  imaging: PathologyImagingGradeResult,
  examId?: string,
): PetCtInterviewRecord {
  const base = getWorkflowCase();
  const pci = getPci(imaging);
  const pciConclusion = pci?.conclusion?.trim() || (pci ? buildPciConclusion(pci) : "");

  const resolvedExamId =
    examId?.trim() ||
    imaging.exam_id?.trim() ||
    base.patient_base_info.exam_id?.trim() ||
    `CASE-${Date.now()}`;

  const gradeHint =
    inferHistologicGradeLabel(pciConclusion, imaging.message, imaging.grade_label) ||
    base.research_extensions?.pathology_grade ||
    "";

  return {
    ...base,
    patient_base_info: {
      ...base.patient_base_info,
      exam_id: resolvedExamId,
      name: base.patient_base_info.name || "待命名病例",
      exam_item: base.patient_base_info.exam_item || "DICOM 影像 + 临床综合评估",
    },
    research_extensions: {
      ...base.research_extensions,
      pathology_grade: gradeHint || base.research_extensions?.pathology_grade || "",
      imaging_report_text: pciConclusion,
      pet_ct_report_narrative: pciConclusion,
      pathology_confidence: imaging.confidence ?? base.research_extensions?.pathology_confidence ?? null,
    },
  };
}

/** Imaging report text from CT API PCI conclusion only (no rule-engine summary). */
export function buildImagingReportText(imaging: PathologyImagingGradeResult): string {
  const pci = getPci(imaging);
  const conclusion =
    pci?.conclusion?.trim() ||
    (pci ? buildPciConclusion(pci) : "") ||
    imaging.message.split(/[·•]/)[0]?.trim() ||
    "接口未返回文字结论，请查看 PCI 评分与分割结果。";

  const lines = ["【影像分析报告】", "来源：CT 合并接口（分割 + PCI）", "", conclusion];
  if (pci?.pci_score != null) lines.push("", `PCI 总分：${pci.pci_score}/36`);
  return lines.join("\n");
}

export async function runCarePathwayAnalysis(
  imaging: PathologyImagingGradeResult,
  examId?: string,
  llmProvider?: string,
): Promise<CarePathwayResult> {
  const record = buildRecordForCarePathway(imaging, examId);
  return platformCarePathwayAnalyze(imaging, record, { llmProvider });
}

/** Minimal PathologyAnalysisResult for follow-up queue enrollment. */
export function buildPathologyAnalysisStub(care: CarePathwayResult): PathologyAnalysisResult {
  const grade =
    inferHistologicGradeLabel(care.api_conclusion) ||
    care.treatment.grade_label ||
    "未确定";
  const composite = grade === "高级别" ? 72 : grade === "低级别" ? 28 : 50;
  return {
    diagnosis_summary: care.api_conclusion,
    inferred_diagnosis: care.inferred_diagnosis,
    grading: {
      grade_label: grade,
      pathology_grade: grade,
      grade_system: "WHO / PCI",
      who_grade: grade === "高级别" ? "G3" : grade === "低级别" ? "G1" : "—",
      composite_score: composite,
      score_level: grade === "高级别" ? "高危" : grade === "低级别" ? "低危" : "中危",
      confidence: 0.85,
      score_breakdown: {},
      score_interpretation: care.api_conclusion,
      evidence: [care.api_conclusion],
      biomarkers_suggested: [],
    },
    treatment: care.treatment,
    literature: care.literature,
    multimodal_notes: [],
  };
}
