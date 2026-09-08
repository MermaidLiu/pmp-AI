import type { ModuleAnalysisResult } from "../data/researchWorkbenchMock";

const KEY = "pmp_research_module_results";

type Store = {
  clinical?: ModuleAnalysisResult;
  imaging?: ModuleAnalysisResult;
  multimodal?: ModuleAnalysisResult;
};

export function loadModuleResults(): Store {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Store) : {};
  } catch {
    return {};
  }
}

export function saveModuleResult(result: ModuleAnalysisResult) {
  const store = loadModuleResults();
  store[result.module] = result;
  localStorage.setItem(KEY, JSON.stringify(store));
}

export function hasLinkedResults(): boolean {
  const s = loadModuleResults();
  return Boolean(s.clinical && s.imaging);
}
