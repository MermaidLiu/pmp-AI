export type HomeWorkflowStep = {
  key: string;
  title: string;
  subtitle: string;
  path: string;
};

export type HomeOverviewStat = {
  key: string;
  label: string;
  value: string;
  delta: string;
  deltaUp: boolean;
};

export type HomePendingCase = {
  id: string;
  name: string;
  age: number;
  examType: string;
  examTime: string;
  status: "待诊断" | "分析中" | "已完成";
};

export type HomeModelTrendPoint = {
  date: string;
  accuracy: number;
};

export const HOME_WORKFLOW_STEPS: HomeWorkflowStep[] = [
  { key: "input", title: "影像输入", subtitle: "多模态影像数据输入", path: "/workflow" },
  { key: "analysis", title: "智能分析", subtitle: "AI 智能识别量化分析", path: "/workflow?step=diagnosis" },
  { key: "care", title: "方案推荐", subtitle: "辅助诊断治疗建议", path: "/workflow?step=diagnosis" },
  { key: "model", title: "预测模型", subtitle: "模型训练持续学习", path: "/knowledge/data/imaging" },
  { key: "feedback", title: "结果反馈", subtitle: "效果评估反馈优化", path: "/db/follow-up" },
];

export const HOME_SYSTEM_STATUS = [
  { key: "train", label: "模型训练状态", status: "正常运行", percent: 82 },
  { key: "data", label: "数据处理状态", status: "正常运行", percent: 91 },
];

export const HOME_MODEL_TREND: HomeModelTrendPoint[] = [
  { date: "05-14", accuracy: 62 },
  { date: "05-15", accuracy: 68 },
  { date: "05-16", accuracy: 71 },
  { date: "05-17", accuracy: 75 },
  { date: "05-18", accuracy: 78 },
  { date: "05-19", accuracy: 81 },
  { date: "05-20", accuracy: 86 },
];
