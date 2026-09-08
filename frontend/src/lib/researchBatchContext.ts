import type { PlatformPatient } from "../api/platform";
import {
  loadFollowUpBatch,
  type FollowUpBatchCase,
} from "./followUpBatchStore";
import type { BatchOperationIntent, BatchPatientRef } from "./platformBatchSelection";
import { saveBatchSelection } from "./platformBatchSelection";
import {
  buildClinicalDatasetFromTemplateRows,
  getBridgeTemplateRow,
  isTemplateRowUsable,
  mapFollowUpCaseToTemplateRow,
  mapWorkflowRecordToTemplateRow,
  rawLooksLikeClinicalTemplate,
  type ClinicalTemplateRow,
} from "./clinicalDataset/template";
import { RESEARCH_COHORT_DATASET_ID } from "./clinicalDataset/patientCohortDataset";
import { saveClinicalDataset } from "./clinicalDataset/store";
import { getWorkflowCase } from "./workflowCase";

const CONTEXT_KEY = "pmp_research_batch_context";

export type ResearchBatchSource = "follow_up_batch" | "research_upload" | "patient_db";

/** 临床数据来源：工作台映射 / 模板 Excel / 尚未具备 */
export type ResearchClinicalSource = "workflow_mapped" | "excel_upload" | "none";

export type ResearchBatchContext = {
  source: ResearchBatchSource;
  activatedAt: string;
  clinical: BatchPatientRef[];
  imaging: BatchPatientRef[];
  label: string;
  clinicalSource?: ResearchClinicalSource;
};

function slimFromPatient(p: PlatformPatient): BatchPatientRef {
  return {
    id: p.id,
    name: p.name,
    examId: p.examId || p.admissionId || p.id,
    gradeLabel: p.gradeLabel,
    hasAnnotatedImage: p.hasAnnotatedImage,
    diagnosis: p.diagnosis,
    pciScore: p.pciScore,
  };
}

function slimFromFollowUpCase(c: FollowUpBatchCase): BatchPatientRef {
  return {
    id: c.visitId,
    name: c.name,
    examId: c.visitId,
    gradeLabel: c.gradeLabel,
    hasAnnotatedImage: Boolean(c.niiVolumeId),
    diagnosis: c.diagnosis,
    pciScore: c.pciScore,
    niiVolumeId: c.niiVolumeId ?? undefined,
    ctVolumeId: c.ctVolumeId ?? undefined,
  };
}

export function saveResearchBatchContext(ctx: ResearchBatchContext): void {
  try {
    sessionStorage.setItem(CONTEXT_KEY, JSON.stringify(ctx));
  } catch {
    /* ignore */
  }
}

export function loadResearchBatchContext(): ResearchBatchContext | null {
  try {
    const raw = sessionStorage.getItem(CONTEXT_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as ResearchBatchContext;
  } catch {
    return null;
  }
}

export function getResearchBatchPatients(module: "clinical" | "imaging"): BatchPatientRef[] {
  const ctx = loadResearchBatchContext();
  if (!ctx) return [];
  return module === "imaging" ? ctx.imaging : ctx.clinical;
}

export function hasResearchClinicalReady(ctx?: ResearchBatchContext | null): boolean {
  const c = ctx ?? loadResearchBatchContext();
  if (!c?.clinical.length) return false;
  return c.clinicalSource === "workflow_mapped" || c.clinicalSource === "excel_upload";
}

/**
 * 将勾选随访病例映射为模板临床行并写入科研临床数据集。
 * 优先：工作台 bridge → 当前 workflow case → 批量 raw（模板 Excel）
 */
export function materializeClinicalFromSelection(selected: FollowUpBatchCase[]): {
  rows: ClinicalTemplateRow[];
  clinicalSource: ResearchClinicalSource;
} {
  const wf = getWorkflowCase();
  const wfRow = mapWorkflowRecordToTemplateRow(wf);
  const wfUsable = isTemplateRowUsable(wfRow);
  const rows: ClinicalTemplateRow[] = [];
  let fromWorkflow = 0;
  let fromExcel = 0;

  for (const c of selected) {
    const bridged = getBridgeTemplateRow(c.visitId) || getBridgeTemplateRow(c.name);
    if (bridged && isTemplateRowUsable(bridged)) {
      rows.push({ ...bridged, 患者ID: bridged.患者ID || c.visitId });
      fromWorkflow += 1;
      continue;
    }
    if (rawLooksLikeClinicalTemplate(c.raw)) {
      rows.push(mapFollowUpCaseToTemplateRow(c));
      fromExcel += 1;
      continue;
    }
    // 单例工作台入队：整批勾选时若 visitId 对得上当前 exam_id，用工作台行
    const examId = wf.patient_base_info.exam_id || "";
    const medId = wf.patient_base_info.medical_record_id || "";
    if (
      wfUsable &&
      (c.visitId === examId ||
        c.visitId === medId ||
        selected.length === 1 ||
        (selected.length > 0 && fromWorkflow + fromExcel === 0 && selected.indexOf(c) === 0))
    ) {
      rows.push({ ...wfRow, 患者ID: wfRow.患者ID || c.visitId });
      fromWorkflow += 1;
      continue;
    }
    // 兜底：仍输出一行（仅 ID），后续科研页会要求补传 Excel
    rows.push(mapFollowUpCaseToTemplateRow(c));
  }

  let clinicalSource: ResearchClinicalSource = "none";
  if (fromWorkflow > 0 && fromExcel === 0) clinicalSource = "workflow_mapped";
  else if (fromExcel > 0) clinicalSource = "excel_upload";
  else if (rows.some(isTemplateRowUsable)) clinicalSource = fromWorkflow ? "workflow_mapped" : "excel_upload";
  else clinicalSource = "none";

  if (rows.length && clinicalSource !== "none") {
    const label =
      clinicalSource === "workflow_mapped"
        ? `工作台临床映射 · ${rows.length} 例`
        : `临床 Excel 模板 · ${rows.length} 例`;
    saveClinicalDataset({
      ...buildClinicalDatasetFromTemplateRows(rows, label),
      id: RESEARCH_COHORT_DATASET_ID,
    });
  }

  return { rows, clinicalSource };
}

export function activateResearchFromFollowUpBatch(
  source: Extract<ResearchBatchSource, "follow_up_batch" | "research_upload">,
  selectedVisitIds?: string[],
): ResearchBatchContext | null {
  const batch = loadFollowUpBatch();
  if (!batch?.cases.length) return null;

  const selected =
    selectedVisitIds && selectedVisitIds.length
      ? batch.cases.filter((c) => selectedVisitIds.includes(c.visitId))
      : batch.cases;
  if (!selected.length) return null;

  const { clinicalSource } = materializeClinicalFromSelection(selected);

  const clinical = selected.map(slimFromFollowUpCase);
  const imaging = selected.filter((c) => c.niiVolumeId).map(slimFromFollowUpCase);
  const labelParts = [
    batch.excelFileName ? batch.excelFileName : null,
    batch.zipFileName ? batch.zipFileName : null,
  ].filter(Boolean);
  const sourceHint =
    clinicalSource === "workflow_mapped"
      ? "工作台映射"
      : clinicalSource === "excel_upload"
        ? "临床Excel"
        : "待补临床Excel";
  const label = `随访队列 · ${sourceHint}（已选 ${selected.length}/${batch.cases.length} · 影像 ${imaging.length}）`;

  const ctx: ResearchBatchContext = {
    source,
    activatedAt: new Date().toISOString(),
    clinical,
    imaging,
    label,
    clinicalSource,
  };
  saveResearchBatchContext(ctx);
  return ctx;
}

export function markResearchClinicalFromExcelUpload(): void {
  const ctx = loadResearchBatchContext();
  if (!ctx) return;
  saveResearchBatchContext({ ...ctx, clinicalSource: "excel_upload" });
}

export function activateResearchFromPatients(
  patients: PlatformPatient[],
  source: Extract<ResearchBatchSource, "patient_db">,
  intent: BatchOperationIntent,
): ResearchBatchContext {
  const clinical = patients.map(slimFromPatient);
  const imaging = patients.filter((p) => p.hasAnnotatedImage).map(slimFromPatient);
  const ctx: ResearchBatchContext = {
    source,
    activatedAt: new Date().toISOString(),
    clinical,
    imaging,
    label: `患者库多选 · ${patients.length} 例`,
    clinicalSource: "none", // 患者库多选仍需模板 Excel 或后续补传
  };
  saveResearchBatchContext(ctx);
  saveBatchSelection(patients, intent);
  return ctx;
}
