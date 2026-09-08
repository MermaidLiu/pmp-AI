import { ArrowLeftOutlined, CheckOutlined, ExportOutlined, FileTextOutlined, UploadOutlined } from "@ant-design/icons";
import { App, Alert, Button, Input, Progress, Space, Table, Tabs, Tag, Typography } from "antd";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import type { ModuleAnalysisResult, ResearchResultRow } from "../../data/researchWorkbenchMock";
import {
  applyQuestionTemplate,
  clinicalQuestionSummaryText,
  defaultClinicalQuestion,
  type ClinicalQuestion,
} from "../../data/clinicalQuestions";
import { IMAGING_AGENT_STEPS } from "../../data/agentSteps";
import { IMAGING_AUTOML_STEPS, IMAGING_NL_PROMPT, IMAGING_STRATEGIES } from "../../data/imagingAgentMock";
import { getFollowUpBatchCase } from "../../lib/followUpBatchStore";
import { hasAnnotatedImage, imageSrcFromBase64 } from "../../lib/pathologyImage";
import { loadPathologyImage } from "../../lib/pathologyImagingCache";
import type { BatchPatientRef } from "../../lib/platformBatchSelection";
import { loadModuleResults, saveModuleResult } from "../../lib/researchModuleResults";
import { BatchImageNavigator, type BatchImageItem } from "./BatchImageNavigator";
import ClinicalQuestionPanel from "./ClinicalQuestionPanel";
import ImagingAgentAssistantPanel from "./ImagingAgentAssistantPanel";
import ImagingAgentStepBar from "./ImagingAgentStepBar";
import { ModelEvalChartPanel, resolveDisplayAuc, type EvalTabKey } from "./ModelEvalCharts";
import RadiomicsPipeline from "./RadiomicsPipeline";

const { Title, Text, Paragraph } = Typography;

const ACCENT = "#1677ff";
const LIGHT = "#ecfeff";

type Props = {
  batchPatients?: BatchPatientRef[];
  batchRoiMode?: boolean;
  radiomicsAnnotatedImage?: string | null;
  radiomicsPathologyGrade?: string;
};

type StrategyId = "radiomics" | "deeplearn" | "combined";

function SectionBadge({ n }: { n: number }) {
  return <span className="pmp-mm-agent-section-badge pmp-img-agent-section-badge">{n}</span>;
}

function FeatureImportanceChart({ rows }: { rows: ResearchResultRow[] }) {
  const sorted = [...rows].sort((a, b) => (b.weight ?? 0) - (a.weight ?? 0)).slice(0, 10);
  const max = sorted[0]?.weight ?? 100;
  if (!sorted.length) {
    return (
      <div className="pmp-mm-agent-eval-placeholder">
        <Text type="secondary">运行组学建模后显示特征重要性</Text>
      </div>
    );
  }
  return (
    <div className="pmp-mm-agent-feature-bars">
      <Text type="secondary" style={{ fontSize: 12 }}>
        特征重要性 Top {sorted.length}
      </Text>
      {sorted.map((f) => (
        <div key={f.factor} className="pmp-mm-agent-feature-row">
          <div className="pmp-mm-agent-feature-meta">
            <span className="pmp-mm-agent-feature-name">{f.factor}</span>
            <span style={{ fontSize: 11, color: "#64748b" }}>{f.metric}</span>
          </div>
          <div className="pmp-mm-agent-feature-track">
            <div
              className="pmp-mm-agent-feature-fill pmp-img-agent-feature-fill"
              style={{ width: `${((f.weight ?? 0) / max) * 100}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function DonutChart({
  positiveLabel,
  negativeLabel,
  positivePct,
}: {
  positiveLabel: string;
  negativeLabel: string;
  positivePct: number;
}) {
  const posDeg = (positivePct / 100) * 360;
  return (
    <div className="pmp-img-agent-donut-wrap">
      <Text type="secondary" style={{ fontSize: 12 }}>
        标签分布
      </Text>
      <div
        className="pmp-img-agent-donut"
        style={{
          background: `conic-gradient(#1677ff 0deg ${posDeg}deg, #52c41a ${posDeg}deg 360deg)`,
        }}
      >
        <div className="pmp-img-agent-donut-hole">
          <strong>{positivePct.toFixed(1)}%</strong>
          <span>{positiveLabel}</span>
        </div>
      </div>
      <div className="pmp-img-agent-donut-legend">
        <span>
          <i style={{ background: "#1677ff" }} />
          {positiveLabel} {positivePct.toFixed(1)}%
        </span>
        <span>
          <i style={{ background: "#52c41a" }} />
          {negativeLabel} {(100 - positivePct).toFixed(1)}%
        </span>
      </div>
    </div>
  );
}

function CtPreviewThumb({ img }: { img?: BatchImageItem }) {
  if (img?.volumeId) {
    return (
      <div className="pmp-img-agent-ct-thumb pmp-img-agent-ct-thumb--nii">
        <Text style={{ fontSize: 10, color: "#94a3b8" }}>NIfTI ROI</Text>
        <Text ellipsis style={{ fontSize: 9, color: "#64748b", maxWidth: "100%" }}>
          {img.label}
        </Text>
      </div>
    );
  }
  if (img && hasAnnotatedImage(img.base64)) {
    return (
      <div className="pmp-img-agent-ct-thumb">
        <img src={imageSrcFromBase64(img.base64)} alt={img.label} />
      </div>
    );
  }
  return (
    <div className="pmp-img-agent-ct-thumb">
      <div className="pmp-mm-agent-ct-lung" />
      <div className="pmp-mm-agent-ct-roi" />
    </div>
  );
}

function computeGradeDistribution(patients: BatchPatientRef[]) {
  let high = 0;
  let low = 0;
  for (const p of patients) {
    if (p.gradeLabel === "高级别") high += 1;
    else if (p.gradeLabel === "低级别") low += 1;
  }
  const labeled = high + low;
  if (!labeled) return null;
  return {
    positiveLabel: "高级别",
    negativeLabel: "低级别",
    positivePct: (high / labeled) * 100,
    positiveCount: high,
    negativeCount: low,
    total: labeled,
  };
}

export default function ImagingAgentWorkbench({
  batchPatients = [],
  batchRoiMode = false,
  radiomicsAnnotatedImage,
  radiomicsPathologyGrade,
}: Props) {
  const { message } = App.useApp();
  const [agentStep, setAgentStep] = useState("input");
  const [nlInput, setNlInput] = useState(IMAGING_NL_PROMPT);
  const [strategyId, setStrategyId] = useState<StrategyId>("combined");
  const [clinicalQuestion, setClinicalQuestion] = useState<ClinicalQuestion>(() =>
    defaultClinicalQuestion("genotype_binary"),
  );
  const [batchRadiomicsImages, setBatchRadiomicsImages] = useState<BatchImageItem[]>([]);
  const [pipelineStep, setPipelineStep] = useState(0);
  const [result, setResult] = useState<ResearchResultRow[] | null>(null);
  const [resultSummary, setResultSummary] = useState("");
  const [resultAuc, setResultAuc] = useState<number | null>(null);
  const [saved, setSaved] = useState(false);
  const [evalTab, setEvalTab] = useState<EvalTabKey>("roc");
  const [sampleN, setSampleN] = useState(0);

  useEffect(() => {
    const savedImaging = loadModuleResults().imaging;
    if (savedImaging?.rows?.length) {
      setResult(savedImaging.rows);
      setResultSummary(savedImaging.summary);
      setResultAuc(savedImaging.auc ?? null);
      setSaved(true);
      setAgentStep("eval");
      setPipelineStep(3);
    }
  }, []);

  useEffect(() => {
    if (!batchPatients.length) {
      setBatchRadiomicsImages([]);
      return;
    }
    let cancelled = false;
    void (async () => {
      const loaded = await Promise.all(
        batchPatients.map(async (p) => {
          const meta = [p.gradeLabel, p.pciScore != null ? `PCI ${p.pciScore}/36` : ""].filter(Boolean).join(" · ");
          const volumeId = p.niiVolumeId || getFollowUpBatchCase(p.id)?.niiVolumeId;
          const batchCase = getFollowUpBatchCase(p.id);
          const backgroundVolumeId = p.ctVolumeId || batchCase?.ctVolumeId;
          if (volumeId) {
            return {
              id: p.id,
              label: `${p.name}（${p.id}）`,
              base64: "",
              volumeId,
              backgroundVolumeId: backgroundVolumeId ?? undefined,
              meta,
            };
          }
          const base64 = p.examId ? (await loadPathologyImage(p.examId)) || "" : "";
          return { id: p.id, label: `${p.name}（${p.id}）`, base64, meta };
        }),
      );
      if (!cancelled) {
        setBatchRadiomicsImages(loaded.filter((img) => img.volumeId || hasAnnotatedImage(img.base64)));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [batchPatients]);

  useEffect(() => {
    const approach =
      strategyId === "deeplearn" ? "deep_learning" : strategyId === "radiomics" ? "radiomics_ml" : "radiomics_ml";
    setClinicalQuestion((q) => ({ ...q, modelingApproach: approach }));
  }, [strategyId]);

  const caseCount = batchPatients.length || (radiomicsAnnotatedImage ? 1 : 0);
  const imageCount = batchRadiomicsImages.length || (radiomicsAnnotatedImage ? 1 : 0);
  const roiCount = batchRadiomicsImages.filter((i) => i.volumeId).length || (radiomicsAnnotatedImage ? 1 : 0);
  const gradeDist = useMemo(() => computeGradeDistribution(batchPatients), [batchPatients]);

  const dataStats = useMemo(() => {
    const total = String(caseCount || "—");
    const ct = String(imageCount || "—");
    const roi = String(roiCount || "—");
    if (gradeDist) {
      return [
        { label: "总病例", value: String(gradeDist.total), sub: "例" },
        { label: gradeDist.positiveLabel, value: String(gradeDist.positiveCount), sub: `${gradeDist.positivePct.toFixed(1)}%` },
        { label: gradeDist.negativeLabel, value: String(gradeDist.negativeCount), sub: `${(100 - gradeDist.positivePct).toFixed(1)}%` },
        { label: "CT 影像", value: ct, sub: "例" },
        { label: "ROI 区域", value: roi, sub: "例" },
        { label: "临床数据", value: total, sub: "例" },
      ];
    }
    return [
      { label: "总病例", value: total, sub: caseCount ? "例" : "待检索" },
      { label: "CT 影像", value: ct, sub: imageCount ? "例" : "—" },
      { label: "ROI 区域", value: roi, sub: roiCount ? "例" : "—" },
      { label: "临床数据", value: total, sub: "—" },
      { label: "分析类型", value: strategyId === "deeplearn" ? "DL" : "组学", sub: "" },
      { label: "模型 AUC", value: resultAuc != null ? resultAuc.toFixed(3) : "—", sub: "" },
    ];
  }, [caseCount, imageCount, roiCount, gradeDist, strategyId, resultAuc]);

  const understanding = useMemo(
    () => [
      { label: "目标疾病", value: clinicalQuestion.groupA.includes("EGFR") ? "肺癌" : "PMP / 相关肿瘤" },
      { label: "预测目标", value: clinicalQuestion.targetField },
      { label: "预测类型", value: clinicalQuestion.outcomeType === "binary" ? "二分类" : clinicalQuestion.outcomeType },
      {
        label: "推荐分析",
        value:
          strategyId === "deeplearn"
            ? "深度学习"
            : strategyId === "combined"
              ? "影像组学 + 深度学习"
              : "影像组学",
      },
      { label: "所需标签", value: `${clinicalQuestion.targetField}（${clinicalQuestion.positiveClass}）` },
    ],
    [clinicalQuestion, strategyId],
  );

  const displayAuc = useMemo(
    () => resolveDisplayAuc(resultAuc, result, sampleN || caseCount),
    [resultAuc, result, sampleN, caseCount],
  );

  const progressPct = useMemo(() => {
    if (saved && result) return 100;
    if (pipelineStep >= 2) return 75;
    if (pipelineStep >= 1) return 50;
    if (caseCount > 0) return 25;
    return 10;
  }, [saved, result, pipelineStep, caseCount]);

  const progressLabel = saved
    ? "模型评估完成"
    : pipelineStep >= 2
      ? "特征已提取，待运行建模"
      : pipelineStep >= 1
        ? "ROI 已确认，待提取特征"
        : caseCount
          ? "数据已就绪，请完成组学流程"
          : "请上传影像或关联工作台结果";

  const completedSteps = useMemo(() => {
    const done: string[] = ["input"];
    if (caseCount || imageCount) done.push("data");
    if (strategyId) done.push("strategy");
    if (pipelineStep >= 1) done.push("train");
    if (result) done.push("eval");
    if (saved) done.push("validate", "feedback");
    return done;
  }, [caseCount, imageCount, strategyId, pipelineStep, result, saved]);

  const modelRows = useMemo(() => {
    if (!result?.length) return [];
    return [
      {
        rank: 1,
        model: strategyId === "deeplearn" ? "ResNet50" : "XGBoost",
        type: strategyId === "deeplearn" ? "Deep Learning" : "Radiomics",
        auc: resultAuc != null ? `${resultAuc.toFixed(3)}` : result[0]?.metric ?? "—",
        acc: "—",
        f1: "—",
        status: "最优模型",
      },
      ...result.slice(0, 4).map((r, i) => ({
        rank: i + 2,
        model: r.factor,
        type: "Radiomics",
        auc: r.metric,
        acc: "—",
        f1: "—",
        status: "特征",
      })),
    ];
  }, [result, resultAuc, strategyId]);

  const handleRadiomicsComplete = useCallback(
    (rows: ResearchResultRow[], summary: string, auc?: number) => {
      setResult(rows);
      setResultSummary(summary);
      setResultAuc(auc ?? null);
      const nMatch = summary?.match(/n=(\d+)/);
      setSampleN(nMatch ? parseInt(nMatch[1], 10) : caseCount || 1);
      setSaved(true);
      setAgentStep("eval");
      setEvalTab("roc");
      const payload: ModuleAnalysisResult = {
        module: "imaging",
        taskId: strategyId === "deeplearn" ? "deeplearn" : "radiomics",
        taskTitle: strategyId === "deeplearn" ? "深度学习特征学习" : "影像组学特征筛选",
        ranAt: new Date().toISOString(),
        rows,
        summary,
        auc,
      };
      saveModuleResult(payload);
      message.success("分析完成，结果已保存，可在多模态模块中关联使用");
    },
    [message, strategyId],
  );

  function goStep(key: string) {
    setAgentStep(key);
    document.getElementById(`img-agent-${key}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function applyNlPlan() {
    setClinicalQuestion((q) => ({
      ...applyQuestionTemplate("genotype_binary", q),
      hypothesis: nlInput,
    }));
    goStep("data");
    message.success("已生成分析方案，请确认数据与 ROI");
  }

  const statusMessage =
    caseCount > 0
      ? `数据检索完成：共 ${caseCount} 例，可用影像 ${imageCount} 例${batchRoiMode ? "（批量预勾画 ROI 模式）" : ""}。`
      : radiomicsAnnotatedImage
        ? "已关联工作台智能分析标注图，可直接进入组学流程。"
        : "尚未匹配病例：请从患者库批量选择，或在下方上传 DICOM / NIfTI。";

  return (
    <div className="pmp-research-wb pmp-imaging-agent-page pmp-img-agent-page">
      <div className="pmp-research-wb-header" style={{ borderLeftColor: ACCENT }}>
        <div>
          <Link to="/knowledge/data">
            <Button type="text" icon={<ArrowLeftOutlined />} size="small">
              返回模块选择
            </Button>
          </Link>
          <Title level={4} style={{ margin: "8px 0 4px" }}>
            影像数据智能分析
          </Title>
          <Paragraph type="secondary" style={{ margin: 0, fontSize: 13 }}>
            {batchRoiMode
              ? "智能分析 Agent · 批量预勾画 ROI 模式，直接进行 Radiomics 特征建模"
              : "智能分析 Agent · 基于 DICOM 分割或标注图进行 Radiomics / 深度学习建模"}
          </Paragraph>
          <Space style={{ marginTop: 8 }}>
            <Tag color="green">已连接：影像科研数据库</Tag>
            <Tag color="blue">智能分析 Agent</Tag>
          </Space>
        </div>
        <Space>
          <Button icon={<FileTextOutlined />} disabled={!saved}>
            生成报告
          </Button>
          <Button type="primary" icon={<ExportOutlined />} disabled={!saved}>
            导出
          </Button>
        </Space>
      </div>

      {batchPatients.length ? (
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 12 }}
          message={
            batchRoiMode
              ? `批量预勾画 ROI · ${batchRadiomicsImages.length} 例（跳过智能分析接口）`
              : `已从患者库批量带入 ${batchPatients.length} 例（可用影像 ${batchRadiomicsImages.length} 例）`
          }
        />
      ) : null}

      <ImagingAgentStepBar steps={IMAGING_AGENT_STEPS} activeKey={agentStep} completedKeys={completedSteps} onChange={goStep} />

      <div className="pmp-imaging-agent-body">
        <div className="pmp-imaging-agent-main pmp-mm-agent-main">
          <section id="img-agent-input" className="pmp-mm-agent-section pmp-card">
            <div className="pmp-mm-agent-section-head">
              <SectionBadge n={1} />
              <div className="pmp-panel-title" style={{ margin: 0 }}>
                自然语言输入分析目标
              </div>
            </div>
            <Input.TextArea rows={3} value={nlInput} onChange={(e) => setNlInput(e.target.value)} />
            <Button type="primary" style={{ marginTop: 12 }} onClick={applyNlPlan}>
              AI 生成分析方案
            </Button>
            <div className="pmp-mm-agent-understanding">
              <Text type="secondary" style={{ fontSize: 12, display: "block", marginBottom: 8 }}>
                AI 任务理解结果
              </Text>
              <div className="pmp-mm-agent-understanding-grid pmp-img-agent-understanding-grid">
                {understanding.map((row) => (
                  <div key={row.label} className="pmp-mm-agent-understanding-cell">
                    <span className="pmp-mm-agent-understanding-label">{row.label}</span>
                    <span className="pmp-mm-agent-understanding-value">{row.value}</span>
                  </div>
                ))}
              </div>
            </div>
            <div style={{ marginTop: 16 }}>
              <ClinicalQuestionPanel value={clinicalQuestion} onChange={setClinicalQuestion} suggestedTaskId="radiomics" />
            </div>
          </section>

          <section id="img-agent-data" className="pmp-mm-agent-section pmp-card">
            <div className="pmp-mm-agent-section-head">
              <SectionBadge n={2} />
              <div style={{ flex: 1 }}>
                <div className="pmp-panel-title" style={{ margin: 0 }}>
                  自动检索患者数据
                </div>
                <Space size={8} style={{ marginTop: 4 }}>
                  <Tag color="blue">{clinicalQuestion.targetField}</Tag>
                  <Tag color={caseCount || radiomicsAnnotatedImage ? "success" : "default"}>
                    {caseCount || radiomicsAnnotatedImage ? "检索完成" : "待数据"}
                  </Tag>
                </Space>
              </div>
            </div>
            <div className="pmp-img-agent-data-stats">
              {dataStats.map((s) => (
                <div key={s.label} className="pmp-imaging-agent-data-stat">
                  <div className="pmp-imaging-agent-data-stat-value" style={{ color: ACCENT }}>
                    {s.value}
                  </div>
                  <div className="pmp-imaging-agent-data-stat-label">
                    {s.label}
                    {s.sub ? <span className="pmp-img-agent-stat-sub"> · {s.sub}</span> : null}
                  </div>
                </div>
              ))}
            </div>
            <div className="pmp-img-agent-preview-row">
              <div>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  数据预览
                </Text>
                {batchRadiomicsImages.length > 1 ? (
                  <div style={{ marginTop: 8 }}>
                    <BatchImageNavigator images={batchRadiomicsImages} fallbackBase64={radiomicsAnnotatedImage} />
                  </div>
                ) : (
                  <div className="pmp-img-agent-ct-grid">
                    {(batchRadiomicsImages.length
                      ? batchRadiomicsImages.slice(0, 4)
                      : radiomicsAnnotatedImage
                        ? [{ id: "workflow", label: "工作台标注", base64: radiomicsAnnotatedImage }]
                        : []
                    ).map((img) => (
                      <CtPreviewThumb key={img.id} img={img} />
                    ))}
                    {!batchRadiomicsImages.length && !radiomicsAnnotatedImage
                      ? [0, 1, 2, 3].map((i) => <CtPreviewThumb key={i} />)
                      : null}
                  </div>
                )}
              </div>
              {gradeDist ? (
                <DonutChart
                  positiveLabel={gradeDist.positiveLabel}
                  negativeLabel={gradeDist.negativeLabel}
                  positivePct={gradeDist.positivePct}
                />
              ) : (
                <div className="pmp-mm-agent-eval-placeholder" style={{ minHeight: 120 }}>
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    导入带病理分级标签的批量数据后显示分布
                  </Text>
                </div>
              )}
            </div>
          </section>

          <section id="img-agent-strategy" className="pmp-mm-agent-section pmp-card">
            <div className="pmp-mm-agent-section-head">
              <SectionBadge n={3} />
              <div className="pmp-panel-title" style={{ margin: 0 }}>
                推荐分析策略
              </div>
            </div>
            <div className="pmp-img-agent-strategy-cards">
              {IMAGING_STRATEGIES.map((s) => {
                const active = strategyId === s.id;
                return (
                  <button
                    key={s.id}
                    type="button"
                    className={`pmp-img-agent-strategy-card${active ? " pmp-img-agent-strategy-card--active" : ""}`}
                    onClick={() => setStrategyId(s.id as StrategyId)}
                  >
                    {active ? (
                      <span className="pmp-img-agent-strategy-check">
                        <CheckOutlined />
                      </span>
                    ) : null}
                    <div className="pmp-img-agent-strategy-title">{s.title}</div>
                    <div className="pmp-img-agent-strategy-desc">{s.desc}</div>
                    <Tag color={active ? "blue" : "default"} style={{ marginTop: 8 }}>
                      {s.mins}
                    </Tag>
                  </button>
                );
              })}
            </div>
          </section>

          <section id="img-agent-train" className="pmp-mm-agent-section pmp-card">
            <div className="pmp-mm-agent-section-head">
              <SectionBadge n={4} />
              <div style={{ flex: 1 }}>
                <div className="pmp-panel-title" style={{ margin: 0 }}>
                  AutoML 自动建模进度
                </div>
                <Progress percent={progressPct} size="small" strokeColor={ACCENT} style={{ maxWidth: 280, marginTop: 8 }} />
                <Text type="secondary" style={{ fontSize: 11 }}>
                  {progressLabel}
                </Text>
              </div>
            </div>
            <div className="pmp-img-agent-automl-track">
              {IMAGING_AUTOML_STEPS.map((label, i) => {
                const activeIdx = saved ? IMAGING_AUTOML_STEPS.length - 1 : Math.min(pipelineStep + 2, IMAGING_AUTOML_STEPS.length - 2);
                return (
                  <div
                    key={label}
                    className={`pmp-img-agent-automl-step${i <= activeIdx ? " pmp-img-agent-automl-step--done" : ""}${i === activeIdx + 1 ? " pmp-img-agent-automl-step--active" : ""}`}
                  >
                    {label}
                  </div>
                );
              })}
            </div>

            <RadiomicsPipeline
              accent={ACCENT}
              light={LIGHT}
              annotatedImageBase64={batchRoiMode ? null : radiomicsAnnotatedImage}
              batchImages={batchRadiomicsImages}
              batchRoiMode={batchRoiMode}
              pathologyGrade={radiomicsPathologyGrade}
              clinicalQuestion={clinicalQuestion}
              onComplete={handleRadiomicsComplete}
              onStepChange={setPipelineStep}
            />

            {modelRows.length ? (
              <Table
                size="small"
                pagination={false}
                style={{ marginTop: 16 }}
                rowKey="rank"
                dataSource={modelRows}
                columns={[
                  { title: "排名", dataIndex: "rank", width: 48 },
                  { title: "模型", dataIndex: "model", width: 120 },
                  { title: "分析类型", dataIndex: "type", width: 110 },
                  { title: "AUC / 指标", dataIndex: "auc", width: 120 },
                  { title: "状态", dataIndex: "status", render: (v: string) => <Tag color="blue">{v}</Tag> },
                ]}
              />
            ) : (
              <Paragraph type="secondary" style={{ fontSize: 12, marginTop: 12 }}>
                完成上方组学流程后，此处将显示模型结果与特征排名。
              </Paragraph>
            )}
            {resultSummary ? (
              <Paragraph type="secondary" style={{ fontSize: 12, marginTop: 8 }}>
                {resultSummary}
              </Paragraph>
            ) : null}
          </section>

          <section id="img-agent-eval" className="pmp-mm-agent-section pmp-card">
            <div className="pmp-mm-agent-section-head">
              <SectionBadge n={5} />
              <div className="pmp-panel-title" style={{ margin: 0 }}>
                模型评估与可解释性
              </div>
            </div>
            <Tabs
              activeKey={evalTab}
              onChange={(key) => setEvalTab(key as EvalTabKey)}
              size="small"
              items={[
                { key: "roc", label: "ROC 曲线" },
                { key: "cal", label: "校准曲线" },
                { key: "dca", label: "决策曲线" },
                { key: "cm", label: "混淆矩阵" },
                { key: "fi", label: "特征重要性" },
              ]}
            />
            <div className="pmp-mm-agent-eval-grid">
              <div className="pmp-mm-agent-eval-chart">
                {evalTab === "fi" && result?.length ? (
                  <FeatureImportanceChart rows={result} />
                ) : (
                  <ModelEvalChartPanel
                    tab={evalTab === "fi" ? "roc" : evalTab}
                    auc={displayAuc}
                    sampleN={sampleN || caseCount || 1}
                    accent={ACCENT}
                    hasResult={Boolean(result?.length && saved)}
                  />
                )}
              </div>
              {evalTab !== "fi" ? <FeatureImportanceChart rows={result ?? []} /> : null}
            </div>
          </section>

          <section id="img-agent-validate" className="pmp-mm-agent-section pmp-card">
            <div className="pmp-mm-agent-section-head">
              <SectionBadge n={6} />
              <div className="pmp-panel-title" style={{ margin: 0 }}>
                外部验证
              </div>
            </div>
            <Space style={{ marginBottom: 12 }}>
              <Button icon={<UploadOutlined />}>上传验证集 CSV</Button>
            </Space>
            <Paragraph type="secondary" style={{ fontSize: 12 }}>
              上传独立验证集（含结局变量与预测特征）后，可在此对比 AUC 与校准曲线。
            </Paragraph>
          </section>

          <section id="img-agent-feedback" className="pmp-mm-agent-section pmp-card">
            <div className="pmp-mm-agent-section-head">
              <SectionBadge n={7} />
              <div className="pmp-panel-title" style={{ margin: 0 }}>
                模型反馈与知识更新
              </div>
            </div>
            <Space wrap style={{ marginTop: 8 }}>
              <Button type="primary" disabled={!saved}>
                加入知识库
              </Button>
              <Button disabled={!saved}>增量学习</Button>
              <Button disabled={!saved}>更新模型版本</Button>
            </Space>
            {saved ? (
              <Paragraph type="secondary" style={{ fontSize: 11, marginTop: 12, marginBottom: 0 }}>
                结果已保存 · 可在「多模态联合分析」模块自动关联 · {new Date().toLocaleString("zh-CN")}
              </Paragraph>
            ) : (
              <Paragraph type="secondary" style={{ fontSize: 11, marginTop: 12, marginBottom: 0 }}>
                完成组学建模后，可将结果加入知识库供后续多模态融合使用。
              </Paragraph>
            )}
          </section>
        </div>

        <ImagingAgentAssistantPanel
          taskSummary={clinicalQuestionSummaryText(clinicalQuestion)}
          progressPct={progressPct}
          progressLabel={progressLabel}
          statusMessage={statusMessage}
          onStartAnalysis={() => goStep("train")}
          onRescan={() => goStep("data")}
        />
      </div>
    </div>
  );
}
