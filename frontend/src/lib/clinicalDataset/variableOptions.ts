import type { ClinicalDataset } from "./types";

/** 下拉选项：直接使用 Excel 表头名，不做数值/分类分组。 */
export function excelHeaderOptions(dataset: ClinicalDataset) {
  return dataset.variables
    .filter((v) => !v.skipped && v.type !== "file")
    .map((v) => ({ value: v.name, label: v.name }));
}
