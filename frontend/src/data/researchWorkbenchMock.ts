export type ResearchTask = {
  id: string;
  title: string;
  desc: string;
};

export type ResearchResultRow = {
  factor: string;
  metric: string;
  pValue: string;
  note: string;
  weight?: number;
};

export type ModuleAnalysisResult = {
  module: "clinical" | "imaging" | "multimodal";
  taskId: string;
  taskTitle: string;
  ranAt: string;
  rows: ResearchResultRow[];
  summary: string;
  auc?: number;
  cIndex?: number;
};

export const CLINICAL_FIELDS = [
  "病理分级",
  "年龄",
  "性别",
  "TNM 分期",
  "肿瘤大小",
  "Ki-67",
  "CEA",
  "淋巴结转移",
  "治疗方案",
  "OS / PFS",
];

export const IMAGING_FIELDS = [
  "CT",
  "MRI",
  "PET",
  "WSI",
  "ROI 分割",
  "纹理特征",
  "形态特征",
  "深度特征",
  "EGFR",
  "HER2",
  "病理分级",
  "SUVmax",
];

export const MULTIMODAL_FIELDS = [
  "临床变量",
  "病理变量",
  "影像特征",
  "WSI 特征",
  "基因分型",
  "治疗方案",
  "OS / PFS",
  "复发/转移",
  "分子标志物",
];

export const CLINICAL_TASKS: ResearchTask[] = [
  { id: "grade-factor", title: "病理分级相关因素分析", desc: "探索影响病理分级的临床与病理因素" },
  { id: "survival", title: "生存分析 OS / PFS", desc: "Kaplan-Meier 与 Cox 回归" },
  { id: "prognosis", title: "预后模型构建", desc: "Nomogram · C-index 评估" },
  { id: "efficacy", title: "治疗疗效分析", desc: "组间疗效与亚组比较" },
  { id: "subgroup", title: "亚组 / 敏感性分析", desc: "森林图 · 交互作用" },
];

export const IMAGING_TASKS: ResearchTask[] = [
  { id: "radiomics", title: "影像组学特征筛选", desc: "LASSO · 纹理/形态特征" },
  { id: "deeplearn", title: "深度学习特征学习", desc: "CNN 特征 · Grad-CAM" },
  { id: "grade-pred", title: "预测病理分级", desc: "影像 → 病理分级" },
  { id: "genotype", title: "预测基因分型", desc: "影像 → EGFR/KRAS 等" },
  { id: "prognosis-img", title: "影像特征与疗效/预后关联", desc: "AUC · 生存关联" },
];

export const MULTIMODAL_TASKS: ResearchTask[] = [
  { id: "clinical-imaging", title: "临床 + 影像联合建模", desc: "Early / Late Fusion" },
  { id: "path-omics", title: "病理 + 组学联合分析", desc: "多组学整合" },
  { id: "grade-subtype", title: "预测病理分级 / 基因亚型", desc: "多模态分类" },
  { id: "survival-risk", title: "预测生存与复发风险", desc: "风险分层模型" },
  { id: "explain", title: "解释多模态结果影响因素", desc: "SHAP · 贡献度" },
];

export const CLINICAL_METHODS = ["卡方检验", "t 检验", "Logistic 回归", "Cox 回归", "Kaplan-Meier", "Nomogram"];
export const IMAGING_METHODS = ["Radiomics", "LASSO", "Random Forest", "XGBoost", "CNN", "Grad-CAM", "SHAP"];
export const MULTIMODAL_METHODS = ["Early Fusion", "Late Fusion", "XGBoost", "Deep Fusion", "Stacking", "SHAP", "风险分层"];

export const CLINICAL_RESULTS: Record<string, ResearchResultRow[]> = {
  "grade-factor": [
    { factor: "Ki-67 高表达", metric: "OR=2.84", pValue: "0.001", note: "高级别独立相关", weight: 92 },
    { factor: "肿瘤大小 ≥ 3cm", metric: "OR=2.11", pValue: "0.012", note: "体积增大风险升高", weight: 78 },
    { factor: "CEA 升高", metric: "OR=1.76", pValue: "0.028", note: "与分级正相关", weight: 65 },
    { factor: "年龄 ≥ 60", metric: "OR=1.32", pValue: "0.156", note: "趋势性，未达显著", weight: 42 },
  ],
  survival: [
    { factor: "高级别", metric: "HR=2.84", pValue: "0.001", note: "OS 显著缩短", weight: 95 },
    { factor: "淋巴结转移", metric: "HR=2.21", pValue: "0.004", note: "PFS 独立预后", weight: 82 },
    { factor: "Ki-67 ≥ 20%", metric: "HR=1.89", pValue: "0.018", note: "增殖指数相关", weight: 70 },
  ],
  prognosis: [
    { factor: "病理分级", metric: "β=1.04", pValue: "0.001", note: "C-index 0.74", weight: 88 },
    { factor: "T 分期", metric: "β=0.62", pValue: "0.008", note: "Nomogram 纳入", weight: 72 },
    { factor: "CEA", metric: "β=0.41", pValue: "0.032", note: "校准良好", weight: 58 },
  ],
  efficacy: [
    { factor: "靶向 vs 化疗", metric: "ORR 68% vs 42%", pValue: "0.006", note: "EGFR+ 亚组更优", weight: 85 },
    { factor: "PMCA 表型", metric: "mPFS 18.5m", pValue: "0.003", note: "疗效差异显著", weight: 76 },
  ],
  subgroup: [
    { factor: "年龄 < 60", metric: "HR=2.41", pValue: "0.015", note: "亚组一致", weight: 80 },
    { factor: "SUVmax ≥ 5", metric: "HR=3.05", pValue: "0.002", note: "高代谢亚组", weight: 90 },
  ],
};

export const IMAGING_RESULTS: Record<string, ResearchResultRow[]> = {
  radiomics: [
    { factor: "纹理均匀性", metric: "AUC=0.82", pValue: "0.002", note: "与高级别相关", weight: 86 },
    { factor: "边缘不规则度", metric: "AUC=0.79", pValue: "0.005", note: "形态异质性", weight: 78 },
    { factor: "熵值 Entropy", metric: "AUC=0.76", pValue: "0.011", note: "纹理复杂度", weight: 71 },
  ],
  deeplearn: [
    { factor: "CNN Layer-4", metric: "AUC=0.86", pValue: "0.001", note: "深度特征最优", weight: 92 },
    { factor: "Grad-CAM 热区", metric: "—", pValue: "—", note: "病灶核心摄取区", weight: 88 },
  ],
  "grade-pred": [
    { factor: "Radiomics 模型", metric: "AUC=0.84", pValue: "0.001", note: "预测病理分级", weight: 90 },
    { factor: "SUVmax 纹理", metric: "AUC=0.78", pValue: "0.008", note: "PET 纹理辅助", weight: 74 },
  ],
  genotype: [
    { factor: "EGFR 预测模型", metric: "AUC=0.81", pValue: "0.003", note: "CT 纹理 + 形态", weight: 85 },
    { factor: "KRAS 阴性排除", metric: "AUC=0.76", pValue: "0.012", note: "联合临床特征", weight: 68 },
  ],
  "prognosis-img": [
    { factor: "MTV 体积", metric: "HR=1.18", pValue: "0.004", note: "每 +10ml 风险↑", weight: 82 },
    { factor: "纹理熵", metric: "HR=2.05", pValue: "0.009", note: "预后独立因素", weight: 75 },
  ],
};

export const MULTIMODAL_FUSION_ROWS = [
  { model: "临床 + 病理", auc: "0.78", cIndex: "0.72", note: "基线模型" },
  { model: "影像模型", auc: "0.84", cIndex: "0.76", note: "Radiomics + DL" },
  { model: "组学模型", auc: "0.81", cIndex: "0.74", note: "分子标志物" },
  { model: "多模态融合", auc: "0.91", cIndex: "0.83", note: "Early Fusion 最优" },
];

export const MODALITY_CONTRIBUTION = [
  { name: "影像", pct: 42, note: "纹理 + SUV 特征贡献最高" },
  { name: "临床", pct: 28, note: "分期与 Ki-67 等" },
  { name: "组学", pct: 18, note: "EGFR/KRAS 等" },
  { name: "病理", pct: 12, note: "分级与 WHO 分型" },
];
