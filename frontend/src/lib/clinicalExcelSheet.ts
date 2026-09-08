import * as XLSX from "xlsx";

function cellStr(v: unknown): string {
  if (v == null) return "";
  return String(v).trim();
}

const ID_HEADER_RE = /^(ID|id|就诊号|患者ID|patient\s*id)$/i;
const NAME_HEADER_RE = /^(姓名|name|患者姓名)$/i;

export function isClinicalHeaderRow(row: unknown[]): boolean {
  const cells = row.map(cellStr);
  return cells.some((c) => ID_HEADER_RE.test(c)) && cells.some((c) => NAME_HEADER_RE.test(c));
}

export type ClinicalExcelMatrix = {
  matrix: unknown[][];
  sheetName: string;
  headerRowIndex: number;
};

function countDataRows(matrix: unknown[][], headerRowIndex: number): number {
  const headers = matrix[headerRowIndex]?.map(cellStr) ?? [];
  let n = 0;
  for (let i = headerRowIndex + 1; i < matrix.length; i++) {
    const line = matrix[i];
    if (!line || line.every((c) => !cellStr(c))) continue;
    const raw: Record<string, string> = {};
    headers.forEach((h, idx) => {
      if (h) raw[h] = cellStr(line[idx]);
    });
    const id = raw.就诊号 || raw.ID || raw["患者ID"] || raw.id || cellStr(line[0]);
    if (id) n++;
  }
  return n;
}

/**
 * 选择临床 Excel 工作表：使用带 ID/姓名 表头且有效数据行最多的 Sheet。
 * 多 Sheet 时第一个 Tab 可能仅为「高级别」等子集，全量常在后续汇总页。
 */
export function pickClinicalExcelSheet(wb: XLSX.WorkBook): ClinicalExcelMatrix {
  let best: ClinicalExcelMatrix | null = null;
  let bestCount = -1;

  for (const sheetName of wb.SheetNames) {
    const sheet = wb.Sheets[sheetName];
    const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "" }) as unknown[][];
    if (matrix.length < 2) continue;

    for (let h = 0; h < Math.min(3, matrix.length); h++) {
      if (!isClinicalHeaderRow(matrix[h])) continue;
      const count = countDataRows(matrix, h);
      if (count > bestCount) {
        bestCount = count;
        best = { matrix, sheetName, headerRowIndex: h };
      }
      break;
    }
  }

  if (best) return best;

  const sheetName = wb.SheetNames[0];
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[sheetName], {
    header: 1,
    defval: "",
  }) as unknown[][];
  return { matrix, sheetName, headerRowIndex: 0 };
}

export function readClinicalExcelBuffer(buffer: ArrayBuffer): ClinicalExcelMatrix {
  const wb = XLSX.read(buffer, { type: "array", cellDates: false });
  return pickClinicalExcelSheet(wb);
}

export async function readClinicalExcelFile(file: File): Promise<ClinicalExcelMatrix> {
  return readClinicalExcelBuffer(await file.arrayBuffer());
}
