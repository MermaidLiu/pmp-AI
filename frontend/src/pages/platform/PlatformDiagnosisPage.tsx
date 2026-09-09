import { DatabaseOutlined, DownloadOutlined, ReloadOutlined, UploadOutlined } from "@ant-design/icons";
import { App, Alert, Button, Col, Collapse, Empty, Progress, Row, Space, Spin, Table, Tabs, Tag, Typography } from "antd";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { platformSavePathologyAnalysis, platformDownloadAnnotationDataset } from "../../api/platform";
import type { PathologyImagingGradeResult, PciScoreResult } from "../../api/platform";
import { saveCase } from "../../api/client";
import { CarePathwayPanel } from "../../components/platform/CarePathwayPanel";
import { LlmProviderSelect } from "../../components/platform/LlmProviderSelect";
import { loadLlmProvider } from "../../lib/llmProvider";
import { AnnotationSliceViewer } from "../../components/platform/AnnotationSliceViewer";
import { NiiSliceViewer } from "../../components/platform/NiiSliceViewer";
import { addToFollowUpQueue, isInFollowUpQueue } from "../../lib/followUpQueue";
import {
  buildPathologyAnalysisStub,
  buildRecordForCarePathway,
  runCarePathwayAnalysis,
  type CarePathwayResult,
} from "../../lib/platformCarePathway";
import { getWorkflowCase, saveWorkflowCase } from "../../lib/workflowCase";
import {
  getPathologyJobState,
  isPathologyJobRunning,
  isPresegmentedResult,
  shouldAutoStartPathologyAnalysis,
  startPathologyAnalysis,
  subscribePathologyJob,
  type PathologyJobState,
} from "../../lib/pathologyAnalysisJob";
import {
  getPendingCaseFiles,
  getPendingCaseFileNames,
  hasPendingCaseFiles,
  hasPendingImagingFiles,
  pendingCaseFilesChanged,
} from "../../lib/platformCaseUpload";
import { getPresegmentedNiiVolumeId } from "../../lib/presegmentedCase";
import {
  getPathologyImagingOrNull,
  hasSuccessfulPathologyResult,
  hydratePathologyImagingResult,
  loadPlatformSession,
  setPathologyImagingResult,
  markSaved,
  saveCarePathwayResult,
} from "../../lib/platformSession";
import { hasAnnotatedImage } from "../../lib/pathologyImage";
import { buildPciConclusion, normalizePciRegions, pciHasRenderableScores, pciRegionScoreTone, resolvePciFromResult, sumPciRegions } from "../../lib/pciRegions";

const { Title, Paragraph, Text } = Typography;

function getPci(result: PathologyImagingGradeResult): PciScoreResult | undefined {
  return resolvePciFromResult(result);
}

function splitMessageParts(message: string): string[] {
  const noise = [
    "接口未返回本例分级",
    "未返回病例级",
    "未返回本例分级字段",
    "已返回标注可视化图像",
    "resultBase64",
    "CT 分割与勾画已完成",
    "CT 合并接口已返回",
    "耗时：",
    "命中服务端缓存",
    "展示切片",
  ];
  return message
    .split(/[·•]/)
    .map((s) => s.trim())
    .filter(Boolean)
    .filter((s) => !noise.some((n) => s.includes(n)))
    .filter((s, i, arr) => arr.indexOf(s) === i);
}

type DetectionFinding = { label: string; detail: string; score: number };

function buildDetectionFindings(pci: PciScoreResult | undefined): DetectionFinding[] {
  if (!pci) return [];
  const regions = normalizePciRegions(pci);
  const positive = regions.filter((r) => (r.score ?? 0) > 0);
  if (positive.length) {
    return positive.map((r) => ({
      label: r.label,
      detail: `PCI 区域评分 ${r.score ?? "—"}`,
      score: r.score ?? 0,
    }));
  }
  const slices = pci.slice_scores?.filter((s) => (s.sc ?? 0) > 0) ?? [];
  if (slices.length) {
    return [
      {
        label: "逐层 sc 阳性",
        detail: `${slices.length} 层 sc > 0`,
        score: Math.max(...slices.map((s) => s.sc ?? 0)),
      },
    ];
  }
  return [];
}

function AnalysisResultsSidebar({
  result,
  pci,
}: {
  result: PathologyImagingGradeResult;
  pci?: PciScoreResult;
}) {
  const findings = buildDetectionFindings(pci);
  const totalScore = pci?.pci_score ?? (pci ? sumPciRegions(normalizePciRegions(pci)) : null);
  const conclusion = pci ? buildPciConclusion(pci) : "";
  const positivePct =
    pci?.positive_rate != null
      ? pci.positive_rate > 1
        ? Math.min(100, pci.positive_rate)
        : pci.positive_rate * 100
      : totalScore != null
        ? Math.min(100, (totalScore / 36) * 100)
        : result.confidence != null
          ? result.confidence * 100
          : null;

  return (
    <div className="pmp-analysis-sidebar">
      <div className="pmp-analysis-sidebar-block">
        <div className="pmp-panel-title">检测结果</div>
        {findings.length ? (
          <ul className="pmp-detection-list">
            {findings.map((f) => (
              <li key={f.label} className="pmp-detection-item">
                <div>
                  <Text strong>{f.label}</Text>
                  <div>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      {f.detail}
                    </Text>
                  </div>
                </div>
                <Tag color={f.score >= 3 ? "red" : f.score >= 1 ? "orange" : "blue"}>{f.score}</Tag>
              </li>
            ))}
          </ul>
        ) : (
          <Text type="secondary" style={{ fontSize: 12 }}>
            {hasAnnotatedImage(result.result_image_base64) ? "分割完成，等待 PCI 区域评分解析" : "分析完成后显示"}
          </Text>
        )}
      </div>

      <div className="pmp-analysis-sidebar-block">
        <div className="pmp-panel-title">整体评分</div>
        <div className="pmp-score-metrics">
          <div className="pmp-score-metric">
            <Text type="secondary" style={{ fontSize: 12 }}>
              PCI 总分
            </Text>
            <div className="pmp-score-metric-value">{totalScore != null ? `${totalScore}/36` : "—"}</div>
            {positivePct != null ? (
              <Progress percent={Math.round(positivePct)} size="small" strokeColor="#1677ff" />
            ) : null}
          </div>
          {result.confidence != null ? (
            <div className="pmp-score-metric">
              <Text type="secondary" style={{ fontSize: 12 }}>
                模型置信度
              </Text>
              <div className="pmp-score-metric-value">{(result.confidence * 100).toFixed(0)}%</div>
            </div>
          ) : null}
          {pci?.is_positive != null ? (
            <Tag color={pci.is_positive ? "red" : "green"} style={{ marginTop: 8 }}>
              {pci.is_positive ? "PCI 阳性" : "PCI 阴性"}
            </Tag>
          ) : null}
        </div>
      </div>

      {conclusion ? (
        <div className="pmp-analysis-sidebar-block">
          <div className="pmp-panel-title">AI 诊断建议</div>
          <Paragraph style={{ fontSize: 13, marginBottom: 0, lineHeight: 1.7, whiteSpace: "pre-wrap" }}>
            {conclusion}
          </Paragraph>
        </div>
      ) : null}
    </div>
  );
}

function PciSliceScoresTable({ slices }: { slices: NonNullable<PciScoreResult["slice_scores"]> }) {
  const positiveCount = slices.filter((s) => (s.sc ?? 0) > 0).length;
  return (
    <div className="pmp-pci-slice-table">
      <div className="pmp-pci-report-title">
        逐层 sc 评分（{slices.length} 层 · {positiveCount} 层 sc&gt;0）
      </div>
      <Table
        size="small"
        pagination={{ pageSize: 15, showSizeChanger: true, pageSizeOptions: ["15", "30", "50", "100"] }}
        rowKey={(row) => `${row.index}-${row.filename}`}
        dataSource={slices}
        columns={[
          { title: "#", dataIndex: "index", width: 64 },
          { title: "DICOM 文件名", dataIndex: "filename", ellipsis: true },
          {
            title: "区域",
            dataIndex: "region",
            width: 72,
            render: (v: number | null | undefined) => (v != null ? v : "—"),
          },
          {
            title: "sc",
            dataIndex: "sc",
            width: 72,
            sorter: (a, b) => (a.sc ?? -1) - (b.sc ?? -1),
            defaultSortOrder: "descend" as const,
            render: (v: number | null) => (
              <span className={`pmp-pci-region-score pmp-pci-region-score--${pciRegionScoreTone(v)}`}>{v ?? "—"}</span>
            ),
          },
        ]}
      />
    </div>
  );
}

function PciScorePanel({ pci, compact = false }: { pci: PciScoreResult; compact?: boolean }) {
  const fromCtSlices = pci.raw?.source === "ct_slices" || (pci.slice_scores?.length ?? 0) > 0;
  const hasScores = pciHasRenderableScores(pci);
  if (pci.status === "skipped") {
    return (
      <Alert type="warning" showIcon message="PCI 评分未执行" description={pci.message} />
    );
  }
  if (pci.status === "pending" && !hasScores) {
    return (
      <Alert
        type="warning"
        showIcon
        message="分割已完成，PCI 等待服务端 DICOM 路径"
        description={pci.message}
      />
    );
  }
  if (pci.status === "error" && !fromCtSlices && !hasScores) {
    return (
      <Alert type="error" showIcon message="PCI 评分失败" description={pci.message} />
    );
  }

  const regions = normalizePciRegions(pci);
  const totalScore = pci.pci_score ?? sumPciRegions(regions);
  const partial = totalScore == null && pci.status === "ok" && !pci.slice_scores?.length;
  const conclusion = buildPciConclusion(pci);

  const summary = (
    <>
      {pci.status === "pending" && hasScores ? (
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 12 }}
          message="PCI 评分解析自 CT 响应（合并接口未返回完整 pci 对象）"
          description={pci.message}
        />
      ) : null}
      {pci.status === "error" && fromCtSlices ? (
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 12 }}
          message="genpci 路径不可用，已使用 CT 分割返回的 sc 字段"
          description={pci.message}
        />
      ) : null}
      <div className={`pmp-pci-summary${compact ? " pmp-pci-summary--compact" : ""}`}>
        <div className="pmp-pci-total">
          <span className="pmp-pci-total-value">{totalScore ?? "—"}</span>
          <span className="pmp-pci-total-label">PCI 总分 / 36</span>
        </div>
        <Space wrap size={[8, 8]}>
          {pci.is_positive != null ? (
            <Tag color={pci.is_positive ? "red" : "green"}>{pci.is_positive ? "阳性" : "阴性"}</Tag>
          ) : null}
          {pci.positive_rate != null ? (
            <Tag color="blue">
              阳性概率{" "}
              {pci.positive_rate > 1 ? pci.positive_rate.toFixed(1) : `${(pci.positive_rate * 100).toFixed(0)}%`}
            </Tag>
          ) : null}
          {pci.mesenteric_contracture != null ? (
            <Tag color={pci.mesenteric_contracture ? "orange" : "default"}>
              肠系膜挛缩 {pci.mesenteric_contracture ? "(+)" : "(-)"}
            </Tag>
          ) : null}
        </Space>
      </div>

      <div className="pmp-pci-report-section">
        <div className="pmp-pci-report-title">13 区 PCI 评分</div>
        <div className={`pmp-pci-regions${compact ? " pmp-pci-regions--compact" : ""}`}>
          {regions.map((r) => (
            <div key={r.key} className="pmp-pci-region-card">
              <div className="pmp-pci-region-label">{r.label}</div>
              <div className={`pmp-pci-region-score pmp-pci-region-score--${pciRegionScoreTone(r.score)}`}>
                {r.score ?? "—"}
              </div>
            </div>
          ))}
        </div>
      </div>

      {pci.slice_scores?.length ? <PciSliceScoresTable slices={pci.slice_scores} /> : null}

      {conclusion ? (
        <div className="pmp-pci-conclusion">
          <div className="pmp-pci-conclusion-title">结论</div>
          <Paragraph style={{ marginBottom: 0, fontSize: 13, lineHeight: 1.7, whiteSpace: "pre-wrap" }}>
            {conclusion}
          </Paragraph>
        </div>
      ) : null}

      {pci.dcm_path_used ? (
        <Text type="secondary" style={{ fontSize: 11, display: "block", marginTop: 8 }}>
          DICOM 路径：{pci.dcm_path_used}
        </Text>
      ) : null}
      {(pci.raw?.paths_tried as string[] | undefined)?.length ? (
        <Text type="secondary" style={{ fontSize: 11, display: "block", marginTop: 4 }}>
          尝试路径：
          {(pci.raw?.paths_tried as string[])
            .slice(0, 3)
            .map((p) => (p.length > 80 ? `${p.slice(0, 77)}…` : p))
            .join(" → ")}
        </Text>
      ) : null}
    </>
  );

  if (compact) {
    return (
      <div className="pmp-pci-inline">
        {partial ? (
          <Alert type="warning" showIcon style={{ marginBottom: 12 }} message={pci.message} />
        ) : null}
        {summary}
      </div>
    );
  }

  return (
    <div className="pmp-card pmp-pci-panel" style={{ marginTop: 0 }}>
      <div className="pmp-panel-title">PCI 评分</div>
      {partial ? (
        <Alert type="warning" showIcon style={{ marginBottom: 12 }} message={pci.message} />
      ) : null}
      {summary}
    </div>
  );
}

function PathologyResultPanel({
  result,
}: {
  result: PathologyImagingGradeResult;
}) {
  const { message: msgApi } = App.useApp();
  const [downloading, setDownloading] = useState(false);
  const [activeTab, setActiveTab] = useState("detect");
  const isError = result.status === "error";
  const isSkipped = result.status === "skipped";
  const pci = getPci(result);
  const presegmented = isPresegmentedResult(result);
  const niiVolumeId =
    (result.raw?.nii_volume_id as string | undefined) || getPresegmentedNiiVolumeId() || "";
  const messageParts = pci ? [] : splitMessageParts(result.message || "");

  async function handleDownloadZip() {
    if (!result.annotation_dataset_id) return;
    setDownloading(true);
    try {
      msgApi.loading({ content: "正在打包标注数据集，501 层约需 1–2 分钟…", key: "ann-zip", duration: 0 });
      await platformDownloadAnnotationDataset(result.annotation_dataset_id);
      msgApi.success({ content: "标注数据集已开始下载", key: "ann-zip" });
    } catch (e: unknown) {
      let detail = "下载失败，请确认后端服务已启动";
      if (e && typeof e === "object" && "response" in e) {
        const resp = (e as { response?: { data?: Blob; status?: number } }).response;
        if (resp?.data instanceof Blob && resp.data.type?.includes("json")) {
          try {
            detail = JSON.parse(await resp.data.text())?.detail ?? detail;
          } catch {
            /* ignore */
          }
        } else if (resp?.status === 404) {
          detail = "标注数据集不存在，请重新运行智能分析";
        }
      } else if (e instanceof Error) {
        detail = e.message;
      }
      msgApi.error({ content: detail, key: "ann-zip" });
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="pmp-diagnosis-results">
      {presegmented ? (
        <Tag color="cyan" style={{ marginBottom: 12 }}>
          预勾画 NIfTI · 未调用 CT 接口
        </Tag>
      ) : null}

      {isError ? (
        <Alert type="error" message={result.message || "影像诊断分析接口调用失败"} showIcon />
      ) : isSkipped ? (
        <Alert type="warning" message={result.message} showIcon />
      ) : (
        <Tabs
          activeKey={activeTab}
          onChange={setActiveTab}
          className="pmp-analysis-tabs"
          items={[
            {
              key: "detect",
              label: "病灶检测",
              children: (
                <Row gutter={[20, 20]}>
                  <Col xs={24} xl={15}>
                    <div className="pmp-card pmp-diagnosis-viewer pmp-diagnosis-viewer--hero">
                      <div className="pmp-diagnosis-viewer-head">
                        <div>
                          <div className="pmp-panel-title" style={{ marginBottom: 4 }}>
                            影像标注可视化
                          </div>
                          <Text type="secondary" style={{ fontSize: 12 }}>
                            {presegmented
                              ? "↑ / ↓ 翻阅 NIfTI 勾画轴位"
                              : "← / → 翻阅 CT 接口返回的分割切片（ctResults）"}
                          </Text>
                        </div>
                        <Space>
                          <Tag>{result.dicom_count} 张 DICOM</Tag>
                          {result.exam_id ? <Tag color="blue">{result.exam_id}</Tag> : null}
                        </Space>
                      </div>
                      {presegmented && niiVolumeId ? (
                        <NiiSliceViewer volumeId={niiVolumeId} />
                      ) : (
                        <AnnotationSliceViewer result={result} />
                      )}
                    </div>
                  </Col>
                  <Col xs={24} xl={9}>
                    <div className="pmp-card pmp-analysis-sidebar-card">
                      <AnalysisResultsSidebar result={result} pci={pci} />
                      {!pci && messageParts.length > 0 ? (
                        <ul className="pmp-diagnosis-bullets" style={{ marginTop: 12 }}>
                          {messageParts.map((part) => (
                            <li key={part}>{part}</li>
                          ))}
                        </ul>
                      ) : null}
                    </div>
                    <Space wrap style={{ marginTop: 16 }}>
                      <Button type="primary" onClick={() => setActiveTab("pci")}>
                        查看 PCI 详情
                      </Button>
                      <Link to="/assisted-diagnosis">
                        <Button>进入 AI 辅助诊断</Button>
                      </Link>
                      <Button
                        onClick={() =>
                          document.getElementById("pmp-care-pathway")?.scrollIntoView({ behavior: "smooth" })
                        }
                      >
                        生成报告
                      </Button>
                    </Space>
                  </Col>
                </Row>
              ),
            },
            {
              key: "pci",
              label: "PCI 评分",
              children: pci ? (
                <PciScorePanel pci={pci} />
              ) : (
                <Alert type="info" showIcon message="PCI 报告未返回" description="请确认 CT 接口响应含 pci 对象" />
              ),
            },
            {
              key: "quant",
              label: "量化分析",
              children: pci?.slice_scores?.length ? (
                <PciSliceScoresTable slices={pci.slice_scores} />
              ) : (
                <Empty description="暂无逐层 sc 数据" />
              ),
            },
          ]}
        />
      )}

      {result.annotation_dataset_id ? (
        <div className="pmp-card pmp-annotation-dataset" style={{ marginTop: 20 }}>
          <div className="pmp-annotation-dataset-head">
            <div>
              <div className="pmp-panel-title">完整标注数据集</div>
              <Paragraph type="secondary" style={{ fontSize: 13, margin: "6px 0 0" }}>
                全部切片的勾画图、二值 mask 与 DICOM 空间元数据，可用于组学建模与分割训练。
              </Paragraph>
            </div>
            <Button
              type="primary"
              size="large"
              icon={<DownloadOutlined />}
              loading={downloading}
              onClick={() => void handleDownloadZip()}
            >
              下载 ZIP
            </Button>
          </div>
          <div className="pmp-annotation-stats">
            <div className="pmp-annotation-stat">
              <div className="pmp-annotation-stat-value">{result.annotation_slice_count ?? 0}</div>
              <div className="pmp-annotation-stat-label">annotated PNG</div>
            </div>
            <div className="pmp-annotation-stat">
              <div className="pmp-annotation-stat-value">{result.annotation_slices_with_mask ?? 0}</div>
              <div className="pmp-annotation-stat-label">含病灶 mask</div>
            </div>
            <div className="pmp-annotation-stat pmp-annotation-stat--wide">
              <div className="pmp-annotation-stat-label">数据集 ID</div>
              <div className="pmp-annotation-stat-id">{result.annotation_dataset_id}</div>
            </div>
          </div>
        </div>
      ) : null}

      {result.raw && Object.keys(result.raw).length > 0 ? (
        <div className="pmp-card" style={{ padding: 16, marginTop: 16 }}>
          <Collapse
            items={[
              {
                key: "raw",
                label: "接口返回字段解析",
                children: (
                  <pre className="pmp-kb-modal-pre" style={{ maxHeight: 360 }}>
                    {JSON.stringify(result.raw, null, 2)}
                  </pre>
                ),
              },
            ]}
          />
        </div>
      ) : null}
    </div>
  );
}

type PlatformDiagnosisPageProps = {
  /** 嵌在工作台「② 智能分析」TAB 内时为 true，隐藏返回工作台等重复导航 */
  embedded?: boolean;
};

export default function PlatformDiagnosisPage({ embedded = false }: PlatformDiagnosisPageProps) {
  const { message } = App.useApp();
  const [jobState, setJobState] = useState<PathologyJobState>(() => getPathologyJobState());
  const [hydrating, setHydrating] = useState(true);
  const [result, setResult] = useState<PathologyImagingGradeResult | null>(() => getPathologyImagingOrNull());
  const [fileNames, setFileNames] = useState<string[]>(loadPlatformSession().uploadedFileNames);
  const [savedToDb, setSavedToDb] = useState(Boolean(loadPlatformSession().savedExamId));
  const [saving, setSaving] = useState(false);
  const [careResult, setCareResult] = useState<CarePathwayResult | null>(null);
  const [careLoading, setCareLoading] = useState(false);
  const [followUpLoading, setFollowUpLoading] = useState(false);
  const [inFollowUp, setInFollowUp] = useState(false);
  const autoRanRef = useRef(false);

  const loading = isPathologyJobRunning() || jobState.phase === "running";

  useEffect(() => subscribePathologyJob(setJobState), []);

  useEffect(() => {
    if (!result || result.result_image_base64) return;
    let cancelled = false;
    void hydratePathologyImagingResult(result).then((hydrated) => {
      if (!cancelled && hydrated?.result_image_base64) setResult(hydrated);
    });
    return () => {
      cancelled = true;
    };
  }, [result?.exam_id, result?.status, result?.result_image_base64]);

  async function runCarePathway(imaging: PathologyImagingGradeResult, examId?: string) {
    setCareLoading(true);
    try {
      const record = buildRecordForCarePathway(imaging, examId);
      saveWorkflowCase(record);
      const result = await runCarePathwayAnalysis(imaging, examId, loadLlmProvider());
      setCareResult(result);
      saveCarePathwayResult(result);
      setInFollowUp(isInFollowUpQueue(record.patient_base_info.exam_id));
    } catch {
      message.warning("治疗建议生成失败，请确认后端已启动且所选大模型配置可用");
    } finally {
      setCareLoading(false);
    }
  }

  async function handleEnrollFollowUp() {
    if (!result || !careResult) return;
    setFollowUpLoading(true);
    try {
      let examId = result.exam_id;
      if (!savedToDb) {
        const clinical = buildRecordForCarePathway(result);
        const saved = await platformSavePathologyAnalysis(result, fileNames, clinical);
        examId = saved.exam_id;
        markSaved(saved.exam_id);
        setSavedToDb(true);
      }
      const record = buildRecordForCarePathway({ ...result, exam_id: examId }, examId);
      const analysisStub = buildPathologyAnalysisStub(careResult);
      await addToFollowUpQueue(record, analysisStub, saveCase);
      setInFollowUp(true);
      message.success("已加入随访队列，可在「随访队列」查看");
    } catch {
      message.error("加入随访队列失败");
    } finally {
      setFollowUpLoading(false);
    }
  }

  async function joinDatabase() {
    if (!result || result.status !== "ok") {
      message.warning("请先完成成功的影像诊断分析");
      return;
    }
    setSaving(true);
    try {
      const clinical = buildRecordForCarePathway(result);
      const res = await platformSavePathologyAnalysis(result, fileNames, clinical);
      markSaved(res.exam_id);
      setSavedToDb(true);
      const updated = { ...result, exam_id: res.exam_id, saved: true };
      setResult(updated);
      setPathologyImagingResult(updated, fileNames);
      message.success("已写入病理数据库与影像数据库");
    } catch (e) {
      message.error(e instanceof Error ? e.message : "入库失败");
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => {
    let cancelled = false;
    async function restorePrevious() {
      const session = loadPlatformSession();
      if (pendingCaseFilesChanged(session.uploadedFileNames, session.uploadedFileFingerprint)) {
        setHydrating(false);
        return;
      }
      const stored = getPathologyImagingOrNull();
      if (!stored) {
        setHydrating(false);
        return;
      }
      const hydrated = await hydratePathologyImagingResult(stored);
      if (!cancelled && hydrated) {
        setResult(hydrated);
        setFileNames(session.uploadedFileNames);
        if (hydrated.status === "ok") void runCarePathway(hydrated, hydrated.exam_id);
      }
      if (!cancelled) setHydrating(false);
    }
    void restorePrevious();
    return () => {
      cancelled = true;
    };
  }, []);

  async function applyAnalysisOutcome(
    finalRes: PathologyImagingGradeResult,
    names: string[],
    opts?: { notify?: boolean; fromCache?: boolean },
  ) {
    const hydrated = (await hydratePathologyImagingResult(finalRes)) ?? finalRes;
    setResult(hydrated);
    setFileNames(names);
    setSavedToDb(Boolean(hydrated.saved));
    if (hydrated.status === "ok") {
      void runCarePathway(hydrated, hydrated.exam_id);
    } else {
      setCareResult(null);
    }
    if (!opts?.notify) return;
    if (hydrated.status === "error") {
      message.error(hydrated.message || "影像诊断分析接口调用失败");
    } else if (hydrated.status === "skipped") {
      message.warning(hydrated.message);
    } else {
      const pci = getPci(hydrated);
      const pciTotal = pci?.pci_score ?? (pci ? sumPciRegions(normalizePciRegions(pci)) : null);
      if (opts.fromCache) {
        message.success(pciTotal != null ? `已加载缓存 · PCI ${pciTotal}/36` : "已加载缓存结果");
      } else if (pciTotal != null) {
        message.success(`分割完成 · PCI ${pciTotal}/36`);
      } else if (pci?.status === "pending") {
        message.warning("分割完成；PCI 需 CT 返回 pci 字段");
      } else if (pci?.status === "error") {
        message.warning(`分割完成，但 PCI 失败：${pci.message}`);
      } else if (pci?.status === "skipped") {
        message.warning(`分割完成，但 PCI 未执行：${pci.message}`);
      } else {
        message.warning("分割完成，但 PCI 接口未返回 pciScore 总分");
      }
    }
  }

  async function runPathologyAnalysis(force = false) {
    const files = getPendingCaseFiles();
    if (!files.length) {
      if (force) {
        message.warning("请先在「工作台」上传 DICOM/ZIP 或含 .nii.gz 的预勾画压缩包");
      }
      return;
    }
    if (isPathologyJobRunning()) {
      message.info("分析已在后台进行，可切换至其他页面");
      return;
    }
    const outcome = await startPathologyAnalysis({ force });
    if (outcome) {
      await applyAnalysisOutcome(outcome.result, outcome.fileNames, {
        notify: true,
        fromCache: outcome.fromCache,
      });
    }
  }

  useEffect(() => {
    if (jobState.phase !== "done" && jobState.phase !== "error") return;
    const stored = getPathologyImagingOrNull();
    if (!stored || result) return;
    void hydratePathologyImagingResult(stored).then((hydrated) => {
      if (hydrated) {
        setResult(hydrated);
        setFileNames(jobState.fileNames.length ? jobState.fileNames : loadPlatformSession().uploadedFileNames);
        if (hydrated.status === "ok") void runCarePathway(hydrated, hydrated.exam_id);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobState.phase, jobState.finishedAt]);

  useEffect(() => {
    if (autoRanRef.current || hydrating || !shouldAutoStartPathologyAnalysis()) return;
    autoRanRef.current = true;
    void runPathologyAnalysis();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrating]);

  const hasResult = Boolean(result);
  const showEmpty = !loading && !hydrating && !result && !hasPendingImagingFiles() && !hasSuccessfulPathologyResult();

  return (
    <div className={`pmp-section pmp-diagnosis-page${embedded ? " pmp-diagnosis-page--embedded" : ""}`}>
      <div className="pmp-diagnosis-page-head">
        <div>
          <Title level={4} style={{ marginBottom: 8 }}>
            {!embedded ? <span className="pmp-section-num">2</span> : null}
            智能分析与诊断
          </Title>
          <Paragraph type="secondary" style={{ marginBottom: 0 }}>
            影像分割与 PCI 由 CT 合并接口返回；可选大模型，基于影像结果与工作台临床信息生成诊断解读与治疗草案。
          </Paragraph>
        </div>
        <Space wrap>
          {!embedded ? (
            <Link to="/workflow">
              <Button>返回影像输入</Button>
            </Link>
          ) : null}
          {result?.saved || savedToDb ? (
            <Link to="/db/patients">
              <Button>查看患者数据库</Button>
            </Link>
          ) : null}
          {!loading && result?.status === "ok" && !savedToDb ? (
            <Button type="primary" icon={<DatabaseOutlined />} loading={saving} onClick={() => void joinDatabase()}>
              加入病理库 + 影像库
            </Button>
          ) : null}
          {savedToDb ? <Tag color="green">已入库</Tag> : null}
          <Button
            type="primary"
            icon={<ReloadOutlined />}
            loading={loading}
            onClick={() => void runPathologyAnalysis(true)}
          >
            {hasResult ? "重新分析" : "开始分析"}
          </Button>
          <LlmProviderSelect compact size="small" />
        </Space>
      </div>

      {result ? (
        <>
          <PathologyResultPanel result={result} />
          {result.status === "ok" ? (
            <CarePathwayPanel
              imaging={result}
              careResult={careResult}
              careLoading={careLoading}
              inFollowUp={inFollowUp}
              followUpLoading={followUpLoading}
              onEnroll={() => void handleEnrollFollowUp()}
            />
          ) : null}
        </>
      ) : null}

      {loading && !result ? (
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 12 }}
          message={jobState.message || "影像诊断分析进行中…"}
          description="CT 合并接口一次返回分割图与 PCI（同学侧约 5 分钟）。"
        />
      ) : null}

      {hydrating && !result ? (
        <div style={{ textAlign: "center", padding: 16 }}>
          <Spin tip="正在加载上次分析结果…" />
        </div>
      ) : null}

      {showEmpty ? (
        <Empty
          description={
            embedded
              ? "请先回到「① 影像输入」上传 DICOM / ZIP，再点击「开始智能分析」"
              : "请先在「工作台」上传患者病例（DICOM 或 ZIP），再进入本页分析"
          }
        >
          {embedded ? null : (
            <Link to="/workflow">
              <Button type="primary" icon={<UploadOutlined />}>
                前往工作台上传
              </Button>
            </Link>
          )}
        </Empty>
      ) : null}

      {fileNames.length > 0 && !loading ? (
        <Alert
          type="info"
          showIcon
          style={{ marginTop: result ? 16 : 0 }}
          message={`已选择 ${fileNames.length} 个上传文件${result?.dicom_count ? ` · 解析出 ${result.dicom_count} 张 DICOM` : ""}`}
          description={
            fileNames.length <= 3
              ? fileNames.join(" · ")
              : `${fileNames.slice(0, 3).join(" · ")} … 等 ${fileNames.length} 个`
          }
        />
      ) : null}
    </div>
  );
}
