export type AgentStep = {
  key: string;
  label: string;
  subtitle: string;
};

export const IMAGING_AGENT_STEPS: AgentStep[] = [
  { key: "input", label: "任务输入与数据检索", subtitle: "自然语言 · 数据库检索" },
  { key: "data", label: "数据确认与预处理", subtitle: "病例 · 字段 · 质控" },
  { key: "strategy", label: "分析方式选择", subtitle: "组学 · 深度学习" },
  { key: "train", label: "模型训练与优化", subtitle: "AutoML · 特征筛选" },
  { key: "eval", label: "模型评估与解释", subtitle: "AUC · 重要性" },
  { key: "validate", label: "外部验证", subtitle: "独立队列" },
  { key: "feedback", label: "模型反哺与知识更新", subtitle: "增量学习" },
  { key: "report", label: "报告生成", subtitle: "论文 · PPT" },
];

export const MULTIMODAL_AGENT_STEPS: AgentStep[] = [
  { key: "input", label: "任务输入与目标理解", subtitle: "自然语言 · 目标解析" },
  { key: "data", label: "数据检索与整合", subtitle: "影像 · 临床 · 病理" },
  { key: "strategy", label: "多模态策略选择", subtitle: "融合 · 模态组合" },
  { key: "train", label: "模型训练与优化", subtitle: "AutoML · 联合建模" },
  { key: "eval", label: "模型评估与解释", subtitle: "AUC · 贡献度" },
  { key: "validate", label: "外部验证", subtitle: "多中心队列" },
  { key: "feedback", label: "模型反哺与知识更新", subtitle: "漂移检测 · 增量" },
  { key: "report", label: "报告生成", subtitle: "论文 · 讨论段" },
];

export const IMAGING_AGENT_ASSISTANT_MESSAGES = [
  {
    role: "assistant" as const,
    text: "您好，我是 AI 分析助手。请用自然语言描述您的研究目标，我将自动检索数据库并生成分析方案。",
  },
  {
    role: "assistant" as const,
    text: "已理解任务：预测肺癌 EGFR 突变状态。正在连接患者数据库并匹配 CT / ROI 数据…",
  },
];

export const MULTIMODAL_AGENT_ASSISTANT_MESSAGES = [
  {
    role: "assistant" as const,
    text: "您好，我是多模态 AI 分析助手。请描述研究目标，我将自动检索并整合影像、临床、病理与组学数据。",
  },
  {
    role: "assistant" as const,
    text: "已理解：预测肺腺癌 EGFR 突变状态。正在匹配 512 例多模态配对病例…",
  },
];

export const IMAGING_AGENT_REASONING = [
  "理解研究目标与结局变量",
  "连接患者数据库与影像库",
  "匹配 CT / ROI / 临床字段",
  "推荐 Radiomics + 深度学习策略",
  "生成 AutoML 训练计划",
];

export const MULTIMODAL_AGENT_REASONING = [
  "理解研究目标与预测类型",
  "检索影像 / 临床 / 病理 / 基因数据",
  "完成多模态病例配对与对齐",
  "推荐 Early / Late / Deep Fusion",
  "启动联合模型 AutoML 训练",
];
