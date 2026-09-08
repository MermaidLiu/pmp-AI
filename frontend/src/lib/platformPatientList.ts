import { platformListPatients, platformStats, type PlatformPatient } from "../api/platform";
import type { PlatformOverviewStats } from "./homePendingCases";
import { batchCasesToPlatformPatients, loadFollowUpBatch, normalizeVisitId } from "./followUpBatchStore";
import { loadPatients } from "./platformPatients";

export type ListPlatformPatientsOpts = {
  keyword?: string;
  gradeLabel?: string;
  followUp?: boolean;
};

function mergePatientRow(existing: PlatformPatient, incoming: PlatformPatient): PlatformPatient {
  return {
    ...existing,
    ...incoming,
    name: incoming.name && incoming.name !== incoming.id ? incoming.name : existing.name || incoming.name,
    gender: incoming.gender !== "—" ? incoming.gender : existing.gender,
    age: incoming.age || existing.age,
    diagnosis: incoming.diagnosis !== "待诊断" ? incoming.diagnosis : existing.diagnosis,
    gradeLabel: isRicherGrade(incoming.gradeLabel) ? incoming.gradeLabel : existing.gradeLabel,
    pciScore: incoming.pciScore ?? existing.pciScore,
    hasAnnotatedImage: Boolean(incoming.hasAnnotatedImage || existing.hasAnnotatedImage),
    dicomCount: Math.max(incoming.dicomCount ?? 0, existing.dicomCount ?? 0),
    modality: incoming.modality || existing.modality,
    enrolledAt: incoming.enrolledAt || existing.enrolledAt,
    admissionTime: incoming.admissionTime || existing.admissionTime,
    followUpStatus: incoming.followUpStatus || existing.followUpStatus,
    clinicalSummary: incoming.clinicalSummary !== "—" ? incoming.clinicalSummary : existing.clinicalSummary,
    pathologySummary: incoming.pathologySummary !== "—" ? incoming.pathologySummary : existing.pathologySummary,
  };
}

function isRicherGrade(label?: string): boolean {
  return label === "高级别" || label === "低级别";
}

export function dedupePlatformPatients(patients: PlatformPatient[]): PlatformPatient[] {
  const map = new Map<string, PlatformPatient>();
  for (const p of patients) {
    const key = normalizeVisitId(p.id);
    const existing = map.get(key);
    map.set(key, existing ? mergePatientRow(existing, p) : p);
  }
  return Array.from(map.values());
}

/** 与患者数据库页一致：API + 随访批量导入 + 本地缓存合并去重 */
export async function fetchMergedPlatformPatients(
  opts: ListPlatformPatientsOpts = {},
): Promise<PlatformPatient[]> {
  const { keyword, gradeLabel = "全部", followUp = false } = opts;
  try {
    const data = await platformListPatients({
      keyword,
      gradeLabel,
      followUp,
    });
    const batch = loadFollowUpBatch();
    const merged = batch?.cases.length
      ? [...data, ...batchCasesToPlatformPatients(batch.cases)]
      : data;
    return dedupePlatformPatients(merged);
  } catch {
    const local = loadPatients();
    const batch = loadFollowUpBatch();
    const merged = batch?.cases.length
      ? [...local, ...batchCasesToPlatformPatients(batch.cases)]
      : local;
    return dedupePlatformPatients(merged);
  }
}

export async function fetchPlatformOverviewStats(): Promise<PlatformOverviewStats | null> {
  try {
    return await platformStats();
  } catch {
    return null;
  }
}
