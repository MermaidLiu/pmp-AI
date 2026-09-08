import * as XLSX from "xlsx";
import type { PetCtInterviewRecord } from "../api/client";
import type { FollowUpBatchCase } from "../followUpBatchStore";
import type { ClinicalDataset, ClinicalRecord, ClinicalVariable } from "./types";

/** 与「临床数据导入模板」一致的两行表头 */
export const CLINICAL_TEMPLATE_TYPE_ROW = [
  "患者ID",
  "患者信息",
  "",
  "",
  "影像文件",
  "",
  "病理文件",
  "",
  "波形文件",
  "",
] as const;

export const CLINICAL_TEMPLATE_VAR_ROW = [
  "",
  "年龄",
  "性别",
  "RBC",
  "术后CT检查{文件名}",
  "随访CT检查{检查号}",
  "术前病理{文件名}",
  "术后病理{文件名}",
  "心电数据{患者ID}",
  "脑电数据{患者ID}",
] as const;

/** 数据行使用的稳定列名（去掉 {} 关联键说明，便于数据集变量管理） */
export const CLINICAL_TEMPLATE_DATA_KEYS = [
  "患者ID",
  "年龄",
  "性别",
  "RBC",
  "术后CT检查",
  "随访CT检查",
  "术前病理",
  "术后病理",
  "心电数据",
  "脑电数据",
] as const;

export type ClinicalTemplateRow = Record<(typeof CLINICAL_TEMPLATE_DATA_KEYS)[number], string>;

const BRIDGE_KEY = "pmp_workflow_clinical_bridge";

export type WorkflowClinicalBridge = {
  /** exam_id / 患者ID → 模板行 */
  byId: Record<string, ClinicalTemplateRow>;
  updatedAt: string;
};

export function emptyTemplateRow(): ClinicalTemplateRow {
  return {
    患者ID: "",
    年龄: "",
    性别: "",
    RBC: "",
    术后CT检查: "",
    随访CT检查: "",
    术前病理: "",
    术后病理: "",
    心电数据: "",
    脑电数据: "",
  };
}

/** 工作台病例 → 科研临床 Excel 模板行 */
export function mapWorkflowRecordToTemplateRow(
  record: PetCtInterviewRecord,
  extras?: { imagingFileHint?: string; pathologyHint?: string },
): ClinicalTemplateRow {
  const p = record.patient_base_info;
  const lab = record.research_extensions?.lab_snapshot || {};
  const patientId =
    (p.medical_record_id || "").trim() ||
    (p.exam_id || "").trim() ||
    (p.admission_id || "").trim() ||
    "";
  const rbc = String(lab.RBC || lab.rbc || "").trim();
  const grade = String(record.research_extensions?.pathology_grade || "").trim();
  const pathHint =
    extras?.pathologyHint ||
    grade ||
    (record.interview_info.clinical_diagnosis || "").slice(0, 80);

  return {
    患者ID: patientId,
    年龄: p.age != null && p.age > 0 ? String(p.age) : "",
    性别: (p.gender || "").trim(),
    RBC: rbc,
    术后CT检查: extras?.imagingFileHint || (p.exam_item || "").trim() || "腹盆CT",
    随访CT检查: (p.exam_id || "").trim(),
    术前病理: pathHint,
    术后病理: grade || pathHint,
    心电数据: patientId,
    脑电数据: patientId,
  };
}

/** 随访批量行若已含模板字段则规范化；否则尽量从 raw/labs 拼出 */
export function mapFollowUpCaseToTemplateRow(c: FollowUpBatchCase): ClinicalTemplateRow {
  const raw = c.raw || {};
  const labs = c.labs || {};
  const id =
    cell(raw["患者ID"]) ||
    cell(raw.ID) ||
    cell(raw.就诊号) ||
    c.visitId ||
    "";
  return {
    患者ID: id,
    年龄: cell(raw["年龄"]) || cell(raw.age) || c.age || "",
    性别: cell(raw["性别"]) || cell(raw.gender) || c.gender || "",
    RBC: cell(raw.RBC) || cell(raw.rbc) || cell(labs.RBC) || "",
    术后CT检查:
      cell(raw["术后CT检查"]) ||
      cell(raw["术后CT检查{文件名}"]) ||
      c.ctFileName ||
      c.niiFileName ||
      "",
    随访CT检查:
      cell(raw["随访CT检查"]) ||
      cell(raw["随访CT检查{检查号}"]) ||
      cell(raw["随访CT检查2{检查号}"]) ||
      c.visitId ||
      "",
    术前病理: cell(raw["术前病理"]) || cell(raw["术前病理{文件名}"]) || c.pathology || "",
    术后病理: cell(raw["术后病理"]) || cell(raw["术后病理{文件名}"]) || c.gradeLabel || "",
    心电数据: cell(raw["心电数据"]) || cell(raw["心电数据{患者ID}"]) || id,
    脑电数据: cell(raw["脑电数据"]) || cell(raw["脑电数据{患者ID}"]) || id,
  };
}

function cell(v: unknown): string {
  if (v == null) return "";
  return String(v).trim();
}

/** 是否已具备模板最小字段（患者ID + 年龄或性别）——视为可用临床 Excel */
export function isTemplateRowUsable(row: ClinicalTemplateRow): boolean {
  return Boolean(row.患者ID && (row.年龄 || row.性别 || row.RBC));
}

/** raw 是否像模板 Excel（含年龄/性别/RBC 等） */
export function rawLooksLikeClinicalTemplate(raw: Record<string, string>): boolean {
  const keys = Object.keys(raw || {});
  const hasId = keys.some((k) => /患者ID|^ID$|就诊号/i.test(k));
  const hasDemo = keys.some((k) => /年龄|性别|RBC/i.test(k));
  return hasId && hasDemo;
}

export function loadWorkflowClinicalBridge(): WorkflowClinicalBridge {
  try {
    const raw = localStorage.getItem(BRIDGE_KEY);
    if (raw) return JSON.parse(raw) as WorkflowClinicalBridge;
  } catch {
    /* ignore */
  }
  return { byId: {}, updatedAt: "" };
}

export function saveWorkflowClinicalBridgeEntry(id: string, row: ClinicalTemplateRow): void {
  if (!id.trim()) return;
  const cur = loadWorkflowClinicalBridge();
  cur.byId[id.trim()] = row;
  // 同时用患者ID索引
  if (row.患者ID && row.患者ID !== id) cur.byId[row.患者ID] = row;
  cur.updatedAt = new Date().toISOString();
  localStorage.setItem(BRIDGE_KEY, JSON.stringify(cur));
}

export function getBridgeTemplateRow(id: string): ClinicalTemplateRow | null {
  const cur = loadWorkflowClinicalBridge();
  return cur.byId[id] || null;
}

export function buildClinicalDatasetFromTemplateRows(
  rows: ClinicalTemplateRow[],
  name: string,
): Omit<ClinicalDataset, "id" | "createdAt" | "updatedAt"> {
  const records: ClinicalRecord[] = rows.map((r) => {
    const out: ClinicalRecord = {};
    for (const k of CLINICAL_TEMPLATE_DATA_KEYS) out[k] = r[k] ?? "";
    return out;
  });

  const categoryOf = (name: string): ClinicalVariable["category"] => {
    if (name === "患者ID") return "patient_id";
    if (["年龄", "性别", "RBC"].includes(name)) return "patient_info";
    if (name.includes("CT")) return "imaging_file";
    if (name.includes("病理")) return "pathology_file";
    if (name.includes("电")) return "waveform_file";
    return "unknown";
  };

  const categoryLabel: Record<ClinicalVariable["category"], string> = {
    patient_id: "患者 ID",
    patient_info: "患者信息",
    imaging_file: "影像文件",
    pathology_file: "病理文件",
    waveform_file: "波形文件",
    unknown: "其他",
  };

  const variables: ClinicalVariable[] = CLINICAL_TEMPLATE_DATA_KEYS.map((header, i) => {
    const colValues = records.map((r) => r[header] ?? "");
    const filled = colValues.filter((v) => v.trim()).length;
    const cat = categoryOf(header);
    return {
      id: `tpl_${i}_${header}`,
      name: header,
      category: cat,
      categoryLabel: categoryLabel[cat],
      type: header === "年龄" || header === "RBC" ? "numerical" : header === "性别" ? "categorical" : "text",
      fillRate: records.length ? Math.round((filled / records.length) * 10000) / 100 : 0,
      fileLinkKey:
        header === "术后CT检查" || header.includes("病理")
          ? "文件名"
          : header === "随访CT检查"
            ? "检查号"
            : header.includes("电")
              ? "患者ID"
              : undefined,
    };
  });

  return {
    name,
    variables,
    rows: records,
    patientIdField: "患者ID",
    usedFileLinkKeys: ["文件名", "检查号", "患者ID"],
  };
}

/** 生成对标深睿的 Excel 导入模板并触发下载 */
export function downloadClinicalExcelTemplate() {
  const sampleRows = [
    ["A123456", "20", "男", "5.5", "keyan/dataset_detail_id3", "1082120", "path_pre_001", "path_post_001", "A123456", "A123456"],
    ["A123457", "21", "女", "3.5", "1082121", "1012103", "path_pre_002", "path_post_002", "A123457", "A123457"],
    ["A123458", "22", "男", "5.4", "1082122", "1012104", "path_pre_003", "path_post_003", "A123458", "A123458"],
  ];

  const ws = XLSX.utils.aoa_to_sheet([
    [...CLINICAL_TEMPLATE_TYPE_ROW],
    [...CLINICAL_TEMPLATE_VAR_ROW],
    ...sampleRows,
  ]);
  ws["!merges"] = [
    { s: { r: 0, c: 1 }, e: { r: 0, c: 3 } },
    { s: { r: 0, c: 4 }, e: { r: 0, c: 5 } },
    { s: { r: 0, c: 6 }, e: { r: 0, c: 7 } },
    { s: { r: 0, c: 8 }, e: { r: 0, c: 9 } },
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "临床数据");

  const buf = XLSX.write(wb, { bookType: "xlsx", type: "array" });
  const blob = new Blob([buf], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "临床数据导入模板.xlsx";
  a.click();
  URL.revokeObjectURL(url);
}

/** 从模板行写回可下载的 xlsx（工作台映射结果预览/导出） */
export function downloadMappedClinicalExcel(rows: ClinicalTemplateRow[], fileName = "工作台映射临床数据.xlsx") {
  const dataRows = rows.map((r) => CLINICAL_TEMPLATE_DATA_KEYS.map((k) => r[k] ?? ""));
  const ws = XLSX.utils.aoa_to_sheet([
    [...CLINICAL_TEMPLATE_TYPE_ROW],
    [...CLINICAL_TEMPLATE_VAR_ROW],
    ...dataRows,
  ]);
  ws["!merges"] = [
    { s: { r: 0, c: 1 }, e: { r: 0, c: 3 } },
    { s: { r: 0, c: 4 }, e: { r: 0, c: 5 } },
    { s: { r: 0, c: 6 }, e: { r: 0, c: 7 } },
    { s: { r: 0, c: 8 }, e: { r: 0, c: 9 } },
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "临床数据");
  const buf = XLSX.write(wb, { bookType: "xlsx", type: "array" });
  const blob = new Blob([buf], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}
