import type { PathologyImagingGradeResult } from "../api/platform";
import { loadPlatformSession } from "./platformSession";

export type AnnotationSliceManifestItem = {
  index: number;
  filename: string;
  sc?: number | null;
  region?: number | null;
};

export function getSliceManifest(result: PathologyImagingGradeResult): AnnotationSliceManifestItem[] {
  const raw = result.raw as Record<string, unknown> | undefined;
  const manifest = raw?.slice_manifest;
  if (!Array.isArray(manifest)) return [];
  return manifest.filter(
    (item): item is AnnotationSliceManifestItem =>
      Boolean(item) &&
      typeof item === "object" &&
      typeof (item as AnnotationSliceManifestItem).index === "number",
  );
}

export function getSliceStoreFingerprint(result: PathologyImagingGradeResult): string {
  const raw = result.raw as Record<string, unknown> | undefined;
  const fp = String(raw?.fingerprint || "").trim();
  if (fp) return fp;
  return loadPlatformSession().uploadedFileFingerprint || "";
}

export function platformAnnotationSliceUrl(fingerprint: string, index: number): string {
  return `/api/v1/platform/pathology/slices/${encodeURIComponent(fingerprint)}/${index}`;
}

/** Fetch one annotated slice PNG as raw base64 (retries while backend writes slice store). */
export async function fetchAnnotationSliceBase64(
  fingerprint: string,
  index: number,
  retries = 8,
): Promise<string> {
  for (let attempt = 0; attempt < retries; attempt += 1) {
    try {
      const res = await fetch(platformAnnotationSliceUrl(fingerprint, index));
      if (!res.ok) {
        if (attempt < retries - 1) await new Promise((r) => window.setTimeout(r, 1500));
        continue;
      }
      const blob = await res.blob();
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(typeof reader.result === "string" ? reader.result : "");
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(blob);
      });
      const base64 = dataUrl.split(",")[1]?.trim() || "";
      if (base64.length > 80) return base64;
    } catch {
      /* retry */
    }
    if (attempt < retries - 1) await new Promise((r) => window.setTimeout(r, 1500));
  }
  return "";
}

export function findInitialSlicePosition(
  manifest: AnnotationSliceManifestItem[],
  raw?: Record<string, unknown>,
): number {
  if (!manifest.length) return 0;
  const selectedName = raw?.selected_slice_filename ? String(raw.selected_slice_filename) : "";
  if (selectedName) {
    const byName = manifest.findIndex((s) => s.filename === selectedName);
    if (byName >= 0) return byName;
  }
  const selectedIdx = raw?.selected_slice_index;
  if (selectedIdx != null && selectedIdx !== "") {
    const n = Number(selectedIdx);
    const byIdx = manifest.findIndex((s) => s.index === n);
    if (byIdx >= 0) return byIdx;
  }
  return 0;
}
