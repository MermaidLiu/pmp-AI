export type PlatformPatient = {
  id: string;
  name: string;
  gender: string;
  age: number;
  diagnosis: string;
  stage: string;
  gene: string;
  enrolledAt: string;
  department: string;
  physician: string;
  smoking: string;
  ecog: string;
  chiefComplaint: string;
  pastHistory: string;
  familyHistory: string;
  admissionId: string;
  admissionTime: string;
};

export const MOCK_PATIENTS: PlatformPatient[] = [
  {
    id: "PMP00012345",
    name: "王建国",
    gender: "男",
    age: 58,
    diagnosis: "右肺腺癌",
    stage: "IIB期",
    gene: "EGFR+",
    enrolledAt: "2024-05-20",
    department: "肿瘤内科",
    physician: "张医生",
    smoking: "吸烟30年",
    ecog: "1分",
    chiefComplaint: "咳嗽、胸闷2月",
    pastHistory: "吸烟30年，高血压5年",
    familyHistory: "父亲肺癌史",
    admissionId: "ZY20240518001",
    admissionTime: "2024-05-18",
  },
  {
    id: "PMP00012346",
    name: "李秀英",
    gender: "女",
    age: 62,
    diagnosis: "腹膜假粘液瘤",
    stage: "—",
    gene: "—",
    enrolledAt: "2024-05-18",
    department: "妇科肿瘤科",
    physician: "刘医生",
    smoking: "无",
    ecog: "0分",
    chiefComplaint: "腹胀3月",
    pastHistory: "阑尾切除术后",
    familyHistory: "无",
    admissionId: "ZY20240515002",
    admissionTime: "2024-05-15",
  },
  {
    id: "PMP00012347",
    name: "陈志远",
    gender: "男",
    age: 45,
    diagnosis: "结肠粘液腺癌",
    stage: "III期",
    gene: "KRAS+",
    enrolledAt: "2024-05-15",
    department: "胃肠外科",
    physician: "王医生",
    smoking: "无",
    ecog: "1分",
    chiefComplaint: "便血1月",
    pastHistory: "无",
    familyHistory: "无",
    admissionId: "ZY20240512003",
    admissionTime: "2024-05-12",
  },
];

export const MOCK_ATTACHMENTS = [
  { name: "胸部CT", type: "dicom", icon: "🩻" },
  { name: "PET-CT", type: "dicom", icon: "📡" },
  { name: "病理HE", type: "pathology", icon: "🔬" },
  { name: "Ki-67", type: "pathology", icon: "🧫" },
  { name: "基因检测", type: "pdf", icon: "📄" },
  { name: "临床资料", type: "pdf", icon: "📋" },
];

export const MOCK_DIAGNOSIS = {
  title: "右肺腺癌（考虑浸润性腺癌）",
  confidence: 0.92,
  staging: "cT2aN1M0 · IIB期",
  evidence: [
    "影像：右肺上叶占位 3.2cm，SUVmax 8.6，纵隔淋巴结肿大",
    "病理：腺癌，中分化，Ki-67 约 30%",
    "分子：EGFR 19del 突变阳性",
    "临床：T2aN1M0，IIB 期",
  ],
  treatments: [
    "首选：肺叶切除 + 系统性淋巴结清扫",
    "辅助：含铂双药化疗 4 周期",
    "靶向：EGFR-TKI 辅助治疗（奥希替尼）",
    "随访：每 3 个月 CT + 肿瘤标志物",
  ],
  probabilities: [
    { label: "右肺腺癌", pct: 92 },
    { label: "鳞癌", pct: 4 },
    { label: "大细胞癌", pct: 2 },
    { label: "小细胞癌", pct: 1 },
    { label: "其他", pct: 1 },
  ],
  prognosis: {
    mpfs: "24.6 月",
    mos: "38.5 月",
    y1: "82%",
    y2: "61%",
    y3: "38%",
  },
};

export const MOCK_INDICATORS = [
  { name: "CEA", trend: "↑" },
  { name: "CA125", trend: "↑" },
  { name: "CA19-9", trend: "→" },
];

export const MOCK_TIMELINE = [
  { date: "05-10", event: "首诊 · 门诊" },
  { date: "05-15", event: "PET-CT 检查" },
  { date: "05-18", event: "病理活检" },
  { date: "05-20", event: "AI 诊断分析" },
];

export const MOCK_CORRELATIONS = [
  { factor: "年龄", r: 0.12, p: 0.34, sig: "" },
  { factor: "吸烟史", r: 0.45, p: 0.002, sig: "**" },
  { factor: "肿瘤大小", r: 0.62, p: 0.001, sig: "***" },
  { factor: "SUVmax", r: 0.58, p: 0.003, sig: "**" },
  { factor: "Ki-67", r: 0.71, p: 0.000, sig: "***" },
  { factor: "EGFR突变", r: -0.22, p: 0.18, sig: "" },
];

export type SurvivalSummary = {
  group: string;
  n: number;
  events: number;
  medianOs: string;
  os1y: string;
  os3y: string;
  color: string;
};

export const MOCK_SURVIVAL_SUMMARY: SurvivalSummary[] = [
  { group: "高级别", n: 62, events: 41, medianOs: "22.8 月", os1y: "68%", os3y: "38%", color: "#cf1322" },
  { group: "低级别", n: 66, events: 18, medianOs: "> 120 月", os1y: "95%", os3y: "75%", color: "#3f8600" },
  { group: "DPAM", n: 38, events: 8, medianOs: "未达", os1y: "97%", os3y: "82%", color: "#1677ff" },
  { group: "PMCA", n: 24, events: 19, medianOs: "18.5 月", os1y: "58%", os3y: "22%", color: "#d48806" },
];

export type SubgroupRow = {
  subgroup: string;
  hr: number;
  ciLow: number;
  ciHigh: number;
  pValue: string;
  sig: string;
};

export const MOCK_SUBGROUP_FOREST: SubgroupRow[] = [
  { subgroup: "总体", hr: 2.84, ciLow: 1.52, ciHigh: 5.31, pValue: "0.001", sig: "***" },
  { subgroup: "高级别 vs 低级别", hr: 2.84, ciLow: 1.52, ciHigh: 5.31, pValue: "0.001", sig: "***" },
  { subgroup: "年龄 < 60 岁", hr: 2.41, ciLow: 1.18, ciHigh: 4.92, pValue: "0.015", sig: "*" },
  { subgroup: "年龄 ≥ 60 岁", hr: 3.12, ciLow: 1.42, ciHigh: 6.85, pValue: "0.004", sig: "**" },
  { subgroup: "SUVmax ≥ 5", hr: 3.05, ciLow: 1.65, ciHigh: 5.64, pValue: "0.002", sig: "**" },
  { subgroup: "SUVmax < 5", hr: 1.86, ciLow: 0.92, ciHigh: 3.76, pValue: "0.082", sig: "" },
  { subgroup: "PMP · DPAM", hr: 1.0, ciLow: 0.45, ciHigh: 2.22, pValue: "0.99", sig: "" },
  { subgroup: "PMP · PMCA", hr: 4.21, ciLow: 2.05, ciHigh: 8.64, pValue: "<0.001", sig: "***" },
];

export type PrognosisModelRow = {
  factor: string;
  coef: number;
  hr: string;
  ci: string;
  pValue: string;
  sig: string;
};

export const MOCK_PROGNOSIS_MODEL: PrognosisModelRow[] = [
  { factor: "病理分级（高级别）", coef: 1.04, hr: "2.84", ci: "1.52–5.31", pValue: "0.001", sig: "***" },
  { factor: "SUVmax（每 +1）", coef: 0.17, hr: "1.18", ci: "1.06–1.32", pValue: "0.004", sig: "**" },
  { factor: "Ki-67（≥20%）", coef: 0.75, hr: "2.11", ci: "1.18–3.78", pValue: "0.012", sig: "*" },
  { factor: "PMCA 表型", coef: 0.89, hr: "2.43", ci: "1.28–4.62", pValue: "0.007", sig: "**" },
  { factor: "年龄（每 +10 岁）", coef: 0.09, hr: "1.09", ci: "0.94–1.26", pValue: "0.24", sig: "" },
  { factor: "性别（男）", coef: -0.12, hr: "0.89", ci: "0.52–1.52", pValue: "0.66", sig: "" },
];

export const MOCK_PROGNOSIS_MODEL_METRICS = {
  cIndex: 0.78,
  auc: 0.84,
  samples: 128,
  events: 59,
  formula: "Risk = 1.04×高级别 + 0.17×SUVmax + 0.75×Ki67高 + 0.89×PMCA",
};

export const MOCK_RESEARCH_IDEAS = [
  "EGFR 突变型肺腺癌术后辅助靶向治疗的真实世界疗效",
  "PET 代谢参数与病理分级相关性单中心回顾研究",
  "IIB 期 NSCLC 含铂化疗 vs 靶向辅助生存分析",
  "纵隔淋巴结 SUV 阈值对 N 分期的预测价值",
];

export const WORKFLOW_STEPS = [
  { key: "input", label: "① 影像输入" },
  { key: "diagnosis", label: "② 智能分析" },
  { key: "database", label: "③ 方案推荐 / 入队" },
  { key: "research", label: "④ 科研延伸" },
];
