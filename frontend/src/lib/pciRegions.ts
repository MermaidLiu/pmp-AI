import type { PciRegionScore, PciScoreResult } from "../api/platform";

/** 与 genpci / 参考平台一致的 13 区 PCI 定义（按 index 0–12） */
export const PCI_REGION_DEFS: ReadonlyArray<{ index: number; key: string; label: string }> = [
  { index: 0, key: "pci0Central", label: "0_中央区域" },
  { index: 1, key: "pci1RightUpper", label: "1_右上区域" },
  { index: 2, key: "pci2Epigastrium", label: "2_上腹部区域" },
  { index: 3, key: "pci3LeftUpper", label: "3_左上区域" },
  { index: 4, key: "pci4LeftFlank", label: "4_左侧腹部区域" },
  { index: 5, key: "pci5LeftLower", label: "5_左下区域" },
  { index: 6, key: "pci6Pelvis", label: "6_盆腔区域" },
  { index: 7, key: "pci7RightLower", label: "7_右下区域" },
  { index: 8, key: "pci8RightFlank", label: "8_右侧腹部区域" },
  { index: 9, key: "pci9UpperJejunum", label: "9_空肠上部区域" },
  { index: 10, key: "pci10LowerJejunum", label: "10_空肠下部区域" },
  { index: 11, key: "pci11UpperIleum", label: "11_回肠上部区域" },
  { index: 12, key: "pci12LowerIleum", label: "12_回肠下部区域" },
];

/** 历史 / 旧版 genpci 字段别名 → 区 index */
const LEGACY_KEY_TO_INDEX: Record<string, number> = {
  pci0central: 0,
  pci1rightupper: 1,
  pci2epigastrium: 2,
  pci3leftupper: 3,
  pci4rightlower: 4,
  pci4leftflank: 4,
  pci5rightflank: 5,
  pci5leftlower: 5,
  pci6rightlowerabdomen: 6,
  pci6pelvis: 6,
  pci7lowerabdomen: 7,
  pci7rightlower: 7,
  pci8leftlowerabdomen: 8,
  pci8rightflank: 8,
  pci9leftflank: 9,
  pci9upperjejunum: 9,
  pci10leftupperabdomen: 10,
  pci10lowerjejunum: 10,
  pci11jejunum: 11,
  pci11upperileum: 11,
  pci12lowerileum: 12,
};

export type NormalizedPciRegion = PciRegionScore & { index: number };

export function pciRegionScoreTone(score: number | null | undefined): "zero" | "low" | "mid" | "high" | "empty" {
  if (score == null) return "empty";
  if (score <= 0) return "zero";
  if (score === 1) return "low";
  if (score === 2) return "mid";
  return "high";
}

export function normalizePciRegions(pci: PciScoreResult): NormalizedPciRegion[] {
  const byIndex = new Map<number, number | null>();

  for (const r of pci.regions ?? []) {
    const def = PCI_REGION_DEFS.find((d) => d.key === r.key);
    const idx =
      def?.index ??
      LEGACY_KEY_TO_INDEX[r.key.toLowerCase()] ??
      (() => {
        const m = /^pci(\d+)/i.exec(r.key);
        return m ? Number(m[1]) : undefined;
      })();
    if (idx != null && idx >= 0 && idx <= 12) {
      byIndex.set(idx, r.score ?? null);
    }
  }

  const raw = pci.raw ?? {};
  for (const def of PCI_REGION_DEFS) {
    if (byIndex.has(def.index)) continue;
    const val = raw[def.key];
    if (val !== undefined && val !== null && val !== "") {
      byIndex.set(def.index, Number(val));
    }
  }

  return PCI_REGION_DEFS.map((def) => ({
    index: def.index,
    key: def.key,
    label: def.label,
    score: byIndex.get(def.index) ?? null,
  }));
}

export function sumPciRegions(regions: NormalizedPciRegion[]): number | null {
  if (!regions.some((r) => r.score != null)) return null;
  return regions.reduce((sum, r) => sum + (r.score ?? 0), 0);
}

export function buildPciConclusion(pci: PciScoreResult): string {
  if (pci.conclusion?.trim()) return pci.conclusion.trim();

  const raw = pci.raw ?? {};
  for (const k of ["conclusion", "report", "summary", "diagnosis", "pathologyReport"]) {
    const v = raw[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }

  const parts: string[] = [];
  if (pci.is_positive != null) {
    const rate =
      pci.positive_rate != null
        ? pci.positive_rate <= 1
          ? pci.positive_rate.toFixed(1)
          : `${pci.positive_rate.toFixed(1)}%`
        : "—";
    parts.push(`检测结果为：${pci.is_positive ? "阳性" : "阴性"}（阳性概率为 ${rate}）。`);
  }

  const grade =
    (typeof raw.pathologyGrade === "string" && raw.pathologyGrade) ||
    (typeof raw.grade_label === "string" && raw.grade_label) ||
    (typeof raw.gradeLabel === "string" && raw.gradeLabel) ||
    "";
  if (grade) {
    parts.push(`病理分级为 ${grade}。`);
  }

  if (pci.mesenteric_contracture) {
    parts.push("存在肠系膜挛缩现象。");
  } else if (pci.mesenteric_contracture === 0) {
    parts.push("未见明显肠系膜挛缩。");
  }

  if (parts.length) return parts.join("");
  return pci.message || "";
}
