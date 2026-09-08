import type { PlatformImagingRecord, PlatformPatient } from "../api/platform";

const BATCH_KEY = "pmp_followup_batch";
export const FOLLOWUP_BATCH_IMPORTED_EVENT = "pmp-followup-batch-imported";

export type FollowUpBatchCase = {
  visitId: string;
  name: string;
  gender: string;
  age: string;
  gradeLabel: string;
  pciScore: number | null;
  pathology: string;
  diagnosis: string;
  niiVolumeId: string | null;
  niiFileName: string | null;
  ctVolumeId: string | null;
  ctFileName: string | null;
  labs: Record<string, string>;
  raw: Record<string, string>;
  importedAt: string;
};

export type FollowUpBatchState = {
  excelFileName: string | null;
  zipFileName: string | null;
  importedAt: string;
  cases: FollowUpBatchCase[];
  matchedCount: number;
  unmatchedVisitIds: string[];
  unmatchedNiiFiles: string[];
};

export function loadFollowUpBatch(): FollowUpBatchState | null {
  try {
    const raw = localStorage.getItem(BATCH_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as FollowUpBatchState;
  } catch {
    return null;
  }
}

export function saveFollowUpBatch(state: FollowUpBatchState): void {
  localStorage.setItem(BATCH_KEY, JSON.stringify(state));
  window.dispatchEvent(new CustomEvent(FOLLOWUP_BATCH_IMPORTED_EVENT, { detail: state }));
}

export function getFollowUpBatchCase(visitId: string): FollowUpBatchCase | undefined {
  const batch = loadFollowUpBatch();
  if (!batch) return undefined;
  return batch.cases.find((c) => visitIdsEqual(c.visitId, visitId));
}

export function visitIdsEqual(a: string, b: string): boolean {
  const na = normalizeVisitId(a);
  const nb = normalizeVisitId(b);
  if (na === nb) return true;
  return padVisitId(a) === padVisitId(b);
}

export function normalizeVisitId(id: string): string {
  const t = id.trim();
  const stripped = t.replace(/^0+/, "");
  return stripped || "0";
}

export function padVisitId(id: string, len = 10): string {
  const t = id.trim();
  if (/^\d+$/.test(t)) return t.padStart(len, "0");
  return t;
}

/** Parse roi_0000016651-0002_....nii.gz → 0000016651 */
export function parseVisitIdFromRoiFileName(fileName: string): string | null {
  const base = fileName.split("/").pop() || fileName;
  const m = base.match(/^roi_([^-]+)/i);
  return m?.[1]?.trim() || null;
}

/** 从多种常见 NIfTI 文件名格式推断就诊号 */
export function parseVisitIdFromNiiFileName(fileName: string): string | null {
  const fromRoi = parseVisitIdFromRoiFileName(fileName);
  if (fromRoi) return padVisitId(fromRoi);

  const base = (fileName.split("/").pop() || fileName).replace(/\.(nii\.gz|nii|gz)$/gi, "");

  const tenDigit = base.match(/\b(\d{10})\b/);
  if (tenDigit) return tenDigit[1];

  const embedded = base.match(/(?:^|[_\-.])(\d{8,12})(?:[_\-.]|$)/);
  if (embedded) return padVisitId(embedded[1]);

  const leading = base.match(/^(\d{6,12})/);
  if (leading) return padVisitId(leading[1]);

  return null;
}

/** 在文件名中查找与 Excel 就诊号匹配的片段 */
export function findVisitIdInFileName(fileName: string, visitIds: string[]): string | null {
  const lower = fileName.toLowerCase();
  for (const id of visitIds) {
    const variants = new Set([id, normalizeVisitId(id), padVisitId(id)].filter(Boolean));
    for (const v of variants) {
      if (v.length >= 6 && lower.includes(v.toLowerCase())) return id;
    }
  }
  return null;
}

export function batchCasesToPlatformPatients(cases: FollowUpBatchCase[]): PlatformPatient[] {
  const today = new Date().toISOString().slice(0, 10);
  return cases.map((c) => ({
    id: c.visitId,
    name: c.name || c.visitId,
    gender: c.gender || "—",
    age: parseInt(c.age.replace(/\D/g, ""), 10) || 0,
    diagnosis: c.diagnosis || "—",
    stage: "—",
    gene: "—",
    enrolledAt: today,
    department: "—",
    physician: "—",
    smoking: "—",
    ecog: "—",
    chiefComplaint: "—",
    pastHistory: "—",
    familyHistory: "—",
    admissionId: c.visitId,
    admissionTime: "—",
    gradeLabel: c.gradeLabel,
    pciScore: c.pciScore,
    clinicalSummary: c.pathology.slice(0, 120) || "—",
    pathologySummary: c.pathology.slice(0, 120) || "—",
    examId: c.visitId,
    hasAnnotatedImage: Boolean(c.niiVolumeId),
    followUpStatus: "随访中",
    modality: "CT",
    dicomCount: c.niiVolumeId ? 1 : 0,
  }));
}

export function batchCasesToImagingRecords(cases: FollowUpBatchCase[]): PlatformImagingRecord[] {
  return cases
    .filter((c) => c.niiVolumeId)
    .map((c) => ({
      id: c.visitId,
      patientId: c.visitId,
      patientName: c.name || c.visitId,
      modality: "CT",
      examItem: "腹盆 CT · 预勾画 NIfTI",
      examDate: new Date().toISOString().slice(0, 10),
      bodyPart: "腹盆",
      suvMax: null,
      mtv: null,
      tlg: null,
      lesionCount: 1,
      dicomCount: 1,
      hasPet: false,
      reportSummary: c.pathology.slice(0, 80) || `预勾画 ${c.niiFileName || ""}`,
      reportText: c.pathology.slice(0, 500),
      status: "已归档" as const,
      hasAnnotatedImage: true,
    }));
}
