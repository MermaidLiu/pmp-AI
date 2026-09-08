import type { PlatformPatient } from "../api/platform";
import type { ModuleAnalysisResult, ResearchResultRow } from "../data/researchWorkbenchMock";
import { MODALITY_CONTRIBUTION } from "../data/researchWorkbenchMock";
import type { ResearchBatchContext } from "./researchBatchContext";

export type MultimodalDataStats = { label: string; value: string };

export type ModalityContribution = { name: string; pct: number; note: string };

export type FusionModelRow = {
  model: string;
  fusion: string;
  auc: string;
  acc: string;
  f1: string;
  status: string;
};

export type ClinicalPreviewRow = { k: string; v: string };

const STRATEGY_TASK: Record<string, string> = {
  full: "clinical-imaging",
  genetics: "grade-subtype",
  "imaging-clinical": "clinical-imaging",
  "path-clinical": "path-omics",
};

export function strategyToTaskId(strategyId: string): string {
  return STRATEGY_TASK[strategyId] ?? "clinical-imaging";
}

function parseAucFromMetric(metric: string | undefined): number | null {
  if (!metric) return null;
  const m = metric.match(/AUC[=:]?\s*([\d.]+)/i);
  return m ? parseFloat(m[1]) : null;
}

export function extractAuc(result: ModuleAnalysisResult | undefined): number | null {
  if (!result) return null;
  if (result.auc != null) return result.auc;
  for (const row of result.rows) {
    const v = parseAucFromMetric(row.metric);
    if (v != null) return v;
  }
  return null;
}

export function computeMultimodalStats(
  patients: PlatformPatient[],
  batchCtx: ResearchBatchContext | null,
): MultimodalDataStats[] {
  const scoped = scopePatientsToBatch(patients, batchCtx);
  const total = batchCtx?.clinical.length || scoped.length || 0;
  const imaging =
    batchCtx?.imaging.length ?? scoped.filter((p) => p.hasAnnotatedImage || (p.dicomCount ?? 0) > 0).length;
  const clinical = batchCtx?.clinical.length ?? total;
  const pathology = scoped.filter((p) => p.gradeLabel === "高级别" || p.gradeLabel === "低级别").length;
  const gene = scoped.filter((p) => p.gene && p.gene !== "—").length;

  return [
    { label: "总病例", value: total ? String(total) : "—" },
    { label: "影像", value: imaging ? String(imaging) : "—" },
    { label: "临床", value: clinical ? String(clinical) : "—" },
    { label: "病理", value: pathology ? String(pathology) : "—" },
    { label: "基因", value: gene ? String(gene) : "—" },
  ];
}

function scopePatientsToBatch(
  patients: PlatformPatient[],
  batchCtx: ResearchBatchContext | null,
): PlatformPatient[] {
  if (!batchCtx?.clinical.length) return patients;
  const ids = new Set(batchCtx.clinical.flatMap((p) => [p.id, p.examId || ""].filter(Boolean)));
  const hit = patients.filter((p) => ids.has(p.id) || (p.examId && ids.has(p.examId)) || ids.has(p.admissionId));
  return hit.length ? hit : patients;
}

export function computeIntegrity(
  patients: PlatformPatient[],
  batchCtx: ResearchBatchContext | null,
): { label: string; pct: number }[] {
  const scoped = scopePatientsToBatch(patients, batchCtx);
  const total = Math.max(batchCtx?.clinical.length ?? 0, scoped.length, 1);
  const imaging =
    batchCtx?.imaging.length ?? scoped.filter((p) => p.hasAnnotatedImage || (p.dicomCount ?? 0) > 0).length;
  const clinical = batchCtx?.clinical.length ?? scoped.length;
  const pathology = scoped.filter((p) => p.gradeLabel === "高级别" || p.gradeLabel === "低级别").length;
  const gene = scoped.filter((p) => p.gene && p.gene !== "—").length;

  return [
    { label: "影像", pct: total ? Math.round((imaging / total) * 1000) / 10 : 0 },
    { label: "临床", pct: total ? Math.round((clinical / total) * 1000) / 10 : 0 },
    { label: "病理", pct: total ? Math.round((pathology / total) * 1000) / 10 : 0 },
    { label: "基因", pct: total ? Math.round((gene / total) * 1000) / 10 : 0 },
  ];
}

export function firstPatientClinicalPreview(patient: PlatformPatient | undefined): ClinicalPreviewRow[] {
  if (!patient) {
    return [
      { k: "提示", v: "暂无病例" },
    ];
  }
  return [
    { k: "年龄", v: patient.age ? String(patient.age) : "—" },
    { k: "性别", v: patient.gender || "—" },
    { k: "吸烟", v: patient.smoking || "—" },
    { k: "分期", v: patient.stage || "—" },
    { k: "基因", v: patient.gene && patient.gene !== "—" ? patient.gene : "—" },
  ];
}

export function buildModalityContribution(
  linked: { clinical?: ModuleAnalysisResult; imaging?: ModuleAnalysisResult },
  fusionRows: ResearchResultRow[],
): ModalityContribution[] {
  if (fusionRows.length) {
    const total = fusionRows.reduce((s, r) => s + (r.weight ?? 0), 0) || 1;
    return fusionRows.slice(0, 4).map((r) => ({
      name: r.factor,
      pct: Math.round(((r.weight ?? 0) / total) * 100),
      note: r.note,
    }));
  }

  const items: ModalityContribution[] = [];
  const imgW = linked.imaging?.rows[0]?.weight ?? 0;
  const cliW = linked.clinical?.rows[0]?.weight ?? 0;
  if (linked.imaging) items.push({ name: "影像", pct: imgW || 40, note: linked.imaging.taskTitle });
  if (linked.clinical) items.push({ name: "临床", pct: cliW || 30, note: linked.clinical.taskTitle });
  if (!items.length) return MODALITY_CONTRIBUTION;
  const sum = items.reduce((s, i) => s + i.pct, 0) || 1;
  return items.map((i) => ({ ...i, pct: Math.round((i.pct / sum) * 100) }));
}

export function buildFusionModelRanking(
  linked: { clinical?: ModuleAnalysisResult; imaging?: ModuleAnalysisResult },
  fusionResult: ResearchResultRow[] | null,
  fusionLabel: string,
  mainAuc: number | null,
): FusionModelRow[] {
  const rows: FusionModelRow[] = [];

  if (linked.clinical) {
    const auc = extractAuc(linked.clinical);
    rows.push({
      model: "临床模型",
      fusion: "单模态",
      auc: auc != null ? auc.toFixed(3) : linked.clinical.rows[0]?.metric ?? "—",
      acc: "—",
      f1: "—",
      status: "基线",
    });
  }
  if (linked.imaging) {
    const auc = extractAuc(linked.imaging);
    rows.push({
      model: "影像模型",
      fusion: "单模态",
      auc: auc != null ? auc.toFixed(3) : linked.imaging.rows[0]?.metric ?? "—",
      acc: "—",
      f1: "—",
      status: "基线",
    });
  }

  if (fusionResult?.length) {
    rows.push({
      model: "XGBoost",
      fusion: fusionLabel,
      auc: mainAuc != null ? `${mainAuc.toFixed(3)}` : fusionResult[0]?.metric ?? "—",
      acc: "—",
      f1: "—",
      status: "最优模型",
    });
    fusionResult.slice(0, 3).forEach((r, i) => {
      if (i === 0 && rows.some((x) => x.status === "最优模型")) return;
      rows.push({
        model: r.factor,
        fusion: fusionLabel,
        auc: r.metric,
        acc: "—",
        f1: "—",
        status: "候选",
      });
    });
  }

  return rows;
}

export function mergeLinkedFusionRows(
  linked: { clinical?: ModuleAnalysisResult; imaging?: ModuleAnalysisResult },
  taskId: string,
): ResearchResultRow[] {
  const base: ResearchResultRow[] = [
    { factor: "多模态融合", metric: "待运行", pValue: "—", note: "点击「运行多模态融合」", weight: 95 },
  ];

  if (linked.clinical && linked.imaging) {
    return [
      { factor: "多模态融合", metric: "AUC=0.91", pValue: "—", note: "优于单模态（预估）", weight: 95 },
      {
        factor: "临床 + 病理",
        metric: linked.clinical.rows[0]?.metric ?? "—",
        pValue: "—",
        note: `来自临床模块：${linked.clinical.taskTitle}`,
        weight: 72,
      },
      {
        factor: "影像模型",
        metric: linked.imaging.rows[0]?.metric ?? "—",
        pValue: "—",
        note: `来自影像模块：${linked.imaging.taskTitle}`,
        weight: 82,
      },
      ...(linked.clinical.rows.slice(0, 1).map((r) => ({
        ...r,
        factor: `临床·${r.factor}`,
        note: `来自临床模块：${linked.clinical?.taskTitle}`,
      })) ?? []),
      ...(linked.imaging.rows.slice(0, 1).map((r) => ({
        ...r,
        factor: `影像·${r.factor}`,
        note: `来自影像模块：${linked.imaging?.taskTitle}`,
      })) ?? []),
    ];
  }

  if (taskId === "path-omics") {
    return [{ factor: "病理 + 组学融合", metric: "待运行", pValue: "—", note: "运行后更新", weight: 88 }];
  }

  return base;
}
