import type { PathologyImagingGradeResult, PlatformDiagnosis } from "../api/platform";
import { getPendingCaseFileNames, getPendingCaseFiles, hasPendingCaseFiles } from "./platformCaseUpload";
import { getPathologyImagingOrNull, loadPlatformSession } from "./platformSession";

export type WorkflowContext = {
  uploadedFileNames: string[];
  pendingFileNames: string[];
  pendingFileCount: number;
  pathology: PathologyImagingGradeResult | null;
  diagnosis: PlatformDiagnosis | null;
  fusionSummary: string;
  examId: string | null;
  hasCaseFiles: boolean;
  hasPathologyResult: boolean;
};

export function getWorkflowContext(): WorkflowContext {
  const session = loadPlatformSession();
  const pathology = getPathologyImagingOrNull();
  const pendingFileNames = getPendingCaseFileNames();
  const uploadedFileNames =
    pendingFileNames.length > 0 ? pendingFileNames : session.uploadedFileNames;

  return {
    uploadedFileNames,
    pendingFileNames,
    pendingFileCount: pendingFileNames.length,
    pathology,
    diagnosis: session.diagnosis,
    fusionSummary: session.fusionSummary,
    examId: session.savedExamId || pathology?.exam_id || null,
    hasCaseFiles: hasPendingCaseFiles() || session.uploadedFileNames.length > 0,
    hasPathologyResult: Boolean(pathology && pathology.status === "ok"),
  };
}

export function buildResearchWorkflowPayload(ctx: WorkflowContext) {
  return {
    exam_id: ctx.examId || "",
    uploaded_file_names: ctx.uploadedFileNames,
    pending_file_count: ctx.pendingFileCount,
    pathology_grade: ctx.pathology?.grade_label || "",
    pathology_confidence: ctx.pathology?.confidence ?? null,
    pathology_message: ctx.pathology?.message || "",
    dicom_count: ctx.pathology?.dicom_count ?? 0,
    diagnosis_title: ctx.diagnosis?.title || "",
    diagnosis_confidence: ctx.diagnosis?.confidence ?? null,
    fusion_summary: ctx.fusionSummary || "",
  };
}
