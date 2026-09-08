export const MULTIMODAL_NL_PROMPT =
  "构建一个多模态模型，预测肺癌患者的 EGFR 突变状态，整合影像 + 临床 + 病理数据";

export const MULTIMODAL_UNDERSTANDING = [
  { label: "疾病", value: "肺腺癌" },
  { label: "目标", value: "EGFR 突变" },
  { label: "类型", value: "二分类" },
  { label: "组合", value: "影像 + 临床 + 病理" },
  { label: "方法", value: "多模态融合建模" },
];

export const MULTIMODAL_DATA_STATS = [
  { label: "总病例", value: "512" },
  { label: "影像", value: "512" },
  { label: "临床", value: "512" },
  { label: "病理", value: "498" },
  { label: "基因", value: "512" },
];

export const MULTIMODAL_INTEGRITY = [
  { label: "影像", pct: 100 },
  { label: "临床", pct: 100 },
  { label: "病理", pct: 97.3 },
  { label: "基因", pct: 100 },
];

export const MULTIMODAL_CLINICAL_PREVIEW = [
  { k: "年龄", v: "62" },
  { k: "性别", v: "男" },
  { k: "吸烟", v: "是" },
  { k: "分期", v: "IA" },
  { k: "CEA", v: "5.3" },
];

export const MULTIMODAL_GENES = ["EGFR", "KRAS", "ALK", "TP53"];

export const MULTIMODAL_STRATEGIES = [
  {
    id: "full",
    title: "影像 + 临床 + 病理",
    desc: "Feature-level Fusion",
    recommended: true,
  },
  { id: "genetics", title: "影像 + 临床 + 病理 + 基因", desc: "Deep Fusion" },
  { id: "imaging-clinical", title: "影像 + 临床", desc: "Early Fusion" },
  { id: "path-clinical", title: "病理 + 临床", desc: "Late Fusion" },
];

export const MULTIMODAL_FUSION_METHODS = [
  { id: "feature", label: "Feature-level fusion", checked: true },
  { id: "model", label: "Model-level fusion", checked: false },
  { id: "decision", label: "Decision-level fusion", checked: false },
];

export const MULTIMODAL_AUTOML_STEPS = [
  "数据预处理",
  "模态对齐",
  "特征融合",
  "模型搜索",
  "模型评估",
  "完成",
];

export const MULTIMODAL_MODEL_RANKING = [
  { model: "XGBoost", fusion: "Feature-level", auc: "0.931 (0.901–0.958)", acc: "0.892", f1: "0.876", status: "最优模型" },
  { model: "LightGBM", fusion: "Feature-level", auc: "0.918 (0.885–0.946)", acc: "0.881", f1: "0.864", status: "候选" },
  { model: "SVM", fusion: "Feature-level", auc: "0.902 (0.868–0.931)", acc: "0.869", f1: "0.851", status: "候选" },
  { model: "NN", fusion: "Model-level", auc: "0.896 (0.861–0.925)", acc: "0.862", f1: "0.844", status: "候选" },
  { model: "Random Forest", fusion: "Feature-level", auc: "0.887 (0.851–0.918)", acc: "0.854", f1: "0.836", status: "候选" },
];

export const MULTIMODAL_FEATURE_IMPORTANCE = [
  { name: "wavelet-LLL_glcm_Entropy", pct: 92, mod: "影像" },
  { name: "病理核分裂象密度", pct: 78, mod: "病理" },
  { name: "CEA", pct: 71, mod: "临床" },
  { name: "original_shape_Elongation", pct: 65, mod: "影像" },
  { name: "Ki-67 指数", pct: 58, mod: "病理" },
  { name: "T 分期", pct: 52, mod: "临床" },
  { name: "EGFR 扩增信号", pct: 48, mod: "基因" },
  { name: "log-sigma-3_glrlm_RunEntropy", pct: 44, mod: "影像" },
  { name: "吸烟史", pct: 38, mod: "临床" },
  { name: "WSI 肿瘤面积比", pct: 32, mod: "病理" },
];

export const MULTIMODAL_EXTERNAL_DATASETS = [
  { id: "b", name: "Hospital_B", auc: "0.902", acc: "0.871", sens: "0.884", spec: "0.858", selected: true },
  { id: "c", name: "Hospital_C", auc: "0.891", acc: "0.863", sens: "0.872", spec: "0.849", selected: true },
];

export const MULTIMODAL_FEEDBACK_CHECKS = [
  "更新知识库：EGFR 突变多模态预测模型 v1.2",
  "纳入 Hospital_B 外部验证结果",
  "触发增量学习队列（+48 例）",
];

export const MULTIMODAL_ASSISTANT_PLAN = `分析方案摘要
· 目标：预测 EGFR 突变（二分类）
· 数据：512 例多模态配对（影像/临床/病理/基因）
· 策略：影像 + 临床 + 病理 · Feature-level Fusion
· 模型：XGBoost（AUC 0.931）
· 评估：ROC · 特征重要性 · 外部验证`;

export const MULTIMODAL_ASSISTANT_STATUS = "数据检索完成：共找到 512 例满足条件的患者，多模态配对率 97.3%。";

export const MULTIMODAL_ASSISTANT_SUGGESTIONS = [
  "三种融合方式有什么区别？",
  "为什么 XGBoost 表现最好？",
  "帮我生成论文 Methods 段落",
  "外部验证结果如何解读？",
];
