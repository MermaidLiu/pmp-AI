import type { PathologyImagingGradeResult } from "../api/platform";
import type { ClinicalWorkbookRow } from "./clinicalWorkbookImport";
import { applyWorkbookRowToWorkflow, getWorkbookRow, loadClinicalWorkbook } from "./clinicalWorkbookImport";
import { cacheNiiVolume, parseNiiVolume, type NiiVolume } from "./niiVolumeStore";
import type { ResolvedNiiFile } from "./resolveCaseUpload";
import { pendingCaseFilesFingerprint } from "./platformCaseUpload";

const NII_RESULT_KEY = "pmp_presegmented_nii_id";

export function getPresegmentedNiiVolumeId(): string | null {
  try {
    return sessionStorage.getItem(NII_RESULT_KEY);
  } catch {
    return null;
  }
}

export function setPresegmentedNiiVolumeId(id: string | null): void {
  try {
    if (id) sessionStorage.setItem(NII_RESULT_KEY, id);
    else sessionStorage.removeItem(NII_RESULT_KEY);
  } catch {
    /* ignore */
  }
}

function inferPatientIdFromNiiName(name: string): string | undefined {
  const stem = name.replace(/\.nii\.gz$/i, "").replace(/\.nii$/i, "").replace(/\.gz$/i, "");
  const id = stem.split(/[_\-.]/)[0]?.trim();
  return id || undefined;
}

export async function buildPresegmentedPathologyResult(
  niiFile: ResolvedNiiFile,
  fingerprint: string,
  patientId?: string,
): Promise<{ result: PathologyImagingGradeResult; volume: NiiVolume }> {
  const vol = parseNiiVolume(niiFile.name, niiFile.data, `nii-${fingerprint}-${niiFile.name}`);
  await cacheNiiVolume(vol);
  setPresegmentedNiiVolumeId(vol.id);

  const wb = loadClinicalWorkbook();
  const inferredId = patientId || inferPatientIdFromNiiName(niiFile.name);
  const row: ClinicalWorkbookRow | undefined =
    (inferredId ? getWorkbookRow(inferredId) : undefined) ||
    (wb?.selectedId ? getWorkbookRow(wb.selectedId) : undefined) ||
    wb?.rows[0];

  if (row && inferredId && row.id === inferredId) {
    applyWorkbookRowToWorkflow(row);
  }

  const pciScore = row?.pciScore ?? null;
  const grade = row?.gradeLabel || "未确定";
  const conclusion =
    row?.pathology?.slice(0, 280) ||
    `预勾画 NIfTI：${niiFile.name}（${vol.dims[0]}×${vol.dims[1]}×${vol.sliceCount}）`;

  const result: PathologyImagingGradeResult = {
    status: "ok",
    message: `已加载预勾画 NIfTI · 未调用 CT 接口 · ${niiFile.name}`,
    grade_label: grade,
    confidence: null,
    result_image_base64: "",
    dicom_count: 0,
    exam_id: row?.id || `NII-${Date.now()}`,
    saved: false,
    pci: pciScore != null
      ? {
          pci_score: pciScore,
          is_positive: pciScore >= 20 ? true : pciScore <= 10 ? false : null,
          conclusion,
          status: "ok",
        }
      : null,
    raw: {
      source: "presegmented_nii",
      nii_volume_id: vol.id,
      nii_name: niiFile.name,
      slice_count: vol.sliceCount,
      dims: vol.dims,
      patient_id: row?.id,
      fingerprint,
      conclusion,
    },
  };

  return { result, volume: vol };
}

export function isPresegmentedResult(result: PathologyImagingGradeResult | null | undefined): boolean {
  const raw = result?.raw as Record<string, unknown> | undefined;
  return raw?.source === "presegmented_nii";
}
