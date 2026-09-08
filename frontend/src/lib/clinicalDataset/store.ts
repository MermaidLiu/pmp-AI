import type { ClinicalDataset, ClinicalVariable, VariableType } from "./types";

const STORAGE_KEY = "pmp_clinical_datasets_v1";

function loadAll(): ClinicalDataset[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as ClinicalDataset[];
  } catch {
    return [];
  }
}

function saveAll(list: ClinicalDataset[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
}

export function listClinicalDatasets(): ClinicalDataset[] {
  return loadAll().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function getClinicalDataset(id: string): ClinicalDataset | undefined {
  return loadAll().find((d) => d.id === id);
}

export function saveClinicalDataset(
  partial: Omit<ClinicalDataset, "id" | "createdAt" | "updatedAt"> & { id?: string },
): ClinicalDataset {
  const now = new Date().toISOString();
  const list = loadAll();
  if (partial.id) {
    const idx = list.findIndex((d) => d.id === partial.id);
    if (idx >= 0) {
      const updated: ClinicalDataset = {
        ...list[idx],
        ...partial,
        id: partial.id,
        updatedAt: now,
      };
      list[idx] = updated;
      saveAll(list);
      return updated;
    }
  }
  const created: ClinicalDataset = {
    ...partial,
    id: partial.id ?? `ds_${Date.now()}`,
    createdAt: now,
    updatedAt: now,
  };
  list.unshift(created);
  saveAll(list);
  return created;
}

export function deleteClinicalDataset(id: string) {
  saveAll(loadAll().filter((d) => d.id !== id));
}

export function updateVariableType(datasetId: string, variableId: string, type: VariableType): ClinicalDataset | undefined {
  const ds = getClinicalDataset(datasetId);
  if (!ds) return undefined;
  const variables = ds.variables.map((v) =>
    v.id === variableId ? { ...v, type, typeOverridden: true } : v,
  );
  return saveClinicalDataset({ ...ds, variables });
}

export function updateVariable(datasetId: string, variable: ClinicalVariable): ClinicalDataset | undefined {
  const ds = getClinicalDataset(datasetId);
  if (!ds) return undefined;
  const variables = ds.variables.map((v) => (v.id === variable.id ? variable : v));
  return saveClinicalDataset({ ...ds, variables });
}

export function deleteVariable(datasetId: string, variableId: string): ClinicalDataset | undefined {
  const ds = getClinicalDataset(datasetId);
  if (!ds) return undefined;
  const v = ds.variables.find((x) => x.id === variableId);
  if (!v) return ds;
  const variables = ds.variables.filter((x) => x.id !== variableId);
  const rows = ds.rows.map((r) => {
    const next = { ...r };
    delete next[v.name];
    return next;
  });
  return saveClinicalDataset({ ...ds, variables, rows });
}
