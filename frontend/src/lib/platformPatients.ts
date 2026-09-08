import { MOCK_PATIENTS, type PlatformPatient } from "../data/platformMock";

const STORAGE_KEY = "pmp_platform_patients";

export const PLATFORM_PATIENTS_UPDATED_EVENT = "pmp-platform-patients-updated";

export function loadPatients(): PlatformPatient[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as PlatformPatient[];
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch {
    /* ignore */
  }
  return [...MOCK_PATIENTS];
}

export function savePatients(patients: PlatformPatient[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(patients));
  window.dispatchEvent(new CustomEvent(PLATFORM_PATIENTS_UPDATED_EVENT));
}

export function createEmptyPatient(): PlatformPatient {
  const n = Date.now().toString().slice(-6);
  return {
    id: `PMP000${n}`,
    name: "新患者",
    gender: "男",
    age: 0,
    diagnosis: "待诊断",
    stage: "—",
    gene: "—",
    enrolledAt: new Date().toISOString().slice(0, 10),
    department: "",
    physician: "",
    smoking: "",
    ecog: "",
    chiefComplaint: "",
    pastHistory: "",
    familyHistory: "",
    admissionId: "",
    admissionTime: "",
  };
}
