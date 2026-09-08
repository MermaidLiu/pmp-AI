/** Build a data URL from API-returned base64 PNG/JPEG (annotated visualization). */

export function imageSrcFromBase64(base64: string): string {
  const clean = base64.trim();
  if (!clean) return "";
  if (clean.startsWith("data:image")) return clean;
  const mime = clean.startsWith("/9j/") ? "image/jpeg" : "image/png";
  return `data:${mime};base64,${clean}`;
}

export function hasAnnotatedImage(base64?: string | null): boolean {
  return Boolean(base64 && base64.trim().length > 80);
}
