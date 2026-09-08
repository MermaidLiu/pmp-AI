import type { FollowUpBatchCase } from "../followUpBatchStore";
import type { ClinicalDataset, ClinicalRecord, ClinicalVariable, VariableType } from "./types";

function inferVariableType(values: string[]): VariableType {
  const nonEmpty = values.map((v) => v.trim()).filter(Boolean);
  if (nonEmpty.length === 0) return "text";
  const allNumeric = nonEmpty.every((v) => !Number.isNaN(Number(v)) && v !== "");
  if (allNumeric) {
    return new Set(nonEmpty).size > 20 ? "numerical" : "categorical";
  }
  return new Set(nonEmpty).size <= 20 ? "categorical" : "text";
}

function calcFillRate(values: string[]): number {
  if (!values.length) return 0;
  const filled = values.filter((v) => v.trim() !== "").length;
  return Math.round((filled / values.length) * 10000) / 100;
}

function collectHeaders(cases: FollowUpBatchCase[]): string[] {
  const ordered: string[] = [];
  const seen = new Set<string>();
  for (const c of cases) {
    for (const k of Object.keys(c.raw)) {
      if (!k || seen.has(k)) continue;
      seen.add(k);
      ordered.push(k);
    }
  }
  return ordered;
}

function resolvePatientIdField(headers: string[]): string {
  for (const h of headers) {
    if (/^(ID|就诊号|患者ID)$/i.test(h)) return h;
  }
  return headers[0] || "ID";
}

/** 用 Excel 原始列（case.raw）构建临床数据集，变量名与表头一致。 */
export function buildClinicalDatasetFromFollowUpCases(
  cases: FollowUpBatchCase[],
  name: string,
): Omit<ClinicalDataset, "id" | "createdAt" | "updatedAt"> {
  const headers = collectHeaders(cases);
  const patientIdField = resolvePatientIdField(headers);

  const rows: ClinicalRecord[] = cases.map((c) => {
    const row: ClinicalRecord = {};
    for (const h of headers) {
      row[h] = c.raw[h] ?? "";
    }
    return row;
  });

  const variables: ClinicalVariable[] = headers.map((header, i) => {
    const colValues = rows.map((r) => r[header] ?? "");
    const isId = header === patientIdField;
    return {
      id: `var_${i}_${header}`,
      name: header,
      category: isId ? "patient_id" : "patient_info",
      categoryLabel: isId ? "患者 ID" : "患者信息",
      type: inferVariableType(colValues),
      fillRate: calcFillRate(colValues),
    };
  });

  return {
    name,
    variables,
    rows,
    patientIdField,
    usedFileLinkKeys: [],
  };
}
