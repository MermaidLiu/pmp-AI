import type { PlatformPatient } from "../../api/platform";
import type { BatchPatientRef } from "../platformBatchSelection";
import type { ClinicalDataset, ClinicalRecord, ClinicalVariable } from "./types";

const COHORT_VARS: Omit<ClinicalVariable, "id" | "fillRate">[] = [
  { name: "患者ID", category: "patient_id", categoryLabel: "患者 ID", type: "text" },
  { name: "姓名", category: "patient_info", categoryLabel: "患者信息", type: "text" },
  { name: "年龄", category: "patient_info", categoryLabel: "患者信息", type: "numerical" },
  { name: "性别", category: "patient_info", categoryLabel: "患者信息", type: "categorical" },
  { name: "临床诊断", category: "patient_info", categoryLabel: "患者信息", type: "text" },
  { name: "病理分级", category: "patient_info", categoryLabel: "患者信息", type: "categorical" },
  { name: "PCI", category: "patient_info", categoryLabel: "患者信息", type: "numerical" },
  { name: "CC评分", category: "patient_info", categoryLabel: "患者信息", type: "categorical" },
  { name: "治疗方式", category: "patient_info", categoryLabel: "患者信息", type: "categorical" },
  { name: "第几次手术", category: "patient_info", categoryLabel: "患者信息", type: "numerical" },
  { name: "静脉化疗", category: "patient_info", categoryLabel: "患者信息", type: "categorical" },
  { name: "随访状态", category: "patient_info", categoryLabel: "患者信息", type: "categorical" },
];

function varWithId(v: Omit<ClinicalVariable, "id" | "fillRate">, idx: number, fillRate: number): ClinicalVariable {
  return { ...v, id: `v_${idx}`, fillRate };
}

function patientToRow(p: PlatformPatient): ClinicalRecord {
  const surgeryNum = parseInt(String(p.surgeryNumber || "").replace(/\D/g, ""), 10);
  return {
    患者ID: p.id,
    姓名: p.name,
    年龄: String(p.age || ""),
    性别: p.gender || "",
    临床诊断: p.diagnosis || "",
    病理分级: p.gradeLabel && p.gradeLabel !== "—" ? p.gradeLabel : "",
    PCI: p.pciScore != null ? String(p.pciScore) : "",
    CC评分: p.ccScore && p.ccScore !== "—" ? p.ccScore : "",
    治疗方式: p.treatmentMethod && p.treatmentMethod !== "—" ? p.treatmentMethod : "",
    第几次手术: Number.isFinite(surgeryNum) ? String(surgeryNum) : "",
    静脉化疗: p.ivChemotherapy && p.ivChemotherapy !== "—" ? p.ivChemotherapy : "",
    随访状态: p.followUpStatus || "",
  };
}

export function buildCohortFromPatients(
  patients: PlatformPatient[],
  name: string,
): Omit<ClinicalDataset, "id" | "createdAt" | "updatedAt"> {
  const rows = patients.map(patientToRow);
  const n = Math.max(rows.length, 1);
  const variables = COHORT_VARS.map((v, i) =>
    varWithId(
      v,
      i,
      Math.round((rows.filter((r) => Boolean(r[v.name])).length / n) * 100),
    ),
  );
  return {
    name,
    variables,
    rows,
    patientIdField: "患者ID",
    usedFileLinkKeys: [],
  };
}

export function buildCohortFromBatchRefs(
  refs: BatchPatientRef[],
  name: string,
): Omit<ClinicalDataset, "id" | "createdAt" | "updatedAt"> {
  const patients: PlatformPatient[] = refs.map((r) => ({
    id: r.id,
    name: r.name,
    gender: "—",
    age: 0,
    diagnosis: r.diagnosis || "—",
    stage: "—",
    gene: "—",
    enrolledAt: "—",
    department: "—",
    physician: "—",
    smoking: "—",
    ecog: "—",
    chiefComplaint: "—",
    pastHistory: "—",
    familyHistory: "—",
    admissionId: "—",
    admissionTime: "—",
    gradeLabel: r.gradeLabel,
    pciScore: r.pciScore,
    examId: r.examId,
    hasAnnotatedImage: r.hasAnnotatedImage,
  }));
  return buildCohortFromPatients(patients, name);
}

export function buildDemoPmpCohort(): Omit<ClinicalDataset, "id" | "createdAt" | "updatedAt"> {
  const demoPatients: PlatformPatient[] = [
    { id: "PMP-001", name: "张某", gender: "女", age: 52, diagnosis: "腹膜假粘液瘤", stage: "III", gene: "—", enrolledAt: "2025-01-12", department: "胃肠外科", physician: "—", smoking: "否", ecog: "1", chiefComplaint: "—", pastHistory: "—", familyHistory: "—", admissionId: "—", admissionTime: "—", gradeLabel: "低级别", pciScore: 12, ccScore: "CC-1", treatmentMethod: "CRS+HIPEC", surgeryNumber: "1", ivChemotherapy: "否", followUpStatus: "随访中" },
    { id: "PMP-002", name: "李某", gender: "男", age: 61, diagnosis: "腹膜假粘液瘤", stage: "IV", gene: "—", enrolledAt: "2025-02-03", department: "胃肠外科", physician: "—", smoking: "否", ecog: "0", chiefComplaint: "—", pastHistory: "—", familyHistory: "—", admissionId: "—", admissionTime: "—", gradeLabel: "高级别", pciScore: 28, ccScore: "CC-2", treatmentMethod: "CRS+HIPEC", surgeryNumber: "2", ivChemotherapy: "是", followUpStatus: "随访中" },
    { id: "PMP-003", name: "王某", gender: "女", age: 45, diagnosis: "腹膜假粘液瘤", stage: "II", gene: "—", enrolledAt: "2025-02-18", department: "胃肠外科", physician: "—", smoking: "否", ecog: "1", chiefComplaint: "—", pastHistory: "—", familyHistory: "—", admissionId: "—", admissionTime: "—", gradeLabel: "低级别", pciScore: 8, ccScore: "CC-0", treatmentMethod: "保守手术", surgeryNumber: "1", ivChemotherapy: "否", followUpStatus: "—" },
    { id: "PMP-004", name: "赵某", gender: "女", age: 58, diagnosis: "腹膜假粘液瘤", stage: "III", gene: "—", enrolledAt: "2025-03-05", department: "胃肠外科", physician: "—", smoking: "否", ecog: "1", chiefComplaint: "—", pastHistory: "—", familyHistory: "—", admissionId: "—", admissionTime: "—", gradeLabel: "高级别", pciScore: 22, ccScore: "CC-1", treatmentMethod: "CRS+HIPEC", surgeryNumber: "1", ivChemotherapy: "是", followUpStatus: "随访中" },
    { id: "PMP-005", name: "刘某", gender: "男", age: 49, diagnosis: "腹膜假粘液瘤", stage: "II", gene: "—", enrolledAt: "2025-03-20", department: "胃肠外科", physician: "—", smoking: "否", ecog: "0", chiefComplaint: "—", pastHistory: "—", familyHistory: "—", admissionId: "—", admissionTime: "—", gradeLabel: "低级别", pciScore: 15, ccScore: "CC-1", treatmentMethod: "CRS+HIPEC", surgeryNumber: "1", ivChemotherapy: "否", followUpStatus: "—" },
    { id: "PMP-006", name: "陈某", gender: "女", age: 55, diagnosis: "腹膜假粘液瘤", stage: "III", gene: "—", enrolledAt: "2025-04-01", department: "胃肠外科", physician: "—", smoking: "否", ecog: "1", chiefComplaint: "—", pastHistory: "—", familyHistory: "—", admissionId: "—", admissionTime: "—", gradeLabel: "未确定", pciScore: 18, ccScore: "CC-2", treatmentMethod: "CRS+HIPEC", surgeryNumber: "2", ivChemotherapy: "是", followUpStatus: "随访中" },
  ];
  return buildCohortFromPatients(demoPatients, "PMP 专病队列（演示）");
}

export const RESEARCH_COHORT_DATASET_ID = "research_clinical_cohort";
