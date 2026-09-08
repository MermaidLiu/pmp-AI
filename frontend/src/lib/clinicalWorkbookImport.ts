import { readClinicalExcelFile } from "./clinicalExcelSheet";
import { saveClinicalDataset } from "./clinicalDataset/store";
import { buildCohortFromPatients } from "./clinicalDataset/patientCohortDataset";
import type { PlatformPatient } from "../api/platform";
import { saveClinicalFields, type ClinicalFieldInput } from "./workflowCase";
import { RESEARCH_COHORT_DATASET_ID } from "./clinicalDataset/patientCohortDataset";

const WORKBOOK_KEY = "pmp_clinical_workbook";
export const WORKBOOK_IMPORTED_EVENT = "pmp-clinical-workbook-imported";

export function notifyWorkbookImported(state: ClinicalWorkbookState): void {
  window.dispatchEvent(new CustomEvent(WORKBOOK_IMPORTED_EVENT, { detail: state }));
}

export type ClinicalWorkbookRow = {
  id: string;
  name: string;
  gender: string;
  age: string;
  pciScore: number | null;
  pathology: string;
  gradeLabel: string;
  diagnosis: string;
  labs: Record<string, string>;
  raw: Record<string, string>;
};

export type ClinicalWorkbookState = {
  fileName: string;
  rows: ClinicalWorkbookRow[];
  selectedId: string;
  importedAt: string;
};

function cellStr(v: unknown): string {
  if (v == null) return "";
  return String(v).trim();
}

function parseAge(raw: string): number {
  const n = parseInt(raw.replace(/\D/g, ""), 10);
  return Number.isFinite(n) ? n : 0;
}

function inferGradeFromPathology(text: string): string {
  const t = text || "";
  if (/低级别|DPAM|假粘液|假 mucin|低度/i.test(t) && !/高级别|PMCA|腹膜粘液癌|印戒/i.test(t)) return "低级别";
  if (/高级别|PMCA|腹膜粘液癌|印戒|高度/i.test(t)) return "高级别";
  return "未确定";
}

function inferDiagnosis(pathology: string): string {
  if (/腹膜假粘液|PMP|DPAM|PMCA|腹膜粘液/i.test(pathology)) return "腹膜假粘液瘤（PMP）";
  if (/阑尾/i.test(pathology)) return "阑尾来源腹膜肿瘤";
  return pathology.slice(0, 40) || "待明确";
}

export async function parseClinicalWorkbookFile(file: File): Promise<ClinicalWorkbookRow[]> {
  const { matrix, headerRowIndex } = await readClinicalExcelFile(file);
  if (matrix.length < headerRowIndex + 2) return [];

  const headers = matrix[headerRowIndex].map((h) => cellStr(h));
  const rows: ClinicalWorkbookRow[] = [];

  for (let i = headerRowIndex + 1; i < matrix.length; i++) {
    const line = matrix[i];
    if (!line || line.every((c) => !cellStr(c))) continue;
    const raw: Record<string, string> = {};
    headers.forEach((h, idx) => {
      if (h) raw[h] = cellStr(line[idx]);
    });

    const id = raw.就诊号 || raw.ID || raw["患者ID"] || raw.id || cellStr(line[0]);
    if (!id) continue;

    const pathology = raw.病理 || raw.pathology || "";
    const pciRaw = raw.PCI评分 || raw.PCI || raw.pci;
    const pciScore = pciRaw != null && pciRaw !== "" ? Number(pciRaw) : null;
    const gradeRaw = raw.病理分级 ?? raw["病理分级"] ?? "";
    const gradeLabel =
      gradeRaw === "1" || gradeRaw === "1.0"
        ? "高级别"
        : gradeRaw === "0" || gradeRaw === "0.0"
          ? "低级别"
          : inferGradeFromPathology(pathology);

    const labs: Record<string, string> = {};
    for (const [k, v] of Object.entries(raw)) {
      if (["ID", "姓名", "性别", "年龄", "病理", "PCI评分", "PCI"].includes(k)) continue;
      if (v) labs[k] = v;
    }
    if (labs["CA-199"]) labs["CA19-9"] = labs["CA-199"];

    rows.push({
      id,
      name: raw.姓名 || raw.name || id,
      gender: raw.性别 || "",
      age: raw.年龄 || "",
      pciScore: Number.isFinite(pciScore) ? pciScore : null,
      pathology,
      gradeLabel,
      diagnosis: inferDiagnosis(pathology),
      labs,
      raw,
    });
  }
  return rows;
}

export function saveClinicalWorkbook(state: ClinicalWorkbookState): void {
  try {
    sessionStorage.setItem(WORKBOOK_KEY, JSON.stringify(state));
  } catch {
    /* ignore */
  }
}

export function loadClinicalWorkbook(): ClinicalWorkbookState | null {
  try {
    const raw = sessionStorage.getItem(WORKBOOK_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as ClinicalWorkbookState;
  } catch {
    return null;
  }
}

export function getWorkbookRow(id: string): ClinicalWorkbookRow | undefined {
  return loadClinicalWorkbook()?.rows.find((r) => r.id === id);
}

export function workbookRowToClinicalFields(row: ClinicalWorkbookRow): ClinicalFieldInput {
  return {
    patientName: row.name,
    age: parseAge(row.age),
    gender: row.gender,
    medicalRecordId: row.id,
    clinicalDiagnosis: row.diagnosis,
    briefMedicalHistory: row.pathology.slice(0, 500),
    labSnapshot: {
      CEA: row.labs["CEA(0-10ng/ml)"] || row.labs.CEA || "",
      CA125: row.labs["CA-125（0-35U/mL）"] || row.labs.CA125 || "",
      "CA19-9": row.labs["CA-199(0-37U/ml)"] || row.labs["CA19-9"] || "",
      PCI: row.pciScore != null ? String(row.pciScore) : "",
      病理摘要: row.pathology.slice(0, 200),
    },
  };
}

export function applyWorkbookRowToWorkflow(row: ClinicalWorkbookRow): void {
  saveClinicalFields(workbookRowToClinicalFields(row));
  const wb = loadClinicalWorkbook();
  if (wb) saveClinicalWorkbook({ ...wb, selectedId: row.id });
}

function rowToPlatformPatient(row: ClinicalWorkbookRow): PlatformPatient {
  return {
    id: row.id,
    name: row.name,
    gender: row.gender || "—",
    age: parseAge(row.age),
    diagnosis: row.diagnosis,
    stage: "—",
    gene: "—",
    enrolledAt: new Date().toISOString().slice(0, 10),
    department: "—",
    physician: "—",
    smoking: "—",
    ecog: "—",
    chiefComplaint: "—",
    pastHistory: "—",
    familyHistory: "—",
    admissionId: row.id,
    admissionTime: "—",
    gradeLabel: row.gradeLabel,
    pciScore: row.pciScore,
    clinicalSummary: row.pathology.slice(0, 120),
    pathologySummary: row.pathology.slice(0, 120),
  };
}

export function importWorkbookToClinicalDataset(rows: ClinicalWorkbookRow[], fileName: string): void {
  const patients = rows.map(rowToPlatformPatient);
  saveClinicalDataset({
    ...buildCohortFromPatients(patients, `临床 Excel · ${fileName}`),
    id: RESEARCH_COHORT_DATASET_ID,
  });
}

export async function importClinicalWorkbookFile(file: File): Promise<ClinicalWorkbookState> {
  const rows = await parseClinicalWorkbookFile(file);
  if (!rows.length) throw new Error("Excel 中未解析到有效病例行");
  importWorkbookToClinicalDataset(rows, file.name);
  const state: ClinicalWorkbookState = {
    fileName: file.name,
    rows,
    selectedId: rows[0].id,
    importedAt: new Date().toISOString(),
  };
  saveClinicalWorkbook(state);
  applyWorkbookRowToWorkflow(rows[0]);
  notifyWorkbookImported(state);
  return state;
}
