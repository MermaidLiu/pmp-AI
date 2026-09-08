export type CitationValidation = {
  doi?: string;
  pmid?: string;
  status: string;
  checked_at: string;
  message: string;
};

export type KnowledgeLiterature = {
  id: string;
  title: string;
  source: "PubMed" | "综述" | "指南/共识" | "内部文献" | "专病库" | string;
  year: string;
  doi: string;
  pmid: string;
  relevance: number;
  journal?: string;
  doi_validation?: CitationValidation;
  pmid_validation?: CitationValidation;
  cited_at?: string;
  verifiable?: boolean;
  is_demo?: boolean;
  excerpt?: string;
  guideline_fragment_id?: string;
  guideline_version?: string;
};

export type AnswerPoint = {
  text: string;
  refs: number[];
};

export const KNOWLEDGE_SOURCES = ["PubMed", "指南/共识", "内部文献", "专病库"];

export const DEFAULT_KNOWLEDGE_QUERY = "PMP 腹膜假粘液瘤的最新研究热点有哪些？";

export const MOCK_KNOWLEDGE_LITERATURE: KnowledgeLiterature[] = [
  {
    id: "L1",
    title: "DPAM vs PMCA: pathology-driven treatment pathways",
    source: "PubMed",
    year: "2024",
    doi: "10.1038/s41379-024-01234",
    pmid: "38234567",
    relevance: 95,
  },
  {
    id: "L2",
    title: "Prognostic significance of SUVmax in mucinous peritoneal malignancies",
    source: "PubMed",
    year: "2023",
    doi: "10.1007/s00259-023-06123",
    pmid: "36812345",
    relevance: 92,
  },
  {
    id: "L3",
    title: "CRS and HIPEC for pseudomyxoma peritonei: international consensus",
    source: "指南/共识",
    year: "2022",
    doi: "10.1245/s10434-022-11890",
    pmid: "35123456",
    relevance: 88,
  },
  {
    id: "L4",
    title: "Machine learning for PET-based grade classification in PMP",
    source: "PubMed",
    year: "2024",
    doi: "10.1148/radiol.231234",
    pmid: "39123456",
    relevance: 84,
  },
  {
    id: "L5",
    title: "Ki-67 and grade prediction in appendiceal mucinous neoplasms",
    source: "PubMed",
    year: "2021",
    doi: "10.1111/his.14567",
    pmid: "33456789",
    relevance: 76,
  },
  {
    id: "L6",
    title: "PMP 专病库：128 例回顾性队列基线报告",
    source: "专病库",
    year: "2024",
    doi: "—",
    pmid: "—",
    relevance: 90,
  },
  {
    id: "L7",
    title: "腹膜假粘液瘤诊疗中国专家共识（2023 版）",
    source: "指南/共识",
    year: "2023",
    doi: "—",
    pmid: "—",
    relevance: 86,
  },
  {
    id: "L8",
    title: "Recent advances in multimodal fusion for peritoneal surface malignancies",
    source: "综述",
    year: "2024",
    doi: "10.1016/j.critrevonc.2024.104567",
    pmid: "39876543",
    relevance: 81,
  },
];

export const MOCK_ANSWER_POINTS: AnswerPoint[] = [
  {
    text: "研究热点一：DPAM 与 PMCA 病理分型驱动的差异化治疗路径（CRS+HIPEC vs 系统治疗）",
    refs: [1, 3],
  },
  {
    text: "研究热点二：PET 代谢参数（SUVmax、MTV）与病理分级、预后的相关性及 AI 辅助分级",
    refs: [2, 4, 6],
  },
  {
    text: "研究热点三：多模态融合（临床+影像+病理）用于风险分层与可解释预后模型",
    refs: [4, 8],
  },
  {
    text: "研究热点四：Ki-67、WHO 分级体系在低/高级别 PMP 中的预后价值与指南共识更新",
    refs: [5, 7],
  },
];

export const GENERATION_MODULES = [
  {
    key: "review",
    title: "综述生成",
    desc: "生成大纲、正文与参考文献",
    outputs: ["大纲", "正文", "参考文献"],
    icon: "review",
    color: "#1677ff",
  },
  {
    key: "paper",
    title: "论文生成",
    desc: "生成 Abstract / Intro / Methods / Results / Discussion",
    outputs: ["Abstract", "Intro", "Methods", "Results", "Discussion"],
    icon: "paper",
    color: "#0891b2",
  },
  {
    key: "grant",
    title: "基金项目书生成",
    desc: "生成立项依据、内容、技术路线与创新点",
    outputs: ["立项依据", "内容", "技术路线", "创新点"],
    icon: "grant",
    color: "#7c3aed",
  },
  {
    key: "ppt",
    title: "PPT 生成",
    desc: "生成结构、标题页、证据页与研究要点",
    outputs: ["结构", "标题页", "证据页", "研究要点"],
    icon: "ppt",
    color: "#d48806",
  },
];

export const MOCK_PAPER_DRAFT = `# Title
Multimodal PET-CT Radiomics for Pathological Grade Prediction in Pseudomyxoma Peritonei

## Abstract
Background: PMP comprises DPAM and PMCA subtypes with distinct prognoses...
Methods: Retrospective cohort (n=128) with PET-CT radiomics and pathology...
Results: SUVmax and texture features discriminated high- vs low-grade disease (AUC 0.84)...
Conclusion: PET-based models may assist MDT decision-making [2,4,6].

## Introduction
Pseudomyxoma peritonei (PMP) remains a clinical challenge [1,3]...

## Methods
Patients from the institutional PMP registry [6]...

## Results
High-grade cases showed elevated SUVmax (p=0.003) [2]...

## Discussion
Consistent with recent multimodal fusion studies [8]...
`;

export const MOCK_GRANT_DRAFT = `## 技术路线
1. 专病库队列构建（n≥500）→ 2. 影像组学+临床多模态特征 → 3. 分级/预后模型 → 4. 外部验证

## 创新点
- 国内首个 PMP 多模态 PET-病理对照大样本队列
- Early/Late Fusion 可解释联合模型

## 可行性分析
- 已有 128 例入库数据与 PET 配对 96 例 [6]
- 团队具备 CRS+HIPEC 与核医学 MDT 基础

## 预期成果
- SCI 论文 2–3 篇；分级辅助模型 1 套；指南证据补充 1 项
`;
