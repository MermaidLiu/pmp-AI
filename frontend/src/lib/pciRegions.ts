import type { PciRegionScore, PciScoreResult } from "../api/platform";

/** 影像 rPCI 13 区 — Tops-Welten et al., European Radiology 2025 (Delphi, Table 1) */
export const RPCI_CITATION =
  "Tops-Welten M et al. Eur Radiol 2025;35:7856–7866 · doi:10.1007/s00330-025-11762-3";

export const PCI_REGION_DEFS: ReadonlyArray<{
  index: number;
  key: string;
  label: string;
  structures?: string;
}> = [
  { index: 0, key: "pci0Central", label: "0_横结肠与大网膜", structures: "Transverse colon; greater omentum" },
  { index: 1, key: "pci1RightUpper", label: "1_右肝叶与胆囊", structures: "Right liver; gallbladder; retrohepatic space" },
  { index: 2, key: "pci2Epigastrium", label: "2_左肝与胰头体", structures: "Left liver; pancreatic head/body; lesser omentum" },
  { index: 3, key: "pci3LeftUpper", label: "3_脾与胃胰尾", structures: "Spleen; stomach; pancreatic tail" },
  { index: 4, key: "pci4LeftFlank", label: "4_降结肠上段", structures: "Cranial descending colon" },
  { index: 5, key: "pci5LeftLower", label: "5_降结肠下段", structures: "Caudal descending colon" },
  { index: 6, key: "pci6Pelvis", label: "6_直肠乙状结肠与盆腔", structures: "Rectosigmoid; bladder; Douglas pouch" },
  { index: 7, key: "pci7RightLower", label: "7_升结肠下段", structures: "Caudal ascending colon (from Bauhin)" },
  { index: 8, key: "pci8RightFlank", label: "8_升结肠上段", structures: "Cranial ascending colon" },
  { index: 9, key: "pci9UpperJejunum", label: "9_小肠 rPCI Ⅰ", structures: "Small bowel seg. 1/4 (Treitz AP planes)" },
  { index: 10, key: "pci10LowerJejunum", label: "10_小肠 rPCI Ⅱ", structures: "Small bowel seg. 2/4" },
  { index: 11, key: "pci11UpperIleum", label: "11_小肠 rPCI Ⅲ", structures: "Small bowel seg. 3/4" },
  { index: 12, key: "pci12LowerIleum", label: "12_小肠 rPCI Ⅳ", structures: "Small bowel seg. 4/4" },
];

/** rPCI 理论满分 39（13×3）；若 CT/genpci 仍报 36 则沿用接口返回值 */
export const RPCI_MAX_SCORE = 39;

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

type SliceManifestRow = {
  index?: number;
  filename?: string;
  sc?: number | null;
  region?: number | null;
};

export function pciHasRenderableScores(pci: PciScoreResult | undefined): boolean {
  if (!pci) return false;
  if (pci.pci_score != null) return true;
  if (pci.slice_scores?.some((s) => s.sc != null)) return true;
  if (normalizePciRegions(pci).some((r) => r.score != null)) return true;
  return Boolean(pci.conclusion?.trim());
}

/** Prefer top-level pci; fall back to raw.pci or slice_manifest sc rows. */
export function resolvePciFromResult(result: {
  pci?: PciScoreResult | null;
  raw?: Record<string, unknown>;
}): PciScoreResult | undefined {
  const base = result.pci ?? (result.raw?.pci as PciScoreResult | undefined);
  if (base && pciHasRenderableScores(base)) return base;

  const raw = result.raw;
  const manifest = Array.isArray(raw?.slice_manifest) ? (raw.slice_manifest as SliceManifestRow[]) : [];
  const sliceScores = manifest
    .filter((row) => row.sc != null)
    .map((row) => ({
      index: Number(row.index ?? 0),
      filename: String(row.filename ?? ""),
      sc: row.sc ?? null,
      region: row.region ?? null,
    }));

  if (sliceScores.length) {
    const regionMax = new Map<number, number>();
    for (const row of sliceScores) {
      if (row.region == null || row.sc == null) continue;
      regionMax.set(row.region, Math.max(regionMax.get(row.region) ?? 0, row.sc));
    }
    const regions = PCI_REGION_DEFS.map((def) => ({
      index: def.index,
      key: def.key,
      label: def.label,
      score: regionMax.get(def.index) ?? null,
    }));
    const pciTotal =
      regionMax.size > 0
        ? [...regionMax.values()].reduce((a, b) => a + b, 0)
        : null;
    return {
      status: "ok",
      message: `已从 slice_manifest 读取 ${sliceScores.length} 层 sc 评分`,
      pci_score: pciTotal,
      is_positive: null,
      positive_rate: null,
      mesenteric_contracture: null,
      regions,
      slice_scores: sliceScores,
      raw: { source: "slice_manifest" },
    };
  }

  return base ?? undefined;
}
