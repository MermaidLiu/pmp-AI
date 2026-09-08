import { readHeader, readImage, isCompressed, decompress, type NIFTI1, type NIFTI2 } from "nifti-reader-js";
import { isCtNiiFileName, isRoiNiiFileName } from "./caseFileClassifier";

type NiftiHeader = NIFTI1 | NIFTI2;

export function resolveNiiRole(fileName: string, vol: Pick<NiiVolume, "isMask">): "roi" | "ct" {
  if (isRoiNiiFileName(fileName)) return "roi";
  if (isCtNiiFileName(fileName)) return "ct";
  return vol.isMask ? "roi" : "ct";
}

export type NiiVolume = {
  id: string;
  name: string;
  dims: [number, number, number];
  /** Axial slice count (Z) */
  sliceCount: number;
  voxels: Float32Array;
  min: number;
  max: number;
  /** 分割 / 标签图（非 CT 原图） */
  isMask: boolean;
  displayLo: number;
  displayHi: number;
  /** 含 ROI 最多的轴位层，用于默认展示 */
  bestSlice: number;
};

type NiiVolumeRecord = Omit<NiiVolume, "voxels"> & { voxelsBuffer: ArrayBuffer };

function dims3(header: NiftiHeader): [number, number, number] {
  const nx = header.dims[1] || 1;
  const ny = header.dims[2] || 1;
  const nz = header.dims[3] || 1;
  return [nx, ny, nz];
}

function voxelCount3(header: NiftiHeader): number {
  const [nx, ny, nz] = dims3(header);
  return nx * ny * nz;
}

/** 按 NIfTI datatypeCode 正确解码体素（分割 mask 多为 UINT8 / INT16，不能当 Float32 读） */
function decodeVoxels(header: NiftiHeader, imageBuffer: ArrayBuffer): Float32Array {
  const count = voxelCount3(header);
  const slope = header.scl_slope === 0 ? 1 : header.scl_slope || 1;
  const inter = header.scl_inter || 0;
  const little = header.littleEndian !== false;
  const view = new DataView(imageBuffer);
  const out = new Float32Array(count);

  const scale = (i: number, raw: number) => {
    out[i] = raw * slope + inter;
  };

  switch (header.datatypeCode) {
    case 2: {
      const src = new Uint8Array(imageBuffer, 0, Math.min(count, imageBuffer.byteLength));
      for (let i = 0; i < count; i++) scale(i, src[i] ?? 0);
      break;
    }
    case 256: {
      const src = new Uint8Array(imageBuffer, 0, Math.min(count, imageBuffer.byteLength));
      for (let i = 0; i < count; i++) scale(i, src[i] ?? 0);
      break;
    }
    case 4: {
      for (let i = 0; i < count; i++) {
        const off = i * 2;
        if (off + 1 >= imageBuffer.byteLength) break;
        scale(i, view.getInt16(off, little));
      }
      break;
    }
    case 512: {
      for (let i = 0; i < count; i++) {
        const off = i * 2;
        if (off + 1 >= imageBuffer.byteLength) break;
        scale(i, view.getUint16(off, little));
      }
      break;
    }
    case 8: {
      for (let i = 0; i < count; i++) {
        const off = i * 4;
        if (off + 3 >= imageBuffer.byteLength) break;
        scale(i, view.getInt32(off, little));
      }
      break;
    }
    case 768: {
      for (let i = 0; i < count; i++) {
        const off = i * 4;
        if (off + 3 >= imageBuffer.byteLength) break;
        scale(i, view.getUint32(off, little));
      }
      break;
    }
    case 16: {
      for (let i = 0; i < count; i++) {
        const off = i * 4;
        if (off + 3 >= imageBuffer.byteLength) break;
        out[i] = view.getFloat32(off, little);
      }
      if (slope !== 1 || inter !== 0) {
        for (let i = 0; i < count; i++) out[i] = out[i] * slope + inter;
      }
      break;
    }
    case 64: {
      for (let i = 0; i < count; i++) {
        const off = i * 8;
        if (off + 7 >= imageBuffer.byteLength) break;
        scale(i, view.getFloat64(off, little));
      }
      break;
    }
    default: {
      const bytesPerVoxel = Math.max(1, Math.floor(header.numBitsPerVoxel / 8));
      if (bytesPerVoxel === 1) {
        const src = new Uint8Array(imageBuffer, 0, Math.min(count, imageBuffer.byteLength));
        for (let i = 0; i < count; i++) scale(i, src[i] ?? 0);
      } else if (bytesPerVoxel === 2) {
        for (let i = 0; i < count; i++) {
          const off = i * 2;
          if (off + 1 >= imageBuffer.byteLength) break;
          scale(i, view.getInt16(off, little));
        }
      } else {
        for (let i = 0; i < count; i++) {
          const off = i * 4;
          if (off + 3 >= imageBuffer.byteLength) break;
          out[i] = view.getFloat32(off, little);
        }
      }
    }
  }

  return out;
}

function analyzeVolume(voxels: Float32Array, header: NiftiHeader, name: string) {
  let min = Infinity;
  let max = -Infinity;
  let nonZero = 0;
  const sampleStep = Math.max(1, Math.floor(voxels.length / 200_000));
  const samples: number[] = [];

  for (let i = 0; i < voxels.length; i++) {
    const v = voxels[i];
    if (!Number.isFinite(v)) continue;
    if (v < min) min = v;
    if (v > max) max = v;
    if (v !== 0) nonZero++;
    if (i % sampleStep === 0) samples.push(v);
  }

  if (!Number.isFinite(min)) min = 0;
  if (!Number.isFinite(max)) max = 1;

  const nonZeroRatio = voxels.length ? nonZero / voxels.length : 0;
  const span = max - min;
  const nameHint = /roi|seg|mask|label|勾画/i.test(name);
  const isMask =
    nameHint ||
    (span > 0 && max <= 64 && min >= 0 && nonZeroRatio < 0.35) ||
    (span > 0 && max <= 1.5 && min >= 0 && nonZeroRatio < 0.35);

  samples.sort((a, b) => a - b);
  let displayLo = min;
  let displayHi = max;

  if (isMask) {
    displayLo = min;
    displayHi = Math.max(min + 1, max);
  } else if (header.cal_max > header.cal_min) {
    displayLo = header.cal_min;
    displayHi = header.cal_max;
  } else if (samples.length > 20) {
    displayLo = samples[Math.floor(samples.length * 0.02)] ?? min;
    displayHi = samples[Math.floor(samples.length * 0.98)] ?? max;
    if (displayHi <= displayLo) displayHi = displayLo + 1;
  }

  return {
    min,
    max,
    isMask,
    displayLo,
    displayHi,
  };
}

function findBestSlice(voxels: Float32Array, nx: number, ny: number, nz: number, isMask: boolean): number {
  const plane = nx * ny;
  let best = Math.floor(nz / 2);
  let bestScore = -1;

  for (let z = 0; z < nz; z++) {
    let score = 0;
    const off = z * plane;
    for (let i = 0; i < plane; i++) {
      const v = voxels[off + i] ?? 0;
      if (isMask) {
        if (v > 0) score++;
      } else {
        score += Math.abs(v);
      }
    }
    if (score > bestScore) {
      bestScore = score;
      best = z;
    }
  }
  return best;
}

function decodeBuffer(buf: ArrayBuffer): { header: NiftiHeader; voxels: Float32Array } {
  let data = buf;
  if (isCompressed(buf)) {
    data = decompress(buf) as ArrayBuffer;
  }
  const header = readHeader(data);
  if (!header) throw new Error("无法解析 NIfTI 头");
  const imageBuffer = readImage(header, data);
  const voxels = decodeVoxels(header, imageBuffer);
  return { header, voxels };
}

export function parseNiiVolume(name: string, buf: ArrayBuffer, id?: string): NiiVolume {
  const { header, voxels } = decodeBuffer(buf);
  const dims = dims3(header);
  const [nx, ny, nz] = dims;
  const stats = analyzeVolume(voxels, header, name);
  const bestSlice = findBestSlice(voxels, nx, ny, nz, stats.isMask);

  return {
    id: id || `${name}-${buf.byteLength}`,
    name,
    dims,
    sliceCount: nz,
    voxels,
    min: stats.min,
    max: stats.max,
    isMask: stats.isMask,
    displayLo: stats.displayLo,
    displayHi: stats.displayHi,
    bestSlice,
  };
}

/** Render axial slice; optional CT background under ROI mask. */
export function niiSliceToOverlayDataUrl(
  foreground: NiiVolume,
  background: NiiVolume | null,
  sliceIndex: number,
): string {
  const [nx, ny, nz] = foreground.dims;
  const z = Math.max(0, Math.min(nz - 1, sliceIndex));
  const canvas = document.createElement("canvas");
  canvas.width = nx;
  canvas.height = ny;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";
  const img = ctx.createImageData(nx, ny);
  const fgSpan = foreground.displayHi - foreground.displayLo || 1;
  const planeOffset = z * nx * ny;
  const bg = background && !background.isMask ? background : null;
  const bgSpan = bg ? bg.displayHi - bg.displayLo || 1 : 1;

  for (let y = 0; y < ny; y++) {
    for (let x = 0; x < nx; x++) {
      const px = (y * nx + x) * 4;
      let r = 24;
      let g = 24;
      let b = 28;

      if (bg) {
        const bgZ = mapSliceIndex(z, nz, bg.sliceCount);
        const bgX = mapCoord(x, nx, bg.dims[0]);
        const bgY = mapCoord(y, ny, bg.dims[1]);
        const bgIdx = bgZ * bg.dims[0] * bg.dims[1] + bgY * bg.dims[0] + bgX;
        const cv = bg.voxels[bgIdx] ?? 0;
        const t = Math.max(0, Math.min(255, Math.round(((cv - bg.displayLo) / bgSpan) * 255)));
        r = g = b = t;
      }

      const idx = planeOffset + y * nx + x;
      const v = foreground.voxels[idx] ?? 0;
      const isRoi = foreground.isMask
        ? v > foreground.displayLo + fgSpan * 0.01
        : v > foreground.displayLo + fgSpan * 0.02;

      if (isRoi) {
        r = Math.round(r * 0.42);
        g = Math.round(g * 0.42 + 220 * 0.58);
        b = Math.round(b * 0.42 + 180 * 0.58);
      }

      img.data[px] = r;
      img.data[px + 1] = g;
      img.data[px + 2] = b;
      img.data[px + 3] = 255;
    }
  }

  ctx.putImageData(img, 0, 0);
  return canvas.toDataURL("image/png");
}

function mapSliceIndex(z: number, fromCount: number, toCount: number): number {
  if (fromCount <= 1 || toCount <= 1) return 0;
  if (fromCount === toCount) return z;
  return Math.max(0, Math.min(toCount - 1, Math.round((z / (fromCount - 1)) * (toCount - 1))));
}

function mapCoord(coord: number, fromSize: number, toSize: number): number {
  if (fromSize <= 1 || toSize <= 1) return 0;
  if (fromSize === toSize) return coord;
  return Math.max(0, Math.min(toSize - 1, Math.round((coord / (fromSize - 1)) * (toSize - 1))));
}

/** Render axial slice to PNG data URL for canvas/img display. */
export function niiSliceToDataUrl(vol: NiiVolume, sliceIndex: number): string {
  return niiSliceToOverlayDataUrl(vol, null, sliceIndex);
}

const DB_NAME = "pmp_nii_volumes";
const STORE = "volumes";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 2);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (db.objectStoreNames.contains(STORE)) db.deleteObjectStore(STORE);
      db.createObjectStore(STORE);
    };
  });
}

function toRecord(vol: NiiVolume): NiiVolumeRecord {
  const copy = vol.voxels.slice();
  return {
    id: vol.id,
    name: vol.name,
    dims: vol.dims,
    sliceCount: vol.sliceCount,
    min: vol.min,
    max: vol.max,
    isMask: vol.isMask,
    displayLo: vol.displayLo,
    displayHi: vol.displayHi,
    bestSlice: vol.bestSlice,
    voxelsBuffer: copy.buffer,
  };
}

export async function cacheNiiVolume(vol: NiiVolume): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(toRecord(vol), vol.id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    /* IndexedDB unavailable */
  }
}

export async function loadNiiVolume(id: string): Promise<NiiVolume | null> {
  try {
    const db = await openDb();
    const raw = await new Promise<unknown>((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).get(id);
      req.onsuccess = () => resolve(req.result ?? null);
      req.onerror = () => reject(req.error);
    });
    db.close();
    return normalizeStoredVolume(raw);
  } catch {
    return null;
  }
}

function normalizeStoredVolume(raw: unknown): NiiVolume | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Partial<NiiVolumeRecord & NiiVolume>;
  if (!r.dims || r.voxels == null && !r.voxelsBuffer) return null;

  let voxels: Float32Array | null = null;
  if (r.voxelsBuffer instanceof ArrayBuffer) {
    voxels = new Float32Array(r.voxelsBuffer);
  } else if (r.voxels instanceof Float32Array) {
    voxels = r.voxels;
  } else if (r.voxels instanceof ArrayBuffer) {
    voxels = new Float32Array(r.voxels);
  } else if (Array.isArray(r.voxels) || ArrayBuffer.isView(r.voxels)) {
    voxels = Float32Array.from(r.voxels as ArrayLike<number>);
  } else if (typeof r.voxels === "object") {
    const vals = Object.values(r.voxels as Record<string, number>);
    if (vals.length) voxels = Float32Array.from(vals);
  }

  if (!voxels || !voxels.length) return null;

  return {
    id: r.id!,
    name: r.name || "",
    dims: r.dims as [number, number, number],
    sliceCount: r.sliceCount ?? r.dims[2],
    voxels,
    min: r.min ?? 0,
    max: r.max ?? 1,
    isMask: r.isMask ?? false,
    displayLo: r.displayLo ?? r.min ?? 0,
    displayHi: r.displayHi ?? r.max ?? 1,
    bestSlice: r.bestSlice ?? Math.floor((r.sliceCount ?? 1) / 2),
  };
}

export async function clearNiiVolumeCache(): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    /* ignore */
  }
}
