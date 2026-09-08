export type SystemResourceMetric = {
  key: string;
  label: string;
  percent: number;
  color: string;
};

export type SystemDailyStat = {
  key: string;
  label: string;
  value: number;
};

export type SystemPerformancePoint = {
  date: string;
  casesProcessed: number;
  accuracy: number;
};

export type SystemAlert = {
  id: string;
  time: string;
  message: string;
  level: "error" | "warning" | "info";
};

export const SYSTEM_RESOURCE_METRICS: SystemResourceMetric[] = [
  { key: "cpu", label: "CPU 使用率", percent: 45, color: "#1677ff" },
  { key: "memory", label: "内存使用率", percent: 62, color: "#722ed1" },
  { key: "gpu", label: "GPU 使用率", percent: 78, color: "#fa8c16" },
  { key: "storage", label: "存储使用率", percent: 55, color: "#52c41a" },
];

export const SYSTEM_DAILY_STATS: SystemDailyStat[] = [
  { key: "cases", label: "今日处理病例", value: 156 },
  { key: "train", label: "今日训练任务", value: 8 },
  { key: "predict", label: "今日预测次数", value: 234 },
];

export const SYSTEM_PERFORMANCE_TREND: SystemPerformancePoint[] = [
  { date: "05-14", casesProcessed: 42, accuracy: 72 },
  { date: "05-15", casesProcessed: 58, accuracy: 74 },
  { date: "05-16", casesProcessed: 65, accuracy: 76 },
  { date: "05-17", casesProcessed: 78, accuracy: 79 },
  { date: "05-18", casesProcessed: 92, accuracy: 81 },
  { date: "05-19", casesProcessed: 118, accuracy: 83 },
  { date: "05-20", casesProcessed: 156, accuracy: 86 },
];

export const SYSTEM_ALERTS: SystemAlert[] = [
  { id: "1", time: "10:30", message: "模型训练任务失败", level: "error" },
  { id: "2", time: "10:25", message: "数据处理延迟", level: "error" },
  { id: "3", time: "10:20", message: "存储空间不足", level: "error" },
  { id: "4", time: "10:15", message: "GPU 使用率过高", level: "warning" },
];
