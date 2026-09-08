import { platformPathologyGrade, type PathologyImagingGradeResult, type PciScoreResult } from "../api/platform";
import {
  ensureResolvedUpload,
  getPendingCaseFileNames,
  getPendingCaseFiles,
  getResolvedUploadSync,
  hasPendingCaseFiles,
  hasPendingImagingFiles,
  pendingCaseFilesChanged,
  pendingCaseFilesFingerprint,
} from "./platformCaseUpload";
import { buildPresegmentedPathologyResult, isPresegmentedResult } from "./presegmentedCase";
import { shouldSkipCtApi } from "./resolveCaseUpload";
import {
  getPathologyImagingOrNull,
  hydratePathologyImagingResult,
  loadPlatformSession,
  setPathologyImagingResult,
} from "./platformSession";
import { normalizePciRegions, sumPciRegions } from "./pciRegions";

const JOB_KEY = "pmp_pathology_job";

export type PathologyJobPhase = "idle" | "running" | "done" | "error";

export type PathologyJobState = {
  phase: PathologyJobPhase;
  message: string;
  startedAt: string;
  finishedAt: string;
  fileNames: string[];
  error: string | null;
};

const IDLE: PathologyJobState = {
  phase: "idle",
  message: "",
  startedAt: "",
  finishedAt: "",
  fileNames: [],
  error: null,
};

let state: PathologyJobState = loadJob();
let running = false;
const listeners = new Set<(s: PathologyJobState) => void>();

function loadJob(): PathologyJobState {
  try {
    const raw = sessionStorage.getItem(JOB_KEY);
    if (raw) return { ...IDLE, ...JSON.parse(raw) } as PathologyJobState;
  } catch {
    /* ignore */
  }
  return { ...IDLE };
}

function persistJob() {
  try {
    sessionStorage.setItem(JOB_KEY, JSON.stringify(state));
  } catch {
    /* ignore */
  }
}

function setJob(partial: Partial<PathologyJobState>) {
  state = { ...state, ...partial };
  persistJob();
  listeners.forEach((fn) => fn({ ...state }));
}

export function getPathologyJobState(): PathologyJobState {
  return { ...state };
}

export function subscribePathologyJob(fn: (s: PathologyJobState) => void): () => void {
  listeners.add(fn);
  fn({ ...state });
  return () => listeners.delete(fn);
}

export function isPathologyJobRunning(): boolean {
  return running || state.phase === "running";
}

function getPci(result: PathologyImagingGradeResult): PciScoreResult | undefined {
  return result.pci ?? (result.raw?.pci as PciScoreResult | undefined);
}

export type PathologyAnalysisOutcome = {
  result: PathologyImagingGradeResult;
  fromCache: boolean;
  fileNames: string[];
};

/** Start analysis in background; CT 合并接口一次返回分割图 + PCI 报告。 */
export async function startPathologyAnalysis(opts?: {
  force?: boolean;
  onComplete?: (outcome: PathologyAnalysisOutcome) => void;
}): Promise<PathologyAnalysisOutcome | null> {
  if (running) return null;

  const files = getPendingCaseFiles();
  if (!files.length) return null;

  const fingerprint = pendingCaseFilesFingerprint();
  const names = getPendingCaseFileNames();

  if (!opts?.force) {
    const session = loadPlatformSession();
    const cached = getPathologyImagingOrNull();
    if (
      cached?.status === "ok" &&
      session.uploadedFileFingerprint === fingerprint &&
      fingerprint.length > 0
    ) {
      const hydrated = (await hydratePathologyImagingResult(cached)) ?? cached;
      const withCache: PathologyImagingGradeResult = {
        ...hydrated,
        message: hydrated.message?.includes("缓存") ? hydrated.message : "已使用缓存结果",
        raw: { ...(hydrated.raw || {}), cache_hit: true },
      };
      setJob({
        phase: "done",
        message: "已使用本地缓存",
        finishedAt: new Date().toISOString(),
        fileNames: names,
        error: null,
      });
      const outcome = { result: withCache, fromCache: true, fileNames: names };
      opts?.onComplete?.(outcome);
      return outcome;
    }
  }

  // Pre-segmented NIfTI only → skip classmate CT API, load local volume for viewer/radiomics
  const resolved = (await ensureResolvedUpload()) ?? getResolvedUploadSync();
  if (shouldSkipCtApi(resolved) && resolved?.niiFiles.length) {
    running = true;
    setJob({
      phase: "running",
      message: "检测到预勾画 NIfTI，跳过 CT 接口，加载本地体积…",
      startedAt: new Date().toISOString(),
      finishedAt: "",
      fileNames: names,
      error: null,
    });
    try {
      const { result } = await buildPresegmentedPathologyResult(resolved.niiFiles[0], fingerprint);
      setPathologyImagingResult(result, names, fingerprint);
      setJob({
        phase: "done",
        message: result.message || "预勾画已加载",
        finishedAt: new Date().toISOString(),
        error: null,
      });
      const outcome = { result, fromCache: false, fileNames: names };
      opts?.onComplete?.(outcome);
      return outcome;
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : "预勾画 NIfTI 加载失败";
      setJob({
        phase: "error",
        message: errMsg,
        finishedAt: new Date().toISOString(),
        error: errMsg,
      });
      return null;
    } finally {
      running = false;
    }
  }

  running = true;

  setJob({
    phase: "running",
    message: "正在调用 CT 合并接口（分割 + PCI 报告）…",
    startedAt: new Date().toISOString(),
    finishedAt: "",
    fileNames: names,
    error: null,
  });

  try {
    const finalRes = await platformPathologyGrade(files, {
      useCache: !opts?.force,
      forceRefresh: opts?.force,
      runPci: true,
    });
    const hydrated = (await hydratePathologyImagingResult(finalRes)) ?? finalRes;

    setPathologyImagingResult(hydrated, names, fingerprint);

    if (hydrated.status === "error") {
      setJob({
        phase: "error",
        message: hydrated.message || "分析失败",
        finishedAt: new Date().toISOString(),
        error: hydrated.message || "分析失败",
      });
    } else if (hydrated.status === "skipped") {
      setJob({
        phase: "error",
        message: hydrated.message || "未检测到 DICOM，未调用 CT 接口",
        finishedAt: new Date().toISOString(),
        error: hydrated.message || "未检测到 DICOM",
      });
    } else {
      const pci = getPci(hydrated);
      const pciTotal = pci?.pci_score ?? (pci ? sumPciRegions(normalizePciRegions(pci)) : null);
      const fromCache = hydrated.message.includes("缓存") || Boolean(hydrated.raw?.cache_hit);
      const hasSeg =
        Boolean(hydrated.result_image_base64) ||
        Boolean((hydrated.raw as { slice_manifest?: unknown } | undefined)?.slice_manifest);
      setJob({
        phase: "done",
        message:
          pciTotal != null
            ? fromCache
              ? `缓存命中 · PCI ${pciTotal}/36`
              : hasSeg
                ? `分析完成 · PCI ${pciTotal}/36`
                : `分析完成 · PCI ${pciTotal}/36（无分割图返回）`
            : fromCache
              ? "缓存命中"
              : hasSeg
                ? "分析完成"
                : "分析完成（接口未返回分割图）",
        finishedAt: new Date().toISOString(),
        error: null,
      });
    }

    const outcome = {
      result: hydrated,
      fromCache: hydrated.message.includes("缓存") || Boolean(hydrated.raw?.cache_hit),
      fileNames: names,
    };
    opts?.onComplete?.(outcome);
    return outcome;
  } catch (e) {
    const errMsg = e instanceof Error ? e.message : "分析失败，请检查后端服务是否启动";
    setJob({
      phase: "error",
      message: errMsg,
      finishedAt: new Date().toISOString(),
      error: errMsg,
    });
    return null;
  } finally {
    running = false;
  }
}

export function shouldAutoStartPathologyAnalysis(): boolean {
  if (!hasPendingCaseFiles()) return false;
  if (!hasPendingImagingFiles()) return false;
  if (isPathologyJobRunning()) return false;
  const session = loadPlatformSession();
  if (pendingCaseFilesChanged(session.uploadedFileNames, session.uploadedFileFingerprint)) return true;
  const cached = getPathologyImagingOrNull();
  return !cached || cached.status !== "ok";
}

export { isPresegmentedResult };

export function resetPathologyJob() {
  setJob({ ...IDLE });
}
