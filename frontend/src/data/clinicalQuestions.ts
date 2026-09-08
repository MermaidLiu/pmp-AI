/** 科研工作台 · 临床问题模板（要回答的临床问题，非特征/算法） */

export type ClinicalQuestionId =
  | "single_case"
  | "pathology_binary"
  | "disease_discrimination"
  | "genotype_binary"
  | "prognosis_survival"
  | "deeplearn_lesion"
  | "custom";

export type OutcomeType = "binary" | "multiclass" | "survival" | "regression";
export type ModelingApproach = "radiomics_ml" | "deep_learning" | "multimodal_fusion" | "traditional_stats";

export type ClinicalQuestion = {
  id: ClinicalQuestionId;
  title: string;
  /** 用自然语言描述要回答的临床问题 */
  hypothesis: string;
  outcomeType: OutcomeType;
  /** 由分析任务决定，不在「临床问题」面板展示 */
  modelingApproach: ModelingApproach;
  groupA: string;
  groupB: string;
  /** 临床结局 / 判定依据 */
  targetField: string;
  positiveClass: string;
  notes: string;
};

export type ClinicalQuestionTemplate = {
  id: ClinicalQuestionId;
  label: string;
  desc: string;
  defaultOutcome: OutcomeType;
  defaultModeling: ModelingApproach;
  defaultHypothesis: string;
  defaultGroupA: string;
  defaultGroupB: string;
  defaultTargetField: string;
  defaultPositiveClass: string;
  suggestedTasks?: string[];
};

export const CLINICAL_QUESTION_TEMPLATES: ClinicalQuestionTemplate[] = [
  {
    id: "single_case",
    label: "单病例 · 本例诊断",
    desc: "本例影像能否支持某种诊断？病灶范围与临床意义是什么？",
    defaultOutcome: "binary",
    defaultModeling: "deep_learning",
    defaultHypothesis: "本例 CT 影像的病灶性质是什么？最可能的诊断及需与哪些疾病鉴别？",
    defaultGroupA: "本例",
    defaultGroupB: "",
    defaultTargetField: "本例诊断结论",
    defaultPositiveClass: "待病理或临床确认",
    suggestedTasks: ["radiomics", "deeplearn", "grade-pred"],
  },
  {
    id: "pathology_binary",
    label: "队列 · 病理分级能否区分",
    desc: "多例研究中，影像能否区分病理高级别与低级别？",
    defaultOutcome: "binary",
    defaultModeling: "radiomics_ml",
    defaultHypothesis: "在本队列中，影像表现能否区分病理高级别与低级别？哪类影像模式与高级别相关？",
    defaultGroupA: "高级别",
    defaultGroupB: "低级别",
    defaultTargetField: "病理分级（金标准）",
    defaultPositiveClass: "高级别",
    suggestedTasks: ["radiomics", "grade-pred"],
  },
  {
    id: "disease_discrimination",
    label: "队列 · 疾病 / 亚型鉴别",
    desc: "两种疾病或亚型在影像上能否鉴别？",
    defaultOutcome: "binary",
    defaultModeling: "radiomics_ml",
    defaultHypothesis: "PMP 与 DPAM（或其他两种亚型）在影像上是否存在可鉴别的模式？",
    defaultGroupA: "PMP",
    defaultGroupB: "DPAM",
    defaultTargetField: "病理亚型（金标准）",
    defaultPositiveClass: "PMP",
    suggestedTasks: ["radiomics", "multimodal-fusion"],
  },
  {
    id: "genotype_binary",
    label: "队列 · 分子标志物预测",
    desc: "影像能否预测 EGFR、KRAS 等分子状态？",
    defaultOutcome: "binary",
    defaultModeling: "radiomics_ml",
    defaultHypothesis: "术前影像能否预测 EGFR 突变状态，以指导靶向治疗决策？",
    defaultGroupA: "EGFR 阳性",
    defaultGroupB: "EGFR 阴性",
    defaultTargetField: "EGFR 状态",
    defaultPositiveClass: "阳性",
    suggestedTasks: ["genotype", "radiomics"],
  },
  {
    id: "prognosis_survival",
    label: "队列 · 预后 / 生存",
    desc: "影像表现与 OS、PFS 或复发风险是否相关？",
    defaultOutcome: "survival",
    defaultModeling: "traditional_stats",
    defaultHypothesis: "哪些影像表现与较短的总生存（OS）或无进展生存（PFS）相关？",
    defaultGroupA: "发生进展/死亡",
    defaultGroupB: "未发生事件",
    defaultTargetField: "PFS / OS",
    defaultPositiveClass: "12 个月内进展",
    suggestedTasks: ["prognosis-img", "survival", "prognosis"],
  },
  {
    id: "deeplearn_lesion",
    label: "单例/队列 · 病灶级 AI 辅助判定",
    desc: "基于勾画病灶，AI 能否给出分级或鉴别结论？",
    defaultOutcome: "binary",
    defaultModeling: "deep_learning",
    defaultHypothesis: "基于病灶区域，AI 能否辅助给出病理分级或良恶性倾向？",
    defaultGroupA: "倾向高级别/恶性",
    defaultGroupB: "倾向低级别/良性",
    defaultTargetField: "病理分级",
    defaultPositiveClass: "高级别",
    suggestedTasks: ["deeplearn", "grade-pred"],
  },
  {
    id: "custom",
    label: "自定义临床问题",
    desc: "自由描述要回答的临床问题",
    defaultOutcome: "binary",
    defaultModeling: "multimodal_fusion",
    defaultHypothesis: "",
    defaultGroupA: "组 A",
    defaultGroupB: "组 B",
    defaultTargetField: "临床结局",
    defaultPositiveClass: "目标事件",
    suggestedTasks: [],
  },
];

export const OUTCOME_TYPE_OPTIONS: { value: OutcomeType; label: string }[] = [
  { value: "binary", label: "二分类（是/否、A/B 鉴别）" },
  { value: "multiclass", label: "多分类（≥3 种诊断/亚型）" },
  { value: "survival", label: "生存 / 时间事件（OS、PFS）" },
  { value: "regression", label: "连续结局（如肿瘤大小变化）" },
];

export const MODELING_APPROACH_OPTIONS: { value: ModelingApproach; label: string; hint: string }[] = [
  { value: "radiomics_ml", label: "影像组学 + 机器学习", hint: "LASSO / RF / XGBoost" },
  { value: "deep_learning", label: "深度学习（病灶端到端）", hint: "CNN · Grad-CAM" },
  { value: "multimodal_fusion", label: "多模态融合", hint: "临床 + 影像 + 病理" },
  { value: "traditional_stats", label: "传统统计", hint: "Cox · Logistic · KM" },
];

export function isSingleCaseQuestion(q: ClinicalQuestion): boolean {
  return q.id === "single_case";
}

export function defaultClinicalQuestion(id: ClinicalQuestionId = "single_case"): ClinicalQuestion {
  const t = CLINICAL_QUESTION_TEMPLATES.find((x) => x.id === id) ?? CLINICAL_QUESTION_TEMPLATES[0];
  return {
    id: t.id,
    title: t.label,
    hypothesis: t.defaultHypothesis,
    outcomeType: t.defaultOutcome,
    modelingApproach: t.defaultModeling,
    groupA: t.defaultGroupA,
    groupB: t.defaultGroupB,
    targetField: t.defaultTargetField,
    positiveClass: t.defaultPositiveClass,
    notes: "",
  };
}

export function applyQuestionTemplate(id: ClinicalQuestionId, prev?: Partial<ClinicalQuestion>): ClinicalQuestion {
  const base = defaultClinicalQuestion(id);
  return { ...base, notes: prev?.notes ?? base.notes };
}

export function clinicalQuestionToIndicators(q: ClinicalQuestion): Record<string, string> {
  return { clinical_question: JSON.stringify(q) };
}

export function modelingLabel(approach: ModelingApproach): string {
  return MODELING_APPROACH_OPTIONS.find((o) => o.value === approach)?.label ?? approach;
}

/** 临床问题一句话摘要（不含特征/算法） */
export function clinicalQuestionSummaryText(q: ClinicalQuestion): string {
  if (isSingleCaseQuestion(q)) {
    return q.hypothesis.trim() || "本例影像诊断与临床意义";
  }
  if (q.groupA && q.groupB) {
    return `${q.hypothesis.trim() || q.title}（${q.groupA} vs ${q.groupB}）`;
  }
  return q.hypothesis.trim() || q.title;
}
