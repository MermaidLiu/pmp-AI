import * as XLSX from "xlsx";
import { pickClinicalExcelSheet } from "../clinicalExcelSheet";
import {
  CATEGORY_LABELS,
  DEFAULT_PURCHASED_MODULES,
  type ClinicalRecord,
  type ClinicalVariable,
  type ColumnCategory,
  type FileLinkKey,
  type ParseExcelOptions,
  type ParseExcelResult,
  type PurchasedModules,
  type VariableType,
} from "./types";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const FILE_LINK_RE = /\{([^}]+)\}/;
const PATIENT_ID_RE = /患者\s*ID/i;
const PATIENT_ID_HEADER_RE = /^(患者\s*ID|患者ID|patient\s*_?\s*id|ID|id|就诊号|病历号|住院号|admission\s*id)$/i;

function isPatientIdColumnName(name: string): boolean {
  return PATIENT_ID_HEADER_RE.test(name.trim());
}

function cellStr(v: unknown): string {
  if (v == null) return "";
  return String(v).trim();
}

function forwardFillCategories(row: string[]): string[] {
  const out: string[] = [];
  let last = "";
  for (const c of row) {
    if (c) last = c;
    out.push(last);
  }
  return out;
}

function normalizeCategory(label: string, varName: string): ColumnCategory {
  const s = `${label}${varName}`;
  if (isPatientIdColumnName(varName) || PATIENT_ID_RE.test(varName) || PATIENT_ID_RE.test(label)) {
    return "patient_id";
  }
  if (/影像/.test(s)) return "imaging_file";
  if (/病理文件/.test(s)) return "pathology_file";
  if (/波形|心电|脑电|ECG|EEG/.test(s)) return "waveform_file";
  if (/患者信息|实验室|检查|临床|病理|姓名|性别|年龄|CEA|CA-|PCI|WBC|Ki-?67|免疫/i.test(s)) {
    return "patient_info";
  }
  return "unknown";
}

function categoryLabelFromVarName(varName: string): string {
  if (isPatientIdColumnName(varName) || PATIENT_ID_RE.test(varName)) return "患者 ID";
  if (/影像|CT|MRI|DICOM|nii/i.test(varName)) return "影像文件";
  if (/病理文件/.test(varName)) return "病理文件";
  if (/波形|心电|ECG|EEG/.test(varName)) return "波形文件";
  return "患者信息";
}

function isLikelyVariableNameCell(value: string): boolean {
  const v = value.trim();
  if (!v) return false;
  if (/^\d+$/.test(v)) return false;
  if (isPatientIdColumnName(v)) return true;
  if (/^[\u4e00-\u9fff]{1,8}$/.test(v) && !/^\d+岁$/.test(v)) return true;
  if (/^[A-Za-z0-9_\-（）().]+$/.test(v) && v.length <= 32) return true;
  return false;
}

/** 单行表头（如 临床资料.xls：第 1 行 ID/姓名/…，第 2 行起为数据） */
function isFlatHeaderSheet(grid: unknown[][], headerRowIndex = 0): boolean {
  if (grid.length < headerRowIndex + 2) return false;
  const headers = grid[headerRowIndex].map(cellStr);
  const firstData = grid[headerRowIndex + 1].map(cellStr);

  const row0IsCategoryRow = headers.some((h) =>
    /^(患者\s*ID|患者信息|影像文件|病理文件|波形)/.test(h),
  );
  if (row0IsCategoryRow) return false;

  const idCol = headers.findIndex(isPatientIdColumnName);
  if (idCol < 0) return false;

  const idValue = firstData[idCol] ?? "";
  if (!idValue || isLikelyVariableNameCell(idValue)) return false;

  const nameCol = headers.findIndex((h) => /^姓名$|^name$/i.test(h));
  if (nameCol >= 0 && /^[\u4e00-\u9fff]/.test(firstData[nameCol] ?? "")) return true;

  return /^\d+$/.test(idValue) || idValue.length >= 2;
}

function parseFileLinkKey(varName: string): FileLinkKey | undefined {
  const m = varName.match(FILE_LINK_RE);
  if (!m) return undefined;
  const key = m[1].trim();
  if (key === "患者ID" || key === "检查号" || key === "文件名") return key;
  return "文件名";
}

function displayVarName(raw: string): string {
  return raw.replace(FILE_LINK_RE, "").trim() || raw.trim();
}

function isModulePurchased(cat: ColumnCategory, modules: PurchasedModules): boolean {
  if (cat === "imaging_file") return modules.imaging;
  if (cat === "pathology_file") return modules.pathology;
  if (cat === "waveform_file") return modules.waveform;
  return true;
}

function inferVariableType(values: string[], isFile: boolean): VariableType {
  if (isFile) return "file";
  const nonEmpty = values.map((v) => v.trim()).filter(Boolean);
  if (nonEmpty.length === 0) return "text";

  if (nonEmpty.every((v) => DATE_RE.test(v))) return "date";

  const allNumeric = nonEmpty.every((v) => !Number.isNaN(Number(v)) && v !== "");
  if (allNumeric) {
    const unique = new Set(nonEmpty).size;
    return unique > 20 ? "numerical" : "categorical";
  }

  const unique = new Set(nonEmpty).size;
  return unique <= 20 ? "categorical" : "text";
}

function calcFillRate(values: string[]): number {
  if (values.length === 0) return 0;
  const filled = values.filter((v) => v.trim() !== "").length;
  return Math.round((filled / values.length) * 10000) / 100;
}

export function parseClinicalExcelBuffer(
  buffer: ArrayBuffer,
  datasetName: string,
  options: ParseExcelOptions = {},
): ParseExcelResult {
  const modules = options.purchasedModules ?? DEFAULT_PURCHASED_MODULES;
  const warnings: string[] = [];
  const errors: string[] = [];

  const wb = XLSX.read(buffer, { type: "array", cellDates: false });
  const picked = pickClinicalExcelSheet(wb);
  const grid = picked.matrix as unknown[][];
  if (picked.sheetName !== wb.SheetNames[0]) {
    warnings.push(`已从工作表「${picked.sheetName}」读取（共 ${wb.SheetNames.length} 个 Sheet，选用数据最全的一页）`);
  }

  const flatHeader = isFlatHeaderSheet(grid, picked.headerRowIndex);

  if (!flatHeader && grid.length < 3) {
    errors.push("Excel 至少需要 3 行：第 1 行类型、第 2 行变量名、第 3 行起为数据（或使用单行表头：第 1 行变量名、第 2 行起为数据）");
    return {
      dataset: { name: datasetName, variables: [], rows: [], patientIdField: "", usedFileLinkKeys: [] },
      warnings,
      errors,
    };
  }

  if (flatHeader && grid.length < 2) {
    errors.push("Excel 至少需要 2 行：第 1 行变量名、第 2 行起为数据");
    return {
      dataset: { name: datasetName, variables: [], rows: [], patientIdField: "", usedFileLinkKeys: [] },
      warnings,
      errors,
    };
  }

  let typeRow: string[];
  let varRow: string[];
  let dataRows: unknown[][];

  if (flatHeader) {
    varRow = grid[picked.headerRowIndex].map(cellStr);
    typeRow = varRow.map(categoryLabelFromVarName);
    dataRows = grid.slice(picked.headerRowIndex + 1).filter((row) => row.some((c) => cellStr(c) !== ""));
    warnings.push("已识别为单行表头格式（第 1 行变量名，第 2 行起为病例数据）");
  } else {
    typeRow = forwardFillCategories(grid[picked.headerRowIndex].map(cellStr));
    varRow = grid[picked.headerRowIndex + 1].map(cellStr);
    dataRows = grid.slice(picked.headerRowIndex + 2).filter((row) => row.some((c) => cellStr(c) !== ""));
  }

  const colCount = Math.max(typeRow.length, varRow.length);
  const columns: {
    index: number;
    categoryLabel: string;
    category: ColumnCategory;
    rawName: string;
    name: string;
    fileLinkKey?: FileLinkKey;
    skipped: boolean;
  }[] = [];

  for (let i = 0; i < colCount; i++) {
    const categoryLabel = typeRow[i] ?? "";
    const rawName = varRow[i] ?? "";
    if (!rawName && !PATIENT_ID_RE.test(categoryLabel) && !isPatientIdColumnName(categoryLabel)) continue;

    const name = rawName ? displayVarName(rawName) : displayVarName(categoryLabel);
    if (!name) continue;

    const category = normalizeCategory(categoryLabel, rawName || categoryLabel);
    const fileLinkKey = parseFileLinkKey(rawName);
    const isFileCat = category === "imaging_file" || category === "pathology_file" || category === "waveform_file";
    const skipped = isFileCat && !isModulePurchased(category, modules);

    columns.push({
      index: i,
      categoryLabel: categoryLabel || CATEGORY_LABELS[category],
      category,
      rawName: rawName || categoryLabel,
      name,
      fileLinkKey: isFileCat || fileLinkKey ? fileLinkKey ?? "文件名" : undefined,
      skipped,
    });
  }

  const nameCounts = new Map<string, number>();
  for (const c of columns) {
    nameCounts.set(c.name, (nameCounts.get(c.name) ?? 0) + 1);
  }
  for (const [n, count] of nameCounts) {
    if (count > 1) errors.push(`变量名重复：「${n}」出现 ${count} 次`);
  }

  const patientCol =
    columns.find((c) => c.category === "patient_id") ??
    columns.find((c) => isPatientIdColumnName(c.name)) ??
    columns.find((c) => PATIENT_ID_RE.test(c.name));
  if (!patientCol) {
    errors.push("未找到「患者 ID」列，第一行类型或第二行变量名须包含患者 ID（或单行表头中使用 ID / 患者ID 列）");
  }

  const usedFileLinkKeys: string[] = [];

  const variables: ClinicalVariable[] = columns.map((col) => {
    const colValues = dataRows.map((row) => cellStr(row[col.index]));
    const isFile = col.fileLinkKey != null || col.category.includes("_file");
    let skipped = col.skipped;

    if (isFile && col.fileLinkKey && !skipped) {
      const linkId = `${col.category}:${col.fileLinkKey}`;
      if (usedFileLinkKeys.includes(linkId)) {
        warnings.push(`文件关联键「${col.fileLinkKey}」已在其他列使用，列「${col.name}」不会自动关联文件`);
        skipped = true;
      } else {
        usedFileLinkKeys.push(linkId);
      }
    }

    if (skipped && col.skipped) {
      warnings.push(`列「${col.name}」属于未购买模块，已跳过文件解析`);
    }

    const inferred = inferVariableType(colValues, isFile);
    return {
      id: `var_${col.index}_${col.name}`,
      name: col.name,
      category: col.category,
      categoryLabel: col.categoryLabel,
      type: inferred,
      fileLinkKey: col.fileLinkKey,
      skipped,
      fillRate: calcFillRate(colValues),
    };
  });

  const rows: ClinicalRecord[] = [];
  const patientIdField = patientCol?.name ?? "患者 ID";
  const seenIds = new Set<string>();

  for (const row of dataRows) {
    const record: ClinicalRecord = {};
    for (const col of columns) {
      record[col.name] = cellStr(row[col.index]);
    }
    const pid = record[patientIdField]?.trim();
    if (!pid) {
      warnings.push("存在患者 ID 为空的行，已跳过");
      continue;
    }
    if (seenIds.has(pid)) {
      errors.push(`患者 ID 重复：${pid}`);
      continue;
    }
    seenIds.add(pid);
    rows.push(record);
  }

  if (errors.length > 0) {
    return {
      dataset: { name: datasetName, variables, rows, patientIdField, usedFileLinkKeys },
      warnings,
      errors,
    };
  }

  return {
    dataset: {
      name: datasetName,
      variables,
      rows,
      patientIdField,
      usedFileLinkKeys,
    },
    warnings,
    errors,
  };
}

export async function parseClinicalExcelFile(
  file: File,
  datasetName?: string,
  options?: ParseExcelOptions,
): Promise<ParseExcelResult> {
  const buffer = await file.arrayBuffer();
  const name = datasetName?.trim() || file.name.replace(/\.(xlsx|xls|csv)$/i, "");
  return parseClinicalExcelBuffer(buffer, name, options);
}
