export function isNiiFileName(name: string): boolean {
  const lower = name.toLowerCase();
  return lower.endsWith(".nii") || lower.endsWith(".nii.gz") || lower.endsWith(".gz") && lower.includes(".nii");
}

/** 预勾画 / 分割 mask 命名 */
export function isRoiNiiFileName(name: string): boolean {
  const base = (name.split("/").pop() || name).toLowerCase();
  return /^roi[_\-.]/.test(base) || /seg|mask|label|勾画|分割/.test(base);
}

/** CT 原图 NIfTI 命名 */
export function isCtNiiFileName(name: string): boolean {
  const base = (name.split("/").pop() || name).toLowerCase();
  if (isRoiNiiFileName(name)) return false;
  return (
    /^ct[_\-.]/.test(base) ||
    /[_\-.]ct\.nii/.test(base) ||
    /^img[_\-.]/.test(base) ||
    /volume|原始|原图|平扫/.test(base)
  );
}

export function isDicomFileName(name: string): boolean {
  const lower = name.toLowerCase();
  return lower.endsWith(".dcm") || lower.endsWith(".dicom");
}

export function isZipFileName(name: string): boolean {
  return name.toLowerCase().endsWith(".zip");
}

export function isExcelFileName(name: string): boolean {
  const lower = name.toLowerCase();
  return lower.endsWith(".xlsx") || lower.endsWith(".xls") || lower.endsWith(".csv");
}
