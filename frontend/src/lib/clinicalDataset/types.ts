/** 临床数据集 · 类型定义（对标深睿 Excel 导入规范） */

export type ColumnCategory = "patient_id" | "patient_info" | "imaging_file" | "pathology_file" | "waveform_file" | "unknown";

export type VariableType = "text" | "numerical" | "categorical" | "date" | "file";

export type FileLinkKey = "患者ID" | "检查号" | "文件名";

export type PurchasedModules = {
  imaging: boolean;
  pathology: boolean;
  waveform: boolean;
};

export type ClinicalVariable = {
  id: string;
  name: string;
  /** Excel 第一行类别 */
  category: ColumnCategory;
  categoryLabel: string;
  type: VariableType;
  /** 文件列：{} 内关联键 */
  fileLinkKey?: FileLinkKey;
  /** 是否因未购买模块而被跳过解析 */
  skipped?: boolean;
  fillRate: number;
  /** 用户手动覆盖类型 */
  typeOverridden?: boolean;
};

export type ClinicalRecord = Record<string, string>;

export type ClinicalDataset = {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  variables: ClinicalVariable[];
  rows: ClinicalRecord[];
  patientIdField: string;
  /** 已用于文件关联的键（仅首列生效） */
  usedFileLinkKeys: string[];
};

export type ParseExcelOptions = {
  purchasedModules?: PurchasedModules;
};

export type ParseExcelResult = {
  dataset: Omit<ClinicalDataset, "id" | "createdAt" | "updatedAt">;
  warnings: string[];
  errors: string[];
};

export const DEFAULT_PURCHASED_MODULES: PurchasedModules = {
  imaging: true,
  pathology: true,
  waveform: false,
};

export const VARIABLE_TYPE_LABELS: Record<VariableType, string> = {
  text: "文本类型",
  numerical: "数值型",
  categorical: "无序分类",
  date: "日期型",
  file: "文件型",
};

export const CATEGORY_LABELS: Record<ColumnCategory, string> = {
  patient_id: "患者 ID",
  patient_info: "患者信息",
  imaging_file: "影像文件",
  pathology_file: "病理文件",
  waveform_file: "波形文件",
  unknown: "其他",
};
