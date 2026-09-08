import { platformClinicalDatasetAnalyze, type ClinicalAnalyzeResult } from "../../api/platform";
import type { ClinicalDataset } from "./types";
import { computeDescriptiveStats, computeGroupCompare } from "./statsCompute";

export type AnalyzeKind =
  | "desc"
  | "sig"
  | "corr"
  | "roc"
  | "consistency"
  | "multi_reg"
  | "logistic"
  | "survival"
  | "cox"
  | "markov"
  | "arimax"
  | "ml";

export type AnalyzeParams = {
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
};

function datasetPayload(ds: ClinicalDataset) {
  return {
    rows: ds.rows,
    variables: ds.variables.map((v) => ({ name: v.name, type: v.type, skipped: v.skipped ?? false })),
  };
}

/** 优先调用后端真实运算；失败时回退本地计算（描述/简易显著性） */
export async function runClinicalAnalysis(
  ds: ClinicalDataset,
  analysis: AnalyzeKind,
  params: AnalyzeParams = {},
): Promise<ClinicalAnalyzeResult> {
  try {
    return await platformClinicalDatasetAnalyze({
      analysis,
      ...datasetPayload(ds),
      ...params,
    });
  } catch (err) {
    const detail =
      (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ??
      (err instanceof Error ? err.message : "分析失败");
    if (analysis === "desc") {
      const rows = computeDescriptiveStats(ds);
      const filtered = params.selected_vars?.length
        ? rows.filter((r) => params.selected_vars!.includes(r.variable))
        : rows;
      return {
        ok: true,
        analysis,
        summary: `描述性统计（本地）· ${filtered.length} 个变量`,
        rows: filtered as Record<string, unknown>[],
        extra: {},
        offline: true,
      };
    }
    if (analysis === "sig" && params.split_var) {
      const gv = ds.variables.find((v) => v.name === params.split_var);
      if (!gv) throw err;
      const groups = [...new Set(ds.rows.map((r) => r[params.split_var!]).filter(Boolean))];
      const ga = params.group_a ?? groups[0];
      const gb = params.group_b ?? groups[1];
      const rows = computeGroupCompare(ds, gv, ga, gb);
      return {
        ok: true,
        analysis,
        summary: `显著性分析（本地近似）· ${ga} vs ${gb}`,
        rows: rows as unknown as Record<string, unknown>[],
        extra: {},
        offline: true,
      };
    }
    throw new Error(typeof detail === "string" ? detail : "分析失败，请确认后端已启动并已安装 scipy/statsmodels/lifelines");
  }
}
