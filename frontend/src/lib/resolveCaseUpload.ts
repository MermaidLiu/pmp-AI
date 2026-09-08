import JSZip from "jszip";
import {
  isDicomFileName,
  isExcelFileName,
  isNiiFileName,
  isZipFileName,
} from "./caseFileClassifier";

export type ResolvedNiiFile = {
  name: string;
  data: ArrayBuffer;
};

export type ResolvedCaseUpload = {
  nativeFiles: File[];
  dicomFiles: File[];
  excelFiles: File[];
  niiFiles: ResolvedNiiFile[];
  hasPresegmentedNii: boolean;
  hasDicom: boolean;
};

let lastResolved: ResolvedCaseUpload | null = null;

export function getLastResolvedUpload(): ResolvedCaseUpload | null {
  return lastResolved;
}

async function extractZip(file: File): Promise<{ nii: ResolvedNiiFile[]; dicom: File[]; excel: File[] }> {
  const nii: ResolvedNiiFile[] = [];
  const dicom: File[] = [];
  const excel: File[] = [];
  const zip = await JSZip.loadAsync(file);
  const entries = Object.entries(zip.files);
  for (const [path, entry] of entries) {
    if (entry.dir) continue;
    const base = path.split("/").pop() || path;
    if (isNiiFileName(base)) {
      nii.push({ name: base, data: await entry.async("arraybuffer") });
    } else if (isDicomFileName(base)) {
      const blob = await entry.async("blob");
      dicom.push(new File([blob], base, { type: "application/dicom" }));
    } else if (isExcelFileName(base)) {
      const blob = await entry.async("blob");
      excel.push(new File([blob], base, { type: blob.type || "application/vnd.ms-excel" }));
    }
  }
  return { nii, dicom, excel };
}

export async function resolveCaseUpload(files: File[]): Promise<ResolvedCaseUpload> {
  const dicomFiles: File[] = [];
  const excelFiles: File[] = [];
  const niiFiles: ResolvedNiiFile[] = [];

  for (const file of files) {
    const name = file.name;
    if (isExcelFileName(name)) {
      excelFiles.push(file);
      continue;
    }
    if (isNiiFileName(name)) {
      niiFiles.push({ name, data: await file.arrayBuffer() });
      continue;
    }
    if (isZipFileName(name)) {
      const extracted = await extractZip(file);
      niiFiles.push(...extracted.nii);
      dicomFiles.push(...extracted.dicom);
      excelFiles.push(...extracted.excel);
      if (!extracted.nii.length && !extracted.dicom.length && !extracted.excel.length) {
        dicomFiles.push(file);
      }
      continue;
    }
    if (isDicomFileName(name)) {
      dicomFiles.push(file);
      continue;
    }
  }

  const result: ResolvedCaseUpload = {
    nativeFiles: files,
    dicomFiles,
    excelFiles,
    niiFiles,
    hasPresegmentedNii: niiFiles.length > 0,
    hasDicom: dicomFiles.length > 0,
  };
  lastResolved = result;
  return result;
}

export function shouldSkipCtApi(resolved: ResolvedCaseUpload | null): boolean {
  if (!resolved) return false;
  return resolved.hasPresegmentedNii && !resolved.hasDicom;
}
