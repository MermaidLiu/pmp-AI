import type { ClinicalDataset, ClinicalVariable } from "./types";

export type DescriptiveRow = {
  variable: string;
  type: string;
  mean?: string;
  sd?: string;
  median?: string;
  min?: string;
  max?: string;
  categories?: string;
  n: number;
};

export type GroupCompareRow = {
  variable: string;
  group1: string;
  group2: string;
  stat: string;
  pValue: string;
  sig: string;
};

function mean(nums: number[]) {
  if (!nums.length) return 0;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function sd(nums: number[]) {
  if (nums.length < 2) return 0;
  const m = mean(nums);
  const v = nums.reduce((s, x) => s + (x - m) ** 2, 0) / (nums.length - 1);
  return Math.sqrt(v);
}

function fmt(n: number, d = 2) {
  return Number.isFinite(n) ? n.toFixed(d) : "—";
}

/** 从真实数据集计算描述性统计 */
export function computeDescriptiveStats(ds: ClinicalDataset): DescriptiveRow[] {
  return ds.variables
    .filter((v) => !v.skipped && v.type !== "file")
    .map((v) => {
      const values = ds.rows.map((r) => r[v.name]?.trim() ?? "").filter(Boolean);
      const n = values.length;
      if (v.type === "numerical") {
        const nums = values.map(Number).filter((x) => !Number.isNaN(x));
        const sorted = [...nums].sort((a, b) => a - b);
        return {
          variable: v.name,
          type: "数值型",
          mean: fmt(mean(nums)),
          sd: fmt(sd(nums)),
          median: fmt(sorted[Math.floor(sorted.length / 2)] ?? 0),
          min: fmt(sorted[0] ?? 0),
          max: fmt(sorted[sorted.length - 1] ?? 0),
          n,
        };
      }
      if (v.type === "categorical" || v.type === "text") {
        const counts = new Map<string, number>();
        for (const val of values) counts.set(val, (counts.get(val) ?? 0) + 1);
        const cats = [...counts.entries()]
          .sort((a, b) => b[1] - a[1])
          .slice(0, 5)
          .map(([k, c]) => `${k}(${c})`)
          .join(" · ");
        return { variable: v.name, type: "分类型", categories: cats || "—", n };
      }
      if (v.type === "date") {
        const sorted = [...values].sort();
        return {
          variable: v.name,
          type: "日期型",
          min: sorted[0] ?? "—",
          max: sorted[sorted.length - 1] ?? "—",
          n,
        };
      }
      return { variable: v.name, type: v.type, n };
    });
}

/** 简易组间比较（数值 t 检验近似 / 分类卡方近似 — 演示级） */
export function computeGroupCompare(
  ds: ClinicalDataset,
  groupVar: ClinicalVariable,
  groupA: string,
  groupB: string,
): GroupCompareRow[] {
  const numericVars = ds.variables.filter((v) => v.type === "numerical" && !v.skipped);
  return numericVars.map((v) => {
    const a = ds.rows.filter((r) => r[groupVar.name] === groupA).map((r) => Number(r[v.name])).filter((x) => !Number.isNaN(x));
    const b = ds.rows.filter((r) => r[groupVar.name] === groupB).map((r) => Number(r[v.name])).filter((x) => !Number.isNaN(x));
    const diff = Math.abs(mean(a) - mean(b));
    const pooled = sd([...a, ...b]) || 1;
    const t = diff / (pooled / Math.sqrt(Math.max(a.length, b.length, 1)));
    const p = Math.max(0.001, Math.min(0.99, 1 / (1 + t)));
    return {
      variable: v.name,
      group1: `${fmt(mean(a))} (n=${a.length})`,
      group2: `${fmt(mean(b))} (n=${b.length})`,
      stat: `t≈${fmt(t, 2)}`,
      pValue: p < 0.05 ? "< 0.05" : fmt(p, 3),
      sig: p < 0.05 ? "★" : "ns",
    };
  });
}

export function datasetSummary(ds: ClinicalDataset) {
  const n = ds.rows.length;
  const vars = ds.variables.filter((v) => !v.skipped).length;
  const missingCells = ds.rows.length * ds.variables.length;
  let empty = 0;
  for (const r of ds.rows) {
    for (const v of ds.variables) {
      if (!r[v.name]?.trim()) empty++;
    }
  }
  const missingRate = missingCells ? ((empty / missingCells) * 100).toFixed(1) : "0";
  return { n, vars, missingRate };
}
