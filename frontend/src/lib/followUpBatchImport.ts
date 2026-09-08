import JSZip from "jszip";
import type { PlatformPatient } from "../api/platform";
import { parseClinicalExcelBuffer } from "./clinicalDataset/parseExcel";
import { RESEARCH_COHORT_DATASET_ID } from "./clinicalDataset/patientCohortDataset";
import { saveClinicalDataset } from "./clinicalDataset/store";
import { isNiiFileName } from "./caseFileClassifier";
import { readClinicalExcelFile } from "./clinicalExcelSheet";
import { cacheNiiVolume, parseNiiVolume, resolveNiiRole } from "./niiVolumeStore";
import { loadPatients, savePatients } from "./platformPatients";
import {
  batchCasesToImagingRecords,
  batchCasesToPlatformPatients,
  loadFollowUpBatch,
  normalizeVisitId,
  padVisitId,
  findVisitIdInFileName,
  parseVisitIdFromNiiFileName,
  saveFollowUpBatch,
  visitIdsEqual,
  type FollowUpBatchCase,
  type FollowUpBatchState,
} from "./followUpBatchStore";

export type FollowUpBatchImportResult = FollowUpBatchState & {
  warnings: string[];
};

export type FollowUpBatchImportInput = {
  zipFile?: File | null;
  excelFile?: File | null;
};

type ClinicalRow = Omit<
  FollowUpBatchCase,
  "niiVolumeId" | "niiFileName" | "ctVolumeId" | "ctFileName" | "importedAt"
>;

function cellStr(v: unknown): string {
  if (v == null) return "";
  return String(v).trim();
}

function parseAge(raw: string): string {
  return raw || "";
}

function resolvePathologyGrade(raw: Record<string, string>, pathologyText: string): string {
  const gradeRaw =
    raw.病理分级 ?? raw["病理分级"] ?? raw.grade ?? raw.Grade ?? raw.GRADE ?? "";
  const v = cellStr(gradeRaw);
  if (v === "1" || v === "1.0") return "高级别";
  if (v === "0" || v === "0.0") return "低级别";
  if (/^高/.test(v) || /高级别|PMCA|高度/i.test(v)) return "高级别";
  if (/^低/.test(v) || /低级别|DPAM|低度/i.test(v)) return "低级别";
  const t = pathologyText || "";
  if (/低级别|DPAM|假粘液|低度/i.test(t) && !/高级别|PMCA|腹膜粘液癌|印戒|高度/i.test(t)) return "低级别";
  if (/高级别|PMCA|腹膜粘液癌|印戒|高度/i.test(t)) return "高级别";
  return "未确定";
}

function resolveVisitId(raw: Record<string, string>, line: unknown[]): string {
  const candidates = [
    raw.就诊号,
    raw["就诊号"],
    raw.VisitId,
    raw.ID,
    raw.id,
    raw["患者ID"],
    cellStr(line[0]),
  ].filter(Boolean);
  const id = cellStr(candidates[0]);
  if (/^\d+$/.test(id)) return padVisitId(id);
  return id;
}

function inferDiagnosis(pathology: string): string {
  if (/腹膜假粘液|PMP|DPAM|PMCA|腹膜粘液/i.test(pathology)) return "腹膜假粘液瘤（PMP）";
  if (/阑尾/i.test(pathology)) return "阑尾来源腹膜肿瘤";
  return pathology.slice(0, 40) || "待明确";
}

function stubCaseFromVisitId(visitId: string, importedAt: string): FollowUpBatchCase {
  const id = padVisitId(visitId);
  return {
    visitId: id,
    name: id,
    gender: "",
    age: "",
    pciScore: null,
    pathology: "",
    gradeLabel: "未确定",
    diagnosis: "待明确",
    labs: {},
    raw: {},
    niiVolumeId: null,
    niiFileName: null,
    ctVolumeId: null,
    ctFileName: null,
    importedAt,
  };
}

function clinicalRowToCase(row: ClinicalRow, importedAt: string): FollowUpBatchCase {
  return {
    ...row,
    niiVolumeId: null,
    niiFileName: null,
    ctVolumeId: null,
    ctFileName: null,
    importedAt,
  };
}

function mergeCase(existing: FollowUpBatchCase, incoming: FollowUpBatchCase): FollowUpBatchCase {
  return {
    ...existing,
    ...incoming,
    niiVolumeId: incoming.niiVolumeId ?? existing.niiVolumeId,
    niiFileName: incoming.niiFileName ?? existing.niiFileName,
    ctVolumeId: incoming.ctVolumeId ?? existing.ctVolumeId,
    ctFileName: incoming.ctFileName ?? existing.ctFileName,
    name: incoming.name && incoming.name !== incoming.visitId ? incoming.name : existing.name || incoming.name,
    gender: incoming.gender || existing.gender,
    age: incoming.age || existing.age,
    pathology: incoming.pathology || existing.pathology,
    gradeLabel: incoming.gradeLabel !== "未确定" ? incoming.gradeLabel : existing.gradeLabel,
    diagnosis: incoming.diagnosis !== "待明确" ? incoming.diagnosis : existing.diagnosis,
    pciScore: incoming.pciScore ?? existing.pciScore,
    labs: { ...existing.labs, ...incoming.labs },
    raw: { ...existing.raw, ...incoming.raw },
    importedAt: incoming.importedAt,
  };
}

function upsertCase(cases: FollowUpBatchCase[], incoming: FollowUpBatchCase): FollowUpBatchCase[] {
  const idx = cases.findIndex((c) => visitIdsEqual(c.visitId, incoming.visitId));
  if (idx < 0) return [...cases, incoming];
  const next = [...cases];
  next[idx] = mergeCase(cases[idx], incoming);
  return next;
}

async function parseClinicalRows(
  file: File,
): Promise<{ rows: ClinicalRow[]; sheetName: string }> {
  const { matrix, sheetName, headerRowIndex } = await readClinicalExcelFile(file);
  if (matrix.length < headerRowIndex + 2) return { rows: [], sheetName };

  const headers = matrix[headerRowIndex].map((h) => cellStr(h));
  const rows: ClinicalRow[] = [];

  for (let i = headerRowIndex + 1; i < matrix.length; i++) {
    const line = matrix[i];
    if (!line || line.every((c) => !cellStr(c))) continue;
    const raw: Record<string, string> = {};
    headers.forEach((h, idx) => {
      if (h) raw[h] = cellStr(line[idx]);
    });

    const visitId = resolveVisitId(raw, line);
    if (!visitId) continue;

    const pathology = raw.病理 || raw.pathology || "";
    const pciRaw = raw.PCI评分 || raw.PCI || raw.pci;
    const pciScore = pciRaw != null && pciRaw !== "" ? Number(pciRaw) : null;

    const labs: Record<string, string> = {};
    for (const [k, v] of Object.entries(raw)) {
      if (["就诊号", "ID", "姓名", "性别", "年龄", "病理", "PCI评分", "PCI", "病理分级"].includes(k)) continue;
      if (v) labs[k] = v;
    }
    if (labs["CA-199"]) labs["CA19-9"] = labs["CA-199"];

    rows.push({
      visitId,
      name: raw.姓名 || raw.name || visitId,
      gender: raw.性别 || "",
      age: parseAge(raw.年龄 || ""),
      pciScore: Number.isFinite(pciScore) ? pciScore : null,
      pathology,
      gradeLabel: resolvePathologyGrade(raw, pathology),
      diagnosis: inferDiagnosis(pathology),
      labs,
      raw,
    });
  }
  return { rows, sheetName };
}

async function extractNiiFromZip(
  zipFile: File,
  clinicalVisitIds: string[],
): Promise<{ name: string; data: ArrayBuffer; visitId: string | null }[]> {
  const zip = await JSZip.loadAsync(zipFile);
  const out: { name: string; data: ArrayBuffer; visitId: string | null }[] = [];
  for (const [path, entry] of Object.entries(zip.files)) {
    if (entry.dir) continue;
    const base = path.split("/").pop() || path;
    if (!isNiiFileName(base)) continue;
    const visitId =
      parseVisitIdFromNiiFileName(base) || findVisitIdInFileName(base, clinicalVisitIds);
    out.push({ name: base, data: await entry.async("arraybuffer"), visitId });
  }
  return out;
}

function findClinicalRow(rows: ClinicalRow[], roiVisitId: string) {
  return rows.find((r) => visitIdsEqual(r.visitId, roiVisitId));
}

function mergePatients(existing: PlatformPatient[], incoming: PlatformPatient[]): PlatformPatient[] {
  const map = new Map(existing.map((p) => [normalizeVisitId(p.id), p]));
  for (const p of incoming) {
    map.set(normalizeVisitId(p.id), p);
  }
  return Array.from(map.values());
}

function finalizeBatchStats(cases: FollowUpBatchCase[]): Pick<FollowUpBatchState, "matchedCount" | "unmatchedVisitIds" | "unmatchedNiiFiles"> {
  const unmatchedVisitIds = cases.filter((c) => !c.niiVolumeId).map((c) => c.visitId);
  return {
    matchedCount: cases.filter((c) => c.niiVolumeId).length,
    unmatchedVisitIds,
    unmatchedNiiFiles: [],
  };
}

export async function importFollowUpBatch(input: FollowUpBatchImportInput): Promise<FollowUpBatchImportResult> {
  const { zipFile, excelFile } = input;
  if (!zipFile && !excelFile) {
    throw new Error("请至少选择预勾画 ZIP 或临床 Excel 之一");
  }

  const warnings: string[] = [];
  const importedAt = new Date().toISOString();
  const existing = loadFollowUpBatch();
  let cases: FollowUpBatchCase[] = existing?.cases ?? [];

  let sheetName = "";
  let clinicalRows: ClinicalRow[] = [];

  if (excelFile) {
    const parsed = await parseClinicalRows(excelFile);
    clinicalRows = parsed.rows;
    sheetName = parsed.sheetName;
    if (!clinicalRows.length) {
      throw new Error("Excel 中未解析到有效病例（需含就诊号或 ID 列）");
    }
    warnings.push(`已从工作表「${sheetName}」读取 ${clinicalRows.length} 例`);
    for (const row of clinicalRows) {
      cases = upsertCase(cases, clinicalRowToCase(row, importedAt));
    }
  }

  const clinicalVisitIds = [
    ...clinicalRows.map((r) => r.visitId),
    ...cases.map((c) => c.visitId),
  ];

  const unmatchedNiiFiles: string[] = [];
  let ctLinkedCount = 0;

  if (zipFile) {
    const niiFiles = await extractNiiFromZip(zipFile, clinicalVisitIds);
    if (!niiFiles.length) {
      throw new Error("ZIP 中未找到 .nii / .nii.gz 预勾画文件");
    }

    const fingerprint = `${zipFile.name}-${zipFile.size}-${excelFile?.name ?? "no-excel"}-${excelFile?.size ?? 0}`;

    for (const nii of niiFiles) {
      if (!nii.visitId) {
        unmatchedNiiFiles.push(nii.name);
        continue;
      }

      const vol = parseNiiVolume(
        nii.name,
        nii.data,
        `followup-${fingerprint}-${nii.visitId}-${nii.name.replace(/\W+/g, "_")}`,
      );
      await cacheNiiVolume(vol);
      const role = resolveNiiRole(nii.name, vol);
      const visitId = padVisitId(nii.visitId);

      let target = cases.find((c) => visitIdsEqual(c.visitId, visitId));
      if (!target) {
        target = stubCaseFromVisitId(visitId, importedAt);
        cases = [...cases, target];
      }

      const patch: Partial<FollowUpBatchCase> = { importedAt };
      if (role === "roi") {
        patch.niiVolumeId = vol.id;
        patch.niiFileName = nii.name;
      } else {
        patch.ctVolumeId = vol.id;
        patch.ctFileName = nii.name;
        ctLinkedCount++;
      }

      cases = upsertCase(cases, { ...target, ...patch } as FollowUpBatchCase);
    }

    const clinicalOnly = excelFile && clinicalRows.length > 0;
    const matchedFromZip = niiFiles.filter((n) => n.visitId).length - unmatchedNiiFiles.length;
    if (!excelFile) {
      warnings.push(`已从 ZIP 解析 ${cases.length} 例（就诊号来自文件名）`);
      if (unmatchedNiiFiles.length) {
        warnings.push(
          `${unmatchedNiiFiles.length} 个 NIfTI 无法从文件名识别就诊号：${unmatchedNiiFiles.slice(0, 3).join("、")}${unmatchedNiiFiles.length > 3 ? "…" : ""}`,
        );
      }
    } else if (clinicalOnly) {
      const unmatchedVisitIds = cases.filter((c) => !c.niiVolumeId).map((c) => c.visitId);
      if (unmatchedNiiFiles.length) {
        warnings.push(
          `${unmatchedNiiFiles.length} 个 NIfTI 未匹配到 Excel 就诊号：${unmatchedNiiFiles.slice(0, 3).join("、")}${unmatchedNiiFiles.length > 3 ? "…" : ""}`,
        );
      }
      if (unmatchedVisitIds.length) {
        warnings.push(`${unmatchedVisitIds.length} 例临床记录未匹配到预勾画影像`);
      }
      if (matchedFromZip === 0 && niiFiles.length > 0) {
        warnings.push("未能完成任何就诊号与 ROI 的关联，请检查 Excel 就诊号与 roi_ 文件名前缀是否一致");
      }
    }
  } else {
    warnings.push("仅导入临床 Excel，预勾画影像可稍后单独上传 ZIP 补充");
  }

  if (ctLinkedCount > 0) {
    warnings.push(`${ctLinkedCount} 例已关联 CT 原图 NIfTI，预览将叠加显示`);
  }

  const stats = finalizeBatchStats(cases);
  const state: FollowUpBatchState = {
    excelFileName: excelFile?.name ?? existing?.excelFileName ?? null,
    zipFileName: zipFile?.name ?? existing?.zipFileName ?? null,
    importedAt,
    cases,
    ...stats,
    unmatchedNiiFiles,
  };
  saveFollowUpBatch(state);

  if (excelFile) {
    const excelBuf = await excelFile.arrayBuffer();
    const parsed = parseClinicalExcelBuffer(excelBuf, `随访批量 · ${excelFile.name}`);
    if (parsed.errors.length) {
      warnings.push(`临床数据集部分字段未按模板解析：${parsed.errors[0]}`);
    } else {
      const ds = parsed.dataset;
      if (ds.patientIdField && ds.patientIdField !== "就诊号") {
        ds.rows = ds.rows.map((row) => {
          const pid = row[ds.patientIdField];
          if (pid && !row.就诊号) return { ...row, 就诊号: pid };
          return row;
        });
      }
      saveClinicalDataset({ ...ds, id: RESEARCH_COHORT_DATASET_ID, name: `随访批量 · ${excelFile.name}` });
    }
  }

  const patients = batchCasesToPlatformPatients(cases);
  savePatients(mergePatients(loadPatients(), patients));

  return { ...state, warnings };
}

export function listFollowUpBatchImaging() {
  const batch = loadFollowUpBatch();
  return batch ? batchCasesToImagingRecords(batch.cases) : [];
}
