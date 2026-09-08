export type StatResultRow = {
  variable: string;
  mean: string;
  sd: string;
  n: number;
  pValue: string;
  sig: string;
};

export type CoxRow = {
  factor: string;
  hr: string;
  ci: string;
  pValue: string;
  sig: string;
};

export type ChartTemplate = {
  id: string;
  name: string;
  type: string;
  description: string;
  variables: string[];
};

export type LiteratureItem = {
  id: string;
  title: string;
  journal: string;
  year: string;
  pmid: string;
  relevance: number;
};

export type PptSlide = {
  page: number;
  title: string;
  bullets: string[];
};

export const MOCK_DESCRIPTIVE_STATS: StatResultRow[] = [
  { variable: "年龄", mean: "56.2", sd: "11.4", n: 128, pValue: "—", sig: "" },
  { variable: "SUVmax", mean: "5.8", sd: "3.2", n: 96, pValue: "—", sig: "" },
  { variable: "MTV", mean: "68.4", sd: "42.1", n: 96, pValue: "—", sig: "" },
  { variable: "Ki-67", mean: "28.5%", sd: "15.2", n: 84, pValue: "—", sig: "" },
];

export const MOCK_GROUP_COMPARE: StatResultRow[] = [
  { variable: "SUVmax（高 vs 低级别）", mean: "7.2 vs 3.1", sd: "—", n: 128, pValue: "0.003", sig: "**" },
  { variable: "MTV（高 vs 低级别）", mean: "92 vs 38", sd: "—", n: 96, pValue: "0.008", sig: "**" },
  { variable: "Ki-67（高 vs 低级别）", mean: "42% vs 12%", sd: "—", n: 84, pValue: "<0.001", sig: "***" },
  { variable: "年龄（高 vs 低级别）", mean: "58 vs 54", sd: "—", n: 128, pValue: "0.21", sig: "" },
];

export const MOCK_COX_REGRESSION: CoxRow[] = [
  { factor: "病理分级（高级别）", hr: "2.84", ci: "1.52–5.31", pValue: "0.001", sig: "***" },
  { factor: "SUVmax（每 +1）", hr: "1.18", ci: "1.06–1.32", pValue: "0.004", sig: "**" },
  { factor: "Ki-67（≥20%）", hr: "2.11", ci: "1.18–3.78", pValue: "0.012", sig: "*" },
  { factor: "EGFR 突变", hr: "0.62", ci: "0.38–1.01", pValue: "0.054", sig: "" },
  { factor: "年龄（每 +10 岁）", hr: "1.09", ci: "0.94–1.26", pValue: "0.24", sig: "" },
];

export const MOCK_CHART_TEMPLATES: ChartTemplate[] = [
  {
    id: "km",
    name: "Kaplan-Meier 生存曲线",
    type: "生存分析",
    description: "按病理分级或 PMP 分型分层展示 OS/PFS",
    variables: ["病理分级", "PMP 分型", "EGFR 状态"],
  },
  {
    id: "bar-grade",
    name: "分级分布柱状图",
    type: "描述统计",
    description: "高级别 / 低级别病例数与占比",
    variables: ["病理分级", "科室", "病种"],
  },
  {
    id: "scatter-suv",
    name: "SUVmax vs Ki-67 散点图",
    type: "相关性",
    description: "影像代谢与增殖指数关系",
    variables: ["SUVmax", "MTV", "Ki-67"],
  },
  {
    id: "forest",
    name: "亚组森林图",
    type: "亚组分析",
    description: "Cox 回归 HR 及 95% CI",
    variables: ["病理分级", "性别", "年龄分层"],
  },
  {
    id: "heatmap",
    name: "指标相关性热图",
    type: "相关性",
    description: "SUV / MTV / 标志物 Spearman 矩阵",
    variables: ["SUVmax", "MTV", "CEA", "Ki-67"],
  },
];

export const MOCK_LITERATURE: LiteratureItem[] = [
  {
    id: "L1",
    title: "Prognostic significance of SUVmax in mucinous peritoneal malignancies",
    journal: "Eur J Nucl Med Mol Imaging",
    year: "2023",
    pmid: "36812345",
    relevance: 92,
  },
  {
    id: "L2",
    title: "CRS and HIPEC for pseudomyxoma peritonei: a consensus review",
    journal: "Ann Surg Oncol",
    year: "2022",
    pmid: "35123456",
    relevance: 88,
  },
  {
    id: "L3",
    title: "DPAM vs PMCA: pathology-driven treatment pathways",
    journal: "Mod Pathol",
    year: "2024",
    pmid: "38234567",
    relevance: 95,
  },
  {
    id: "L4",
    title: "Ki-67 and grade prediction in appendiceal mucinous neoplasms",
    journal: "Histopathology",
    year: "2021",
    pmid: "33456789",
    relevance: 76,
  },
  {
    id: "L5",
    title: "Machine learning for PET-based grade classification",
    journal: "Radiology",
    year: "2024",
    pmid: "39123456",
    relevance: 84,
  },
];

export const MOCK_REVIEW_OUTLINE = `# 综述：腹腔粘液瘤（PMP）影像代谢与病理分级的关联研究

## 摘要
- 背景：PMP 包含 DPAM 与 PMCA 等表型，分级影响 CRS+HIPEC 决策
- 目的：总结 SUV/MTV 与病理分级、预后的证据
- 结论：PET 定量可作为分级辅助，需多中心验证

## 1 引言
- PMP 流行病学与临床挑战
- 病理分级体系（DPAM / PMCA / LAMN）

## 2 PET-CT 代谢参数
- SUVmax、MTV、TLG 定义与测量规范
- 与 Ki-67、WHO 分级的相关性

## 3 治疗与预后
- CRS+HIPEC 在低级别 PMP 中的地位
- 高级别 PMCA 系统治疗路径

## 4 研究空白与展望
- 单中心回顾性局限
- AI 多模态分级模型

## 参考文献
- 见右侧文献助手检索结果
`;

export const MOCK_PPT_SLIDES: PptSlide[] = [
  { page: 1, title: "封面", bullets: ["PMP 专病库科研汇报", "影像代谢与病理分级", "汇报人：张医生 · 肿瘤内科"] },
  { page: 2, title: "研究背景", bullets: ["腹膜假粘液瘤分级影响治疗", "PET 定量与病理对照证据不足"] },
  { page: 3, title: "研究目的", bullets: ["分析 SUV/MTV 与高级别/低级别关联", "构建可解释分级辅助模型"] },
  { page: 4, title: "材料与方法", bullets: ["单中心回顾性队列 n=128", "XGBoost + SHAP 可解释性"] },
  { page: 5, title: "基线特征", bullets: ["高级别 62 例 / 低级别 66 例", "平均年龄 56 岁"] },
  { page: 6, title: "主要结果", bullets: ["SUVmax 组间差异 p=0.003", "AUC 0.84（测试集）"] },
  { page: 7, title: "KM 生存分析", bullets: ["低级别 3 年 OS 75%", "高级别 3 年 OS 38%"] },
  { page: 8, title: "讨论", bullets: ["与文献一致", "需外部验证"] },
  { page: 9, title: "结论", bullets: ["PET 定量有分级辅助价值", "建议 MDT 结合病理"] },
  { page: 10, title: "致谢", bullets: ["PMP Agent 专病库", "伦理批件：XXX"] },
];

export const MOCK_RESEARCH_TOPICS = [
  "PMP 影像代谢参数与病理分级相关性",
  "DPAM vs PMCA 预后因素比较",
  "XGBoost 多模态分级模型可解释性",
  "CRS+HIPEC 后 PET 随访时机",
];
