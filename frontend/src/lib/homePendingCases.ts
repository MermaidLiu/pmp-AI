import type { PlatformPatient } from "../api/platform";
import type { HomeOverviewStat, HomePendingCase } from "../data/platformHomeMock";

export type PlatformOverviewStats = {
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
};

export type PatientSummary = {
  total: number;
  pending: number;
  analyzing: number;
  diagnosed: number;
  graded: number;
  withAnnotation: number;
  predictionAccuracyPct: number | null;
};

const STATUS_ORDER: Record<HomePendingCase["status"], number> = {
  待诊断: 0,
  分析中: 1,
  已完成: 2,
};

export function isPatientGraded(p: PlatformPatient): boolean {
  return p.gradeLabel === "高级别" || p.gradeLabel === "低级别";
}

export function isPatientDiagnosed(p: PlatformPatient): boolean {
  return p.pciScore != null || isPatientGraded(p);
}

export function isPatientAnalyzing(p: PlatformPatient): boolean {
  if (isPatientDiagnosed(p)) return false;
  return Boolean(p.hasAnnotatedImage || (p.dicomCount ?? 0) > 0);
}

export function derivePatientCaseStatus(p: PlatformPatient): HomePendingCase["status"] {
  if (isPatientDiagnosed(p)) return "已完成";
  if (isPatientAnalyzing(p)) return "分析中";
  return "待诊断";
}

export function summarizePatients(patients: PlatformPatient[]): PatientSummary {
  let pending = 0;
  let analyzing = 0;
  let diagnosed = 0;
  let graded = 0;
  let withAnnotation = 0;

  for (const p of patients) {
    const status = derivePatientCaseStatus(p);
    if (status === "待诊断") pending += 1;
    else if (status === "分析中") analyzing += 1;
    else diagnosed += 1;
    if (isPatientGraded(p)) graded += 1;
    if (p.hasAnnotatedImage) withAnnotation += 1;
  }

  const denom = diagnosed + analyzing;
  const predictionAccuracyPct =
    denom > 0 ? Math.round((diagnosed / denom) * 1000) / 10 : null;

  return {
    total: patients.length,
    pending,
    analyzing,
    diagnosed,
    graded,
    withAnnotation,
    predictionAccuracyPct,
  };
}

export function platformPatientToHomeCase(p: PlatformPatient): HomePendingCase {
  const examTime = [p.enrolledAt, p.admissionTime].filter(Boolean).join(" ") || "—";
  return {
    id: p.id,
    name: p.name || p.id,
    age: p.age || 0,
    examType: p.modality || "CT",
    examTime,
    status: derivePatientCaseStatus(p),
  };
}

export function buildHomePendingCases(patients: PlatformPatient[], limit = 8): HomePendingCase[] {
  return patients
    .map(platformPatientToHomeCase)
    .sort((a, b) => {
      const byStatus = STATUS_ORDER[a.status] - STATUS_ORDER[b.status];
      if (byStatus !== 0) return byStatus;
      return b.examTime.localeCompare(a.examTime);
    })
    .slice(0, limit);
}

/** 合并本地随访批量与后端统计，首页以实际患者列表为准 */
export function buildHomeOverviewStats(
  patients: PlatformPatient[],
  platform?: PlatformOverviewStats | null,
): HomeOverviewStat[] {
  const summary = summarizePatients(patients);
  const llmCount = platform?.llm_model_count ?? 0;
  const modelCount = llmCount > 0 ? llmCount : Math.max(summary.withAnnotation, platform?.annotation_models ?? 0);
  const accuracy =
    summary.predictionAccuracyPct != null
      ? `${summary.predictionAccuracyPct}%`
      : platform?.prediction_accuracy_pct != null
        ? `${platform.prediction_accuracy_pct}%`
        : "—";

  return [
    {
      key: "pending",
      label: "待诊断病例",
      value: String(summary.pending + summary.analyzing),
      delta:
        summary.analyzing > 0
          ? `${summary.analyzing} 例分析中`
          : summary.pending > 0
            ? `${summary.pending} 例待上传`
            : "暂无待处理",
      deltaUp: summary.analyzing > 0,
    },
    {
      key: "done",
      label: "已诊断病例",
      value: String(summary.diagnosed),
      delta: `共 ${summary.total} 例在库`,
      deltaUp: summary.diagnosed > 0,
    },
    {
      key: "models",
      label: "模型数量",
      value: String(modelCount),
      delta:
        llmCount > 0
          ? `ReachAPI · 默认 ${platform?.llm_chat_model || "gpt-5.6-sol"}`
          : platform?.imaging != null
            ? `${platform.imaging} 例有影像 · ${summary.withAnnotation} 例已分割`
            : `${summary.withAnnotation} 例已分割`,
      deltaUp: modelCount > 0,
    },
    {
      key: "accuracy",
      label: "预测准确率",
      value: accuracy,
      delta:
        summary.graded > 0
          ? `已分级 ${summary.graded} 例`
          : summary.diagnosed > 0
            ? `${summary.diagnosed} 例已完成 PCI/分级`
            : "待完成分析",
      deltaUp: (summary.predictionAccuracyPct ?? 0) > 0,
    },
  ];
}
