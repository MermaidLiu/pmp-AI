import type { PlatformPatient } from "../api/platform";

const KEY = "pmp_platform_batch_patients";

export type BatchOperationIntent = "radiomics" | "clinical";

export type BatchPatientRef = {
  id: string;
  name: string;
  examId?: string;
  gradeLabel?: string;
  hasAnnotatedImage?: boolean;
  diagnosis?: string;
  pciScore?: number | null;
  niiVolumeId?: string;
  ctVolumeId?: string;
};

export type BatchSelection = {
  patients: BatchPatientRef[];
  intent: BatchOperationIntent;
  selectedAt: string;
};

function slimPatient(p: PlatformPatient): BatchPatientRef {
  return {
    id: p.id,
    name: p.name,
    examId: p.examId,
    gradeLabel: p.gradeLabel,
    hasAnnotatedImage: p.hasAnnotatedImage,
    diagnosis: p.diagnosis,
    pciScore: p.pciScore,
  };
}

export function saveBatchSelection(patients: PlatformPatient[], intent: BatchOperationIntent): BatchSelection {
  const payload: BatchSelection = {
    patients: patients.map(slimPatient),
    intent,
    selectedAt: new Date().toISOString(),
  };
  try {
    sessionStorage.setItem(KEY, JSON.stringify(payload));
  } catch {
    /* sessionStorage unavailable */
  }
  return payload;
}

export function loadBatchSelection(): BatchSelection | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    return JSON.parse(raw) as BatchSelection;
  } catch {
    return null;
  }
}

export function consumeBatchSelection(intent?: BatchOperationIntent): BatchSelection | null {
  const batch = loadBatchSelection();
  if (!batch) return null;
  if (intent && batch.intent !== intent) return null;
  return batch;
}
