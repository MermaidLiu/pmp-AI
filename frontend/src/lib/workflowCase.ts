import type { PetCtInterviewRecord } from "../api/client";
import { demoRecord } from "../data/demoRecord";

const STORAGE_KEY = "pmp_workflow_case";

/** 病理分级场景默认病例（无发热待查、无 PET 预填，待 DICOM/临床输入） */
export function buildPathologyBaseCase(clinicalDiagnosis?: string): PetCtInterviewRecord {
  const dx = clinicalDiagnosis?.trim() || "腹膜假粘液瘤（PMP），待 DPAM/PMCA 分型与病理分级";
  return {
    ...demoRecord,
    patient_base_info: {
      ...demoRecord.patient_base_info,
      department: "妇科肿瘤科",
      exam_item: "病理+DICOM 多模态",
      exam_id: demoRecord.patient_base_info.exam_id || "CASE-DICOM-001",
    },
    interview_info: {
      ...demoRecord.interview_info,
      clinical_diagnosis: dx,
      brief_medical_history: "腹腔广泛粘液性种植，待病理确认 DPAM 或 PMCA 表型。",
      nodule_diagnosis: dx,
    },
    supplementary_interview_info: {
      ...demoRecord.supplementary_interview_info,
      examination_history: {
        ...demoRecord.supplementary_interview_info.examination_history,
        petct: false,
        pathology: true,
      },
    },
    research_extensions: {
      ...demoRecord.research_extensions,
      primary_disease_code: "PATH",
      primary_disease_name: dx,
      pet_ct_phenotype_tags: [],
      fuo_profile: {
        fever_duration: "",
        max_temperature_c: "",
        fever_pattern: "",
        antipyretic_response: "",
        infection_workup_summary: "",
        rheumatic_immunology_clues: "",
        steroid_or_immunosuppressor_exposure: "",
      },
      pet_ct_report_narrative: "",
      imaging_report_text: "",
      lesions: [],
      global_quant: { suv_max: null, suv_mean: null, mtv: null, tlg: null },
    },
  };
}

export function saveWorkflowCase(record: PetCtInterviewRecord): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(record));
}

export function saveClinicalDiagnosis(clinicalDiagnosis: string): void {
  saveClinicalFields({ clinicalDiagnosis });
}

export type ClinicalFieldInput = {
  clinicalDiagnosis?: string;
  briefMedicalHistory?: string;
  age?: number;
  gender?: string;
  department?: string;
  medicalRecordId?: string;
  patientName?: string;
  tnmStage?: string;
  treatmentMethod?: string;
  surgeryNumber?: string;
  ivChemotherapy?: string;
  ccScore?: string;
  /** 检验指标 → research_extensions.lab_snapshot */
  labSnapshot?: Record<string, string>;
};

function mergeLabSnapshot(
  base: PetCtInterviewRecord,
  labSnapshot?: Record<string, string>,
): Record<string, string> {
  const out = { ...(base.research_extensions?.lab_snapshot || {}) };
  if (!labSnapshot) return out;
  for (const [k, v] of Object.entries(labSnapshot)) {
    if (v != null && String(v).trim()) out[k] = String(v).trim();
  }
  return out;
}

/** 保存第 1 步临床数据 / 病历输入字段 */
export function saveClinicalFields(fields: ClinicalFieldInput): PetCtInterviewRecord {
  const base = getWorkflowCase();
  const updated: PetCtInterviewRecord = {
    ...base,
    patient_base_info: {
      ...base.patient_base_info,
      ...(fields.patientName !== undefined ? { name: fields.patientName } : {}),
      ...(fields.age !== undefined ? { age: fields.age } : {}),
      ...(fields.gender !== undefined ? { gender: fields.gender } : {}),
      ...(fields.department !== undefined ? { department: fields.department } : {}),
      ...(fields.medicalRecordId !== undefined ? { medical_record_id: fields.medicalRecordId } : {}),
    },
    interview_info: {
      ...base.interview_info,
      ...(fields.clinicalDiagnosis !== undefined
        ? {
            clinical_diagnosis: fields.clinicalDiagnosis,
            nodule_diagnosis: fields.clinicalDiagnosis,
          }
        : {}),
      ...(fields.briefMedicalHistory !== undefined
        ? { brief_medical_history: fields.briefMedicalHistory }
        : {}),
    },
    research_extensions: {
      ...base.research_extensions,
      ...(fields.clinicalDiagnosis !== undefined
        ? { primary_disease_name: fields.clinicalDiagnosis }
        : {}),
      ...(fields.medicalRecordId !== undefined
        ? { patient_internal_id: fields.medicalRecordId || base.research_extensions?.patient_internal_id }
        : {}),
      lab_snapshot: mergeLabSnapshot(
        base,
        {
          ...(fields.labSnapshot || {}),
          ...(fields.tnmStage?.trim() ? { TNM分期: fields.tnmStage.trim() } : {}),
          ...(fields.treatmentMethod?.trim() ? { 治疗方式: fields.treatmentMethod.trim() } : {}),
          ...(fields.surgeryNumber?.trim() ? { 第几次手术: fields.surgeryNumber.trim() } : {}),
          ...(fields.ivChemotherapy?.trim() ? { 是否静脉化疗: fields.ivChemotherapy.trim() } : {}),
          ...(fields.ccScore?.trim() ? { CC评分: fields.ccScore.trim() } : {}),
        },
      ),
    },
  };
  saveWorkflowCase(updated);
  return updated;
}

/** 将第 1 步解析成功的 DICOM/JSON 病例与临床诊断合并 */
export function mergeIngestedCase(parsed: Record<string, unknown>, clinicalDiagnosis: string): PetCtInterviewRecord {
  const base = getWorkflowCase();
  const pbi = (parsed.patient_base_info as Record<string, unknown>) || {};
  const iv = (parsed.interview_info as Record<string, unknown>) || {};
  const rx = (parsed.research_extensions as Record<string, unknown>) || {};

  const hasPet =
    Boolean(rx.pet_ct_report_narrative) ||
    Boolean(rx.imaging_report_text) ||
    (parsed.patient_base_info as { exam_item?: string })?.exam_item?.includes?.("PET");

  const merged: PetCtInterviewRecord = {
    ...base,
    patient_base_info: { ...base.patient_base_info, ...(pbi as PetCtInterviewRecord["patient_base_info"]) },
    interview_info: {
      ...base.interview_info,
      ...(iv as PetCtInterviewRecord["interview_info"]),
      clinical_diagnosis: clinicalDiagnosis || (iv.clinical_diagnosis as string) || base.interview_info.clinical_diagnosis,
      brief_medical_history:
        base.interview_info.brief_medical_history ||
        (iv.brief_medical_history as string) ||
        "",
    },
    research_extensions: {
      ...base.research_extensions,
      ...(rx as PetCtInterviewRecord["research_extensions"]),
      primary_disease_name: clinicalDiagnosis || base.research_extensions?.primary_disease_name,
      // 无 PET 数据时清空代谢字段，避免误显示 SUV
      ...(hasPet
        ? {}
        : {
            pet_ct_report_narrative: "",
            imaging_report_text: "",
            lesions: [],
            global_quant: { suv_max: null, suv_mean: null, mtv: null, tlg: null },
            pet_ct_phenotype_tags: base.research_extensions?.pet_ct_phenotype_tags || [],
          }),
    },
  };
  saveWorkflowCase(merged);
  return merged;
}

export function getWorkflowCase(): PetCtInterviewRecord {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as PetCtInterviewRecord;
      // 丢弃旧版发热待查/PET 演示缓存，避免误显示
      const code = parsed.research_extensions?.primary_disease_code;
      const dx = parsed.interview_info?.clinical_diagnosis || "";
      if (code === "FUO" || dx.includes("发热待查")) {
        return buildPathologyBaseCase(dx.replace(/发热待查.*/, "卵巢肿物，待病理学分级明确"));
      }
      return parsed;
    }
  } catch {
    /* ignore */
  }
  return buildPathologyBaseCase();
}
