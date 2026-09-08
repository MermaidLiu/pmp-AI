export type IndicatorSpec =
  | { type: "select"; options: string[]; placeholder?: string }
  | { type: "number"; placeholder?: string; unit?: string }
  | { type: "text"; placeholder?: string };

export const CLINICAL_INDICATOR_SPECS: Record<string, IndicatorSpec> = {
  病理分级: { type: "select", options: ["高级别", "低级别", "未确定"] },
  年龄: { type: "number", placeholder: "岁", unit: "岁" },
  性别: { type: "select", options: ["男", "女"] },
  "TNM 分期": { type: "text", placeholder: "如 cT2N1M0" },
  肿瘤大小: { type: "number", placeholder: "cm", unit: "cm" },
  CEA: { type: "number", placeholder: "ng/mL", unit: "ng/mL" },
  CA125: { type: "number", placeholder: "U/mL", unit: "U/mL" },
  "CA19-9": { type: "number", placeholder: "U/mL", unit: "U/mL" },
  淋巴结转移: { type: "select", options: ["是", "否", "未知"] },
  治疗方案: { type: "text", placeholder: "如 手术+化疗" },
  "OS / PFS": { type: "text", placeholder: "如 OS 24月 / PFS 18月" },
};

export const IMAGING_INDICATOR_SPECS: Record<string, IndicatorSpec> = {
  CT: { type: "select", options: ["已上传", "未上传"] },
  MRI: { type: "select", options: ["已上传", "未上传"] },
  PET: { type: "select", options: ["已上传", "未上传"] },
  WSI: { type: "select", options: ["已上传", "未上传"] },
  "ROI 分割": { type: "select", options: ["已勾画", "未勾画"] },
  纹理特征: { type: "number", placeholder: "特征维度", unit: "维" },
  形态特征: { type: "number", placeholder: "特征维度", unit: "维" },
  深度特征: { type: "number", placeholder: "特征维度", unit: "维" },
  EGFR: { type: "select", options: ["阳性", "阴性", "未知"] },
  HER2: { type: "select", options: ["阳性", "阴性", "未知"] },
  病理分级: { type: "select", options: ["高级别", "低级别", "未确定"] },
  SUVmax: { type: "number", placeholder: "如 8.6", unit: "" },
};

export const MULTIMODAL_INDICATOR_SPECS: Record<string, IndicatorSpec> = {
  临床变量: { type: "text", placeholder: "年龄、分期等" },
  病理变量: { type: "text", placeholder: "分级、分化程度等" },
  影像特征: { type: "text", placeholder: "Radiomics 特征集" },
  "WSI 特征": { type: "text", placeholder: "病理组学特征" },
  基因分型: { type: "select", options: ["EGFR+", "KRAS+", "野生型", "未知"] },
  治疗方案: { type: "text", placeholder: "如 靶向+化疗" },
  "OS / PFS": { type: "text", placeholder: "结局定义" },
  "复发/转移": { type: "select", options: ["是", "否", "未知"] },
  分子标志物: { type: "text", placeholder: "如 PD-L1、MSI" },
  病理分级: { type: "select", options: ["高级别", "低级别", "未确定"] },
};
