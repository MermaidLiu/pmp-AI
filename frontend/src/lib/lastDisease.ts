import type { PetCtInterviewRecord } from "../api/client";

const KEY = "lingxi_last_viewed_disease";

export type LastDisease = {
  code: string;
  name: string;
  updatedAt: number;
};

export function rememberDiseaseFromRecord(rec: PetCtInterviewRecord): void {
  const code = rec.research_extensions?.primary_disease_code?.trim() || "";
  const name = rec.research_extensions?.primary_disease_name?.trim() || "";
  if (!code && !name) return;
  try {
    const payload: LastDisease = { code: code || "—", name: name || code || "—", updatedAt: Date.now() };
    localStorage.setItem(KEY, JSON.stringify(payload));
  } catch {
    /* ignore quota / private mode */
  }
}

export function readLastDisease(): LastDisease | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as LastDisease;
    if (typeof v?.code !== "string" || typeof v?.name !== "string") return null;
    return v;
  } catch {
    return null;
  }
}
