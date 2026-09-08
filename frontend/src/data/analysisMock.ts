export type TreatmentPlan = {
  id: string;
  patientId: string;
  patientName: string;
  diagnosis: string;
  gradeLabel: string;
  stage: string;
  scheme: string;
  priority: "首选" | "备选" | "MDT";
  lines: string[];
  drugs: string[];
  followUp: string;
  guideline: string;
  mdtRequired: boolean;
};

export type PrognosisRecord = {
  id: string;
  patientId: string;
  patientName: string;
  diagnosis: string;
  gradeLabel: string;
  riskLevel: "低危" | "中危" | "高危";
  mpfs: string;
  mos: string;
  os1y: string;
  os2y: string;
  os3y: string;
  score: number;
  factors: string[];
  model: string;
};

export type CohortMember = {
  id: string;
  patientId: string;
  patientName: string;
  gender: string;
  age: number;
  diagnosis: string;
  gradeLabel: string;
  department: string;
  suvMax: number | null;
  enrolledAt: string;
  followUpStatus: "随访中" | "已完成" | "失访";
  nextVisit: string;
  pmpSubtype: string;
};

export const MOCK_TREATMENT_PLANS: TreatmentPlan[] = [
  {
    id: "TX-001",
    patientId: "PMP00012345",
    patientName: "王建国",
    diagnosis: "右肺腺癌",
    gradeLabel: "高级别",
    stage: "IIB期",
    scheme: "手术 + 辅助靶向",
    priority: "首选",
    lines: [
      "肺叶切除 + 系统性淋巴结清扫",
      "术后含铂双药化疗 4 周期",
      "EGFR-TKI（奥希替尼）辅助 3 年",
      "每 3 个月 CT + 肿瘤标志物随访",
    ],
    drugs: ["奥希替尼 80mg qd", "培美曲塞 + 卡铂（辅助化疗）"],
    followUp: "每 3 个月影像 + CEA/CYFRA21-1",
    guideline: "NCCN NSCLC 2024 · CSCO 肺腺癌",
    mdtRequired: true,
  },
  {
    id: "TX-002",
    patientId: "PMP00012346",
    patientName: "李秀英",
    diagnosis: "腹膜假粘液瘤",
    gradeLabel: "低级别",
    stage: "—",
    scheme: "CRS + HIPEC（低级别 PMP）",
    priority: "首选",
    lines: [
      "细胞减灭术（CRS）+ 腹腔热灌注化疗（HIPEC）",
      "DPAM 表型：完整 CRS 后 5 年 OS 可达 60–80%",
      "术后 6 个月增强 CT 评估复发",
      "避免过度化疗，低级别 PMP 化疗获益有限",
    ],
    drugs: ["HIPEC：丝裂霉素 + 顺铂（术中）"],
    followUp: "每 6 个月 CT + CA19-9/CEA",
    guideline: "PMP 国际共识 · NCCN 罕见肿瘤",
    mdtRequired: true,
  },
  {
    id: "TX-003",
    patientId: "PMP00012347",
    patientName: "陈志远",
    diagnosis: "结肠粘液腺癌",
    gradeLabel: "高级别",
    stage: "III期",
    scheme: "根治术 + 辅助化疗",
    priority: "首选",
    lines: [
      "右半结肠根治术 + D3 淋巴结清扫",
      "KRAS 突变：不含抗 EGFR 单抗",
      "辅助 FOLFOX 6 个月",
      "MSI/PD-L1 评估免疫治疗备选",
    ],
    drugs: ["FOLFOX 方案", "卡培他滨维持（可选）"],
    followUp: "每 3 个月 CEA + CT，共 3 年",
    guideline: "NCCN 结肠癌 2024 · CSCO",
    mdtRequired: false,
  },
];

export const MOCK_PROGNOSIS: PrognosisRecord[] = [
  {
    id: "PROG-001",
    patientId: "PMP00012345",
    patientName: "王建国",
    diagnosis: "右肺腺癌 IIB",
    gradeLabel: "高级别",
    riskLevel: "中危",
    mpfs: "24.6 月",
    mos: "38.5 月",
    os1y: "82%",
    os2y: "61%",
    os3y: "38%",
    score: 62,
    factors: ["EGFR 19del 阳性（预后较好）", "纵隔淋巴结转移（+）", "SUVmax 8.6（代谢活跃）"],
    model: "Adjuvant! Lite + 分子分型",
  },
  {
    id: "PROG-002",
    patientId: "PMP00012346",
    patientName: "李秀英",
    diagnosis: "腹膜假粘液瘤 DPAM",
    gradeLabel: "低级别",
    riskLevel: "低危",
    mpfs: "—",
    mos: "> 120 月（CRS 后）",
    os1y: "95%",
    os2y: "88%",
    os3y: "75%",
    score: 28,
    factors: ["DPAM 低级别表型", "完整 CRS 可达长期生存", "Ki-67 5%（增殖低）"],
    model: "PMP 特异性预后模型（演示）",
  },
  {
    id: "PROG-003",
    patientId: "PMP00012347",
    patientName: "陈志远",
    diagnosis: "结肠粘液腺癌 III期",
    gradeLabel: "高级别",
    riskLevel: "高危",
    mpfs: "11.2 月",
    mos: "22.8 月",
    os1y: "68%",
    os2y: "42%",
    os3y: "25%",
    score: 78,
    factors: ["KRAS G12V 突变", "粘液腺癌组织学", "淋巴结转移 ≥ 3 枚"],
    model: "Cox 多因素 + 病理分级",
  },
];

export const MOCK_COHORT: CohortMember[] = [
  {
    id: "FQ-001",
    patientId: "PMP00012345",
    patientName: "王建国",
    gender: "男",
    age: 58,
    diagnosis: "右肺腺癌",
    gradeLabel: "高级别",
    department: "肿瘤内科",
    suvMax: 8.6,
    enrolledAt: "2024-05-20",
    followUpStatus: "随访中",
    nextVisit: "2024-08-20",
    pmpSubtype: "—",
  },
  {
    id: "FQ-002",
    patientId: "PMP00012346",
    patientName: "李秀英",
    gender: "女",
    age: 62,
    diagnosis: "腹膜假粘液瘤",
    gradeLabel: "低级别",
    department: "妇科肿瘤科",
    suvMax: 3.2,
    enrolledAt: "2024-05-18",
    followUpStatus: "随访中",
    nextVisit: "2024-11-18",
    pmpSubtype: "DPAM",
  },
  {
    id: "FQ-003",
    patientId: "PMP00012347",
    patientName: "陈志远",
    gender: "男",
    age: 45,
    diagnosis: "结肠粘液腺癌",
    gradeLabel: "高级别",
    department: "胃肠外科",
    suvMax: null,
    enrolledAt: "2024-05-15",
    followUpStatus: "随访中",
    nextVisit: "2024-08-15",
    pmpSubtype: "—",
  },
  {
    id: "FQ-004",
    patientId: "PMP00012348",
    patientName: "赵美玲",
    gender: "女",
    age: 51,
    diagnosis: "腹膜假粘液瘤",
    gradeLabel: "低级别",
    department: "妇科肿瘤科",
    suvMax: 2.8,
    enrolledAt: "2024-04-10",
    followUpStatus: "随访中",
    nextVisit: "2024-10-10",
    pmpSubtype: "LAMN",
  },
  {
    id: "FQ-005",
    patientId: "PMP00012349",
    patientName: "孙伟",
    gender: "男",
    age: 67,
    diagnosis: "腹膜粘液癌",
    gradeLabel: "高级别",
    department: "肿瘤内科",
    suvMax: 6.5,
    enrolledAt: "2024-03-22",
    followUpStatus: "失访",
    nextVisit: "—",
    pmpSubtype: "PMCA",
  },
  {
    id: "FQ-006",
    patientId: "PMP00012350",
    patientName: "周静",
    gender: "女",
    age: 44,
    diagnosis: "卵巢高级别浆液性癌",
    gradeLabel: "高级别",
    department: "妇科肿瘤科",
    suvMax: 9.1,
    enrolledAt: "2024-02-08",
    followUpStatus: "已完成",
    nextVisit: "—",
    pmpSubtype: "—",
  },
];
