export const IMAGING_NL_PROMPT = "建立预测肺癌 EGFR 突变状态的模型";

export const IMAGING_UNDERSTANDING = [
  { label: "目标疾病", value: "肺癌" },
  { label: "预测目标", value: "EGFR 突变" },
  { label: "预测类型", value: "二分类" },
  { label: "推荐分析", value: "影像组学 + 深度学习" },
  { label: "所需标签", value: "EGFR 突变（阳性/阴性）" },
];

export const IMAGING_DATA_STATS = [
  { label: "总病例", value: "327", sub: "例" },
  { label: "EGFR 阳性", value: "138", sub: "42.2%" },
  { label: "EGFR 阴性", value: "189", sub: "57.8%" },
  { label: "CT 影像", value: "327", sub: "例" },
  { label: "ROI 区域", value: "327", sub: "例" },
  { label: "临床数据", value: "327", sub: "例" },
];

export const IMAGING_LABEL_DIST = [
  { label: "EGFR 阳性", pct: 42.2, color: "#1677ff" },
  { label: "EGFR 阴性", pct: 57.8, color: "#52c41a" },
];

export const IMAGING_STRATEGIES = [
  { id: "radiomics", title: "Radiomics", desc: "手工特征提取 + 机器学习", mins: "8 分钟" },
  { id: "deeplearn", title: "Deep Learning", desc: "神经网络自动特征学习", mins: "28 分钟" },
  {
    id: "combined",
    title: "联合建模",
    desc: "同时构建两种模型并自动对比性能",
    mins: "35 分钟",
    recommended: true,
  },
];

export const IMAGING_AUTOML_STEPS = [
  "数据检查",
  "数据划分",
  "特征提取",
  "特征筛选",
  "模型训练",
  "超参优化",
  "超参评估",
  "模型评估",
  "完成",
];

export const IMAGING_MODEL_RANKING = [
  {
    rank: 1,
    model: "XGBoost",
    type: "Radiomics",
    auc: "0.923 (0.891–0.949)",
    acc: "0.887",
    f1: "0.871",
    status: "最优模型",
  },
  {
    rank: 2,
    model: "ResNet50",
    type: "Deep Learning",
    auc: "0.908 (0.874–0.936)",
    acc: "0.876",
    f1: "0.859",
    status: "候选",
  },
  {
    rank: 3,
    model: "LightGBM",
    type: "Radiomics",
    auc: "0.901 (0.866–0.929)",
    acc: "0.869",
    f1: "0.852",
    status: "候选",
  },
  {
    rank: 4,
    model: "Random Forest",
    type: "Radiomics",
    auc: "0.889 (0.853–0.918)",
    acc: "0.861",
    f1: "0.844",
    status: "候选",
  },
  {
    rank: 5,
    model: "SVM",
    type: "Radiomics",
    auc: "0.876 (0.839–0.906)",
    acc: "0.852",
    f1: "0.836",
    status: "候选",
  },
];

export const IMAGING_FEATURE_IMPORTANCE = [
  { name: "wavelet-LLL_glcm_Contrast", pct: 95 },
  { name: "original_shape_Elongation", pct: 82 },
  { name: "log-sigma-3_glrlm_RunEntropy", pct: 74 },
  { name: "original_firstorder_Entropy", pct: 68 },
  { name: "wavelet-HHH_glcm_Correlation", pct: 61 },
  { name: "original_glcm_Imc1", pct: 55 },
  { name: "log-sigma-2_glszm_SizeZoneNonUniformity", pct: 48 },
  { name: "wavelet-LLH_firstorder_Mean", pct: 42 },
  { name: "original_shape_Sphericity", pct: 36 },
  { name: "wavelet-LHL_glcm_Dissimilarity", pct: 30 },
];

export const IMAGING_EXTERNAL_RESULT = {
  file: "ExternalSet_2024.csv",
  auc: "0.891",
  acc: "0.863",
  sens: "0.872",
  spec: "0.849",
};

export const IMAGING_FEEDBACK_CHECKS = [
  "加入知识库：EGFR 突变影像预测模型",
  "增量学习：纳入新批次 24 例",
  "定期重训练：建议每 3 个月更新",
];

export const IMAGING_ASSISTANT_PLAN = `分析方案摘要
· 目标：预测 EGFR 突变（二分类）
· 数据：327 例（阳性 138 / 阴性 189）
· 策略：Radiomics + Deep Learning 联合对比
· 最优：XGBoost（AUC 0.923）
· 评估：ROC · 特征重要性 · 外部验证`;

export const IMAGING_ASSISTANT_STATUS = "数据检索完成：共找到 327 例满足条件的患者，EGFR 标签完整率 100%。";

export const IMAGING_ASSISTANT_SUGGESTIONS = [
  "哪种模型更适合这个任务？",
  "这个任务有哪些难点？",
  "帮我解释 Top 特征含义",
  "生成论文 Results 段落",
];

export const IMAGING_REASONING_STEPS = [
  { time: "10:23:15", text: "理解研究目标与结局变量" },
  { time: "10:23:18", text: "连接患者数据库与影像库" },
  { time: "10:23:22", text: "匹配 CT / ROI / 临床字段" },
  { time: "10:23:28", text: "筛选 EGFR 标签完整病例" },
  { time: "10:23:35", text: "推荐 Radiomics + DL 联合策略" },
];
