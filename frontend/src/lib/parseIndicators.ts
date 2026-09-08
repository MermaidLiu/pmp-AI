/** 解析「指标名: 值」多行文本为键值对。 */
export function parseIndicators(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const sep = trimmed.includes(":") ? ":" : trimmed.includes("：") ? "：" : null;
    if (sep) {
      const [k, ...rest] = trimmed.split(sep);
      out[k.trim()] = rest.join(sep).trim();
    }
  }
  return out;
}
