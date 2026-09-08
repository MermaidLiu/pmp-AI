export type LlmProviderId = "reachapi" | "deepseek";

export type LlmProviderInfo = {
  id: LlmProviderId;
  label: string;
  model: string;
  configured: boolean;
  base_url: string;
};

const STORAGE_KEY = "pmp_llm_provider";

export function loadLlmProvider(): LlmProviderId {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw === "deepseek" || raw === "reachapi") return raw;
  return "reachapi";
}

export function saveLlmProvider(id: LlmProviderId) {
  localStorage.setItem(STORAGE_KEY, id);
}

export function providerDisplayName(id?: string, model?: string) {
  const label = id === "deepseek" ? "DeepSeek" : "ReachAPI";
  return model ? `${label} · ${model}` : label;
}
