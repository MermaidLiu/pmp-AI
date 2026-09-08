import { ArrowLeftOutlined, ExportOutlined, FileTextOutlined, LinkOutlined } from "@ant-design/icons";
import { App, Alert, Button, Checkbox, Input, Progress, Radio, Space, Table, Tabs, Tag, Typography } from "antd";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import type { PlatformPatient } from "../../api/platform";
import { platformRunResearch } from "../../api/platform";
import type { ModuleAnalysisResult, ResearchResultRow } from "../../data/researchWorkbenchMock";
import {
  applyQuestionTemplate,
  clinicalQuestionSummaryText,
  clinicalQuestionToIndicators,
  defaultClinicalQuestion,
  type ClinicalQuestion,
} from "../../data/clinicalQuestions";
import { MULTIMODAL_AGENT_STEPS } from "../../data/agentSteps";
import {
  MULTIMODAL_AUTOML_STEPS,
  MULTIMODAL_FUSION_METHODS,
  MULTIMODAL_NL_PROMPT,
  MULTIMODAL_STRATEGIES,
} from "../../data/multimodalAgentMock";
import { MULTIMODAL_FIELDS } from "../../data/researchWorkbenchMock";
import { hasAnnotatedImage, imageSrcFromBase64 } from "../../lib/pathologyImage";
import { loadPathologyImage } from "../../lib/pathologyImagingCache";
import {
  buildFusionModelRanking,
  buildModalityContribution,
  computeIntegrity,
  computeMultimodalStats,
  extractAuc,
  firstPatientClinicalPreview,
  strategyToTaskId,
} from "../../lib/multimodalAgentData";
import { fetchMergedPlatformPatients } from "../../lib/platformPatientList";
import { getPathologyImagingOrNull } from "../../lib/platformSession";
import { loadModuleResults, saveModuleResult } from "../../lib/researchModuleResults";
import { getResearchBatchPatients, loadResearchBatchContext } from "../../lib/researchBatchContext";
import { buildResearchWorkflowPayload, getWorkflowContext } from "../../lib/workflowContext";
import ClinicalQuestionPanel from "./ClinicalQuestionPanel";
import ImagingAgentStepBar from "./ImagingAgentStepBar";
import { ModelEvalChartPanel, resolveDisplayAuc, type EvalTabKey } from "./ModelEvalCharts";
import MultimodalAgentAssistant from "./MultimodalAgentAssistant";

const { Title, Text, Paragraph } = Typography;

const ACCENT = "#7c3aed";

function SectionBadge({ n }: { n: number }) {
  return <span className="pmp-mm-agent-section-badge">{n}</span>;
}

function isModelFactorRow(row: ResearchResultRow): boolean {
  const skip = ["临床问题", "工作台", "DICOM", "上传", "影像诊断分析接口"];
  return !skip.some((s) => row.factor.includes(s));
}

function FeatureImportanceChart({ items }: { items: { name: string; pct: number; mod?: string }[] }) {
  const max = items[0]?.pct ?? 100;
  if (!items.length) {
    return (
      <div className="pmp-mm-agent-eval-placeholder">
        <Text type="secondary">运行融合分析后显示模态贡献度</Text>
      </div>
    );
  }
  return (
    <div className="pmp-mm-agent-feature-bars">
      <Text type="secondary" style={{ fontSize: 12 }}>
        模态 / 特征贡献度
      </Text>
      {items.map((f) => (
        <div key={f.name} className="pmp-mm-agent-feature-row">
          <div className="pmp-mm-agent-feature-meta">
            <span className="pmp-mm-agent-feature-name">{f.name}</span>
            {f.mod ? (
              <Tag color="purple" style={{ margin: 0, fontSize: 10 }}>
                {f.mod}
              </Tag>
            ) : (
              <span style={{ fontSize: 11, color: "#64748b" }}>{f.pct}%</span>
            )}
          </div>
          <div className="pmp-mm-agent-feature-track">
            <div className="pmp-mm-agent-feature-fill" style={{ width: `${(f.pct / max) * 100}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function ModalityPreviewCard({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return (
    <div className="pmp-mm-agent-modality-card">
      <div className="pmp-mm-agent-modality-head">
        <Text strong style={{ fontSize: 12 }}>{title}</Text>
        <Text type="secondary" style={{ fontSize: 10 }}>{subtitle}</Text>
      </div>
      <div className="pmp-mm-agent-modality-body">{children}</div>
    </div>
  );
}

function CtPreview({ imageBase64 }: { imageBase64?: string | null }) {
  if (imageBase64 && hasAnnotatedImage(imageBase64)) {
    return (
      <div className="pmp-mm-agent-ct-preview">
        <img src={imageSrcFromBase64(imageBase64)} alt="CT 标注" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      </div>
    );
  }
  return (
    <div className="pmp-mm-agent-ct-preview">
      <div className="pmp-mm-agent-ct-lung" />
      <div className="pmp-mm-agent-ct-roi" />
    </div>
  );
}

function WsiPreview() {
  return (
    <div className="pmp-mm-agent-wsi-preview">
      {Array.from({ length: 48 }).map((_, i) => (
        <span key={i} style={{ background: `hsl(${280 + (i % 6) * 8}, ${45 + (i % 4) * 10}%, ${55 + (i % 5) * 6}%)` }} />
      ))}
    </div>
  );
}

function GeneHeatmap({ genes }: { genes: string[] }) {
  const colors = ["#7c3aed", "#a78bfa", "#c4b5fd", "#ddd6fe", "#ede9fe"];
  return (
    <div className="pmp-mm-agent-gene-grid">
      {genes.map((gene) => (
        <div key={gene} className="pmp-mm-agent-gene-col">
          <Text style={{ fontSize: 9, color: "#64748b" }}>{gene}</Text>
          <div className="pmp-mm-agent-gene-cells">
            {colors.map((c, i) => (
              <span key={i} style={{ background: c }} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function StabilityGauge({ score }: { score: number }) {
  return (
    <div className="pmp-mm-agent-gauge">
      <svg viewBox="0 0 120 70" aria-label="模型稳定性">
        <path d="M 15 60 A 45 45 0 0 1 105 60" fill="none" stroke="#e2e8f0" strokeWidth="8" strokeLinecap="round" />
        <path
          d="M 15 60 A 45 45 0 0 1 105 60"
          fill="none"
          stroke={ACCENT}
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray="141 141"
          strokeDashoffset={141 - (score / 100) * 141}
        />
        <text x="60" y="52" textAnchor="middle" fontSize="18" fontWeight="700" fill={ACCENT}>
          {score}
        </text>
      </svg>
    </div>
  );
}

export default function MultimodalAgentWorkbench() {
  const { message } = App.useApp();
  const [agentStep, setAgentStep] = useState("input");
  const [nlInput, setNlInput] = useState(MULTIMODAL_NL_PROMPT);
  const [strategyId, setStrategyId] = useState("full");
  const [fusionMethods, setFusionMethods] = useState(
    () => new Set(MULTIMODAL_FUSION_METHODS.filter((m) => m.checked).map((m) => m.id)),
  );
  const [evalTab, setEvalTab] = useState<EvalTabKey>("roc");
  const [clinicalQuestion, setClinicalQuestion] = useState<ClinicalQuestion>(() =>
    defaultClinicalQuestion("genotype_binary"),
  );
  const [patients, setPatients] = useState<PlatformPatient[]>([]);
  const [loadingPatients, setLoadingPatients] = useState(true);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [linked, setLinked] = useState<{ clinical?: ModuleAnalysisResult; imaging?: ModuleAnalysisResult }>({});
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<ResearchResultRow[] | null>(null);
  const [resultSummary, setResultSummary] = useState("");
  const [resultAuc, setResultAuc] = useState<number | null>(null);
  const [sampleN, setSampleN] = useState(0);
  const [saved, setSaved] = useState(false);

  const batchCtx = loadResearchBatchContext();
  const workflow = getWorkflowContext();
  const pathology = getPathologyImagingOrNull();

  const reloadData = useCallback(async () => {
    setLoadingPatients(true);
    try {
      const list = await fetchMergedPlatformPatients();
      const ctx = loadResearchBatchContext();
      if (ctx?.clinical.length) {
        const ids = new Set(ctx.clinical.flatMap((p) => [p.id, p.examId || ""].filter(Boolean)));
        const scoped = list.filter(
          (p) => ids.has(p.id) || (p.examId && ids.has(p.examId)) || ids.has(p.admissionId),
        );
        setPatients(scoped.length ? scoped : list);
      } else {
        setPatients(list);
      }
      setLinked(loadModuleResults());

      const imagingBatch = getResearchBatchPatients("imaging");
      const firstExam = imagingBatch[0]?.examId;
      if (firstExam) {
        const img = await loadPathologyImage(firstExam);
        if (img) setPreviewImage(img);
      } else if (pathology?.result_image_base64) {
        setPreviewImage(pathology.result_image_base64);
      } else {
        setPreviewImage(null);
      }
    } finally {
      setLoadingPatients(false);
    }
  }, [pathology?.result_image_base64]);

  useEffect(() => {
    void reloadData();
    const savedMm = loadModuleResults().multimodal;
    if (savedMm?.rows?.length) {
      setResult(savedMm.rows);
      setResultSummary(savedMm.summary);
      setResultAuc(savedMm.auc ?? extractAuc(savedMm));
      const nMatch = savedMm.summary?.match(/n=(\d+)/);
      setSampleN(nMatch ? parseInt(nMatch[1], 10) : 10);
      setSaved(true);
      setAgentStep("eval");
    }
  }, [reloadData]);

  const taskId = strategyToTaskId(strategyId);
  const fusionLabel =
    fusionMethods.has("feature") ? "Feature-level" : fusionMethods.has("model") ? "Model-level" : "Decision-level";

  const dataStats = useMemo(() => computeMultimodalStats(patients, batchCtx), [patients, batchCtx]);
  const integrity = useMemo(() => computeIntegrity(patients, batchCtx), [patients, batchCtx]);
  const samplePatient = patients[0];
  const clinicalPreview = useMemo(() => firstPatientClinicalPreview(samplePatient), [samplePatient]);

  const geneLabels = useMemo(() => {
    const fromPatients = [...new Set(patients.map((p) => p.gene).filter((g) => g && g !== "—"))].slice(0, 4);
    return fromPatients.length ? fromPatients : ["EGFR", "KRAS", "ALK", "TP53"];
  }, [patients]);

  const understanding = useMemo(
    () => [
      { label: "疾病", value: samplePatient?.diagnosis && samplePatient.diagnosis !== "待诊断" ? samplePatient.diagnosis : "肺腺癌" },
      { label: "目标", value: clinicalQuestion.targetField },
      { label: "类型", value: clinicalQuestion.outcomeType === "binary" ? "二分类" : clinicalQuestion.outcomeType },
      {
        label: "组合",
        value: MULTIMODAL_STRATEGIES.find((s) => s.id === strategyId)?.title ?? "影像 + 临床 + 病理",
      },
      { label: "方法", value: "多模态融合建模" },
    ],
    [clinicalQuestion, strategyId, samplePatient],
  );

  const modalityContribution = useMemo(() => {
    const analysisRows = (result ?? []).filter(isModelFactorRow);
    return buildModalityContribution(linked, analysisRows.length ? analysisRows : (result ?? []));
  }, [linked, result]);

  const displayAuc = useMemo(
    () => resolveDisplayAuc(resultAuc, result, sampleN || patients.length),
    [resultAuc, result, sampleN, patients.length],
  );

  const modelRanking = useMemo(
    () => buildFusionModelRanking(linked, result, fusionLabel, displayAuc),
    [linked, result, fusionLabel, displayAuc],
  );

  const featureChartItems = useMemo(
    () =>
      modalityContribution.map((m) => ({
        name: m.name,
        pct: m.pct,
        mod: m.note?.slice(0, 12),
      })),
    [modalityContribution],
  );

  const progressPct = useMemo(() => {
    if (saved && result) return 100;
    if (running) return 75;
    if (linked.clinical && linked.imaging) return 50;
    if (patients.length) return 30;
    return 10;
  }, [saved, result, running, linked, patients.length]);

  const progressLabel = saved
    ? "融合建模完成"
    : running
      ? "正在调用后端融合分析…"
      : linked.clinical && linked.imaging
        ? "已关联临床与影像模块，可运行融合"
        : patients.length
          ? "数据已检索，建议先完成临床/影像模块"
          : "正在加载患者库…";

  const completedSteps = useMemo(() => {
    const done: string[] = ["input"];
    if (patients.length) done.push("data");
    if (strategyId) done.push("strategy");
    if (running || result) done.push("train");
    if (result) done.push("eval");
    if (saved) done.push("validate", "feedback");
    return done;
  }, [patients.length, strategyId, running, result, saved]);

  const reasoning = useMemo(() => {
    const steps = [
      "理解研究目标与预测类型",
      patients.length ? `检索患者库 ${patients.length} 例` : "连接患者数据库",
      linked.clinical ? `已加载临床模块：${linked.clinical.taskTitle}` : "临床模块结果待补充",
      linked.imaging ? `已加载影像模块：${linked.imaging.taskTitle}` : "影像模块结果待补充",
      result ? "多模态融合建模完成" : "等待运行融合分析",
    ];
    return steps;
  }, [patients.length, linked, result]);

  const statusMessage = useMemo(() => {
    const n = patients.length;
    if (loadingPatients) return "正在从患者数据库检索多模态病例…";
    if (!n) return "患者库暂无数据，请先在临床/影像模块运行分析或导入批量队列。";
    const paired = Math.min(
      parseInt(dataStats.find((s) => s.label === "影像")?.value ?? "0", 10) || 0,
      n,
    );
    return `数据检索完成：共 ${n} 例，多模态可配对约 ${paired} 例。${linked.clinical && linked.imaging ? " 临床与影像模块结果已就绪。" : ""}`;
  }, [loadingPatients, patients.length, dataStats, linked]);

  function goStep(key: string) {
    setAgentStep(key);
    document.getElementById(`mm-agent-${key}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function applyNlPlan() {
    setClinicalQuestion((q) => ({
      ...applyQuestionTemplate("genotype_binary", q),
      hypothesis: nlInput,
    }));
    goStep("data");
    message.success("已生成分析方案");
  }

  function toggleFusion(id: string, checked: boolean) {
    setFusionMethods((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  async function runFusion() {
    setRunning(true);
    setSaved(false);
    try {
      const res = await platformRunResearch({
        module: "multimodal",
        task_id: taskId,
        fields: MULTIMODAL_FIELDS.slice(0, 6),
        indicators: {
          ...clinicalQuestionToIndicators(clinicalQuestion),
          fusion_method: fusionLabel,
          linked_clinical: linked.clinical?.taskTitle ?? "",
          linked_imaging: linked.imaging?.taskTitle ?? "",
        },
        workflow_context: buildResearchWorkflowPayload(workflow),
      });

      const rows = res.rows as ResearchResultRow[];
      const auc =
        res.auc ??
        rows
          .map((r) => {
            const m = r.metric?.match(/AUC[=:]?\s*([\d.]+)/i);
            return m ? parseFloat(m[1]) : null;
          })
          .find((v) => v != null) ??
        null;
      const n = res.n || patients.length || 10;

      setResult(rows);
      setResultSummary(res.summary);
      setResultAuc(auc);
      setSampleN(n);
      setSaved(true);
      setAgentStep("eval");
      setEvalTab("roc");

      saveModuleResult({
        module: "multimodal",
        taskId,
        taskTitle: res.task_title,
        ranAt: new Date().toISOString(),
        rows,
        summary: res.summary,
        auc: resolveDisplayAuc(auc, rows, n),
      });

      message.success("多模态融合分析完成，结果已保存");
    } catch (e) {
      message.error(e instanceof Error ? e.message : "融合分析失败");
    } finally {
      setRunning(false);
    }
  }

  const stabilityScore = saved ? Math.min(95, Math.round(80 + displayAuc * 10)) : null;

  return (
    <div className="pmp-research-wb pmp-imaging-agent-page pmp-multimodal-agent-page pmp-mm-agent-page">
      <div className="pmp-research-wb-header" style={{ borderLeftColor: ACCENT }}>
        <div>
          <Link to="/knowledge/data">
            <Button type="text" icon={<ArrowLeftOutlined />} size="small">
              返回模块选择
            </Button>
          </Link>
          <Title level={4} style={{ margin: "8px 0 4px" }}>
            多模态分析 Agent
          </Title>
          <Paragraph type="secondary" style={{ margin: 0, fontSize: 13 }}>
            融合影像、临床、病理与组学数据，构建联合预测模型并解释各模态贡献度。
          </Paragraph>
          <Space style={{ marginTop: 8 }}>
            <Tag color="green">已连接：多模态科研数据库</Tag>
            <Tag color="purple">多模态分析 Agent</Tag>
            {batchCtx ? <Tag icon={<LinkOutlined />}>{batchCtx.label}</Tag> : null}
          </Space>
        </div>
        <Space>
          <Button icon={<FileTextOutlined />} disabled={!saved}>
            生成报告
          </Button>
          <Button type="primary" icon={<ExportOutlined />} disabled={!saved} style={{ background: ACCENT }}>
            导出
          </Button>
        </Space>
      </div>

      {!linked.clinical || !linked.imaging ? (
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 12 }}
          message="多模态融合可关联临床与影像模块结果"
          description={
            <span>
              请先在 <Link to="/knowledge/data/clinical">临床模块</Link> 与{" "}
              <Link to="/knowledge/data/imaging">影像模块</Link> 各运行一次分析并保存，返回此处运行融合可获得更完整对比。
              {linked.clinical || linked.imaging ? "（部分模块结果待补充）" : ""}
            </span>
          }
        />
      ) : null}

      <ImagingAgentStepBar steps={MULTIMODAL_AGENT_STEPS} activeKey={agentStep} completedKeys={completedSteps} onChange={goStep} />

      <div className="pmp-imaging-agent-body">
        <div className="pmp-imaging-agent-main pmp-mm-agent-main">
          <section id="mm-agent-input" className="pmp-mm-agent-section pmp-card">
            <div className="pmp-mm-agent-section-head">
              <SectionBadge n={1} />
              <div className="pmp-panel-title" style={{ margin: 0 }}>
                自然语言输入分析目标
              </div>
            </div>
            <Input.TextArea rows={3} value={nlInput} onChange={(e) => setNlInput(e.target.value)} />
            <Button type="primary" style={{ marginTop: 12, background: ACCENT }} onClick={applyNlPlan}>
              AI 生成分析方案
            </Button>
            <div className="pmp-mm-agent-understanding">
              <Text type="secondary" style={{ fontSize: 12, display: "block", marginBottom: 8 }}>
                AI 理解结果
              </Text>
              <div className="pmp-mm-agent-understanding-grid">
                {understanding.map((row) => (
                  <div key={row.label} className="pmp-mm-agent-understanding-cell">
                    <span className="pmp-mm-agent-understanding-label">{row.label}</span>
                    <span className="pmp-mm-agent-understanding-value">{row.value}</span>
                  </div>
                ))}
              </div>
            </div>
            <div style={{ marginTop: 16 }}>
              <ClinicalQuestionPanel
                value={clinicalQuestion}
                onChange={setClinicalQuestion}
                suggestedTaskId={taskId}
              />
            </div>
          </section>

          <section id="mm-agent-data" className="pmp-mm-agent-section pmp-card">
            <div className="pmp-mm-agent-section-head">
              <SectionBadge n={2} />
              <div style={{ flex: 1 }}>
                <div className="pmp-panel-title" style={{ margin: 0 }}>
                  多模态数据检索与整合
                </div>
                <Space size={8} style={{ marginTop: 4 }}>
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    来源：患者数据库{batchCtx ? " + 科研队列" : ""}
                  </Text>
                  <Tag color={patients.length ? "success" : "default"}>{loadingPatients ? "检索中" : patients.length ? "检索完成" : "无数据"}</Tag>
                  <Tag color="purple">{clinicalQuestion.targetField}</Tag>
                </Space>
              </div>
            </div>
            <div className="pmp-mm-agent-data-stats">
              {dataStats.map((s) => (
                <div key={s.label} className="pmp-imaging-agent-data-stat">
                  <div className="pmp-imaging-agent-data-stat-value" style={{ color: ACCENT }}>
                    {s.value}
                  </div>
                  <div className="pmp-imaging-agent-data-stat-label">{s.label}</div>
                </div>
              ))}
            </div>
            <div className="pmp-mm-agent-modality-grid">
              <ModalityPreviewCard title="影像 (CT)" subtitle={`${dataStats[1]?.value ?? "—"} 例`}>
                <CtPreview imageBase64={previewImage ?? pathology?.result_image_base64} />
              </ModalityPreviewCard>
              <ModalityPreviewCard title="临床数据" subtitle={samplePatient ? `${samplePatient.name}` : "结构化字段"}>
                <div className="pmp-mm-agent-clinical-kv">
                  {clinicalPreview.map((row) => (
                    <div key={row.k}>
                      <span>{row.k}</span>
                      <strong>{row.v}</strong>
                    </div>
                  ))}
                </div>
              </ModalityPreviewCard>
              <ModalityPreviewCard title="病理 (WSI)" subtitle={`${dataStats[3]?.value ?? "—"} 例有分级`}>
                <WsiPreview />
              </ModalityPreviewCard>
              <ModalityPreviewCard title="基因数据" subtitle={`${dataStats[4]?.value ?? "—"} 例`}>
                <GeneHeatmap genes={geneLabels} />
              </ModalityPreviewCard>
            </div>
            <div className="pmp-mm-agent-integrity">
              {integrity.map((item) => (
                <span key={item.label}>
                  {item.label} {item.pct}%
                </span>
              ))}
              <Link to="/db/patients">
                <Button type="link" size="small" style={{ padding: 0, marginLeft: "auto" }}>
                  查看数据详情
                </Button>
              </Link>
            </div>
          </section>

          <section id="mm-agent-strategy" className="pmp-mm-agent-section pmp-card">
            <div className="pmp-mm-agent-section-head">
              <SectionBadge n={3} />
              <div className="pmp-panel-title" style={{ margin: 0 }}>
                多模态策略选择
              </div>
            </div>
            <Radio.Group value={strategyId} onChange={(e) => setStrategyId(e.target.value)} className="pmp-mm-agent-strategy-list">
              {MULTIMODAL_STRATEGIES.map((s) => (
                <Radio key={s.id} value={s.id} className="pmp-mm-agent-strategy-item">
                  <span className="pmp-mm-agent-strategy-title">{s.title}</span>
                  {s.recommended ? <Tag color="purple">推荐</Tag> : null}
                  <Text type="secondary" style={{ fontSize: 11, marginLeft: 8 }}>
                    {s.desc}
                  </Text>
                </Radio>
              ))}
            </Radio.Group>
            <div className="pmp-mm-agent-fusion-methods">
              <Text type="secondary" style={{ fontSize: 12 }}>
                融合方式
              </Text>
              <Space wrap style={{ marginTop: 8 }}>
                {MULTIMODAL_FUSION_METHODS.map((m) => (
                  <Checkbox key={m.id} checked={fusionMethods.has(m.id)} onChange={(e) => toggleFusion(m.id, e.target.checked)}>
                    {m.label}
                  </Checkbox>
                ))}
              </Space>
            </div>
          </section>

          <section id="mm-agent-train" className="pmp-mm-agent-section pmp-card">
            <div className="pmp-mm-agent-section-head">
              <SectionBadge n={4} />
              <div style={{ flex: 1 }}>
                <div className="pmp-panel-title" style={{ margin: 0 }}>
                  多模态 AutoML 训练进度
                </div>
                <Progress percent={progressPct} size="small" strokeColor={ACCENT} style={{ maxWidth: 280, marginTop: 8 }} />
                <Text type="secondary" style={{ fontSize: 11 }}>
                  {progressLabel}
                </Text>
              </div>
            </div>
            <div className="pmp-mm-agent-automl-track">
              {MULTIMODAL_AUTOML_STEPS.map((label, i) => {
                const activeIdx = saved ? MULTIMODAL_AUTOML_STEPS.length - 1 : running ? 4 : linked.clinical && linked.imaging ? 2 : 0;
                return (
                  <div
                    key={label}
                    className={`pmp-mm-agent-automl-step${i <= activeIdx ? " pmp-mm-agent-automl-step--done" : ""}${i === activeIdx + 1 ? " pmp-mm-agent-automl-step--active" : ""}`}
                  >
                    {label}
                  </div>
                );
              })}
            </div>

            <Space wrap style={{ margin: "16px 0 12px" }}>
              <Button type="primary" loading={running} onClick={() => void runFusion()} style={{ background: ACCENT }}>
                运行多模态融合
              </Button>
              {linked.clinical ? <Tag>临床：{linked.clinical.taskTitle}</Tag> : null}
              {linked.imaging ? <Tag color="cyan">影像：{linked.imaging.taskTitle}</Tag> : null}
            </Space>

            {modelRanking.length ? (
              <Table
                size="small"
                pagination={false}
                rowKey="model"
                dataSource={modelRanking}
                columns={[
                  { title: "模型", dataIndex: "model", width: 100 },
                  { title: "融合方式", dataIndex: "fusion", width: 120 },
                  { title: "AUC / 指标", dataIndex: "auc", width: 150 },
                  { title: "Accuracy", dataIndex: "acc", width: 80 },
                  { title: "F1 Score", dataIndex: "f1", width: 80 },
                  {
                    title: "状态",
                    dataIndex: "status",
                    width: 88,
                    render: (v: string) => <Tag color={v === "最优模型" ? "purple" : "default"}>{v}</Tag>,
                  },
                ]}
              />
            ) : (
              <Paragraph type="secondary" style={{ fontSize: 12 }}>
                运行融合分析后，将对比单模态基线与融合模型表现。
              </Paragraph>
            )}
            {resultSummary ? (
              <Paragraph type="secondary" style={{ fontSize: 12, marginTop: 8 }}>
                {resultSummary}
              </Paragraph>
            ) : null}
          </section>

          <section id="mm-agent-eval" className="pmp-mm-agent-section pmp-card">
            <div className="pmp-mm-agent-section-head">
              <SectionBadge n={5} />
              <div className="pmp-panel-title" style={{ margin: 0 }}>
                模型性能评估与可解释性
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
              ]}
            />
            <div className="pmp-mm-agent-eval-grid">
              <div className="pmp-mm-agent-eval-chart">
                <ModelEvalChartPanel
                  tab={evalTab}
                  auc={displayAuc}
                  sampleN={sampleN || patients.length}
                  accent={ACCENT}
                  hasResult={Boolean(result?.length && saved)}
                />
              </div>
              <FeatureImportanceChart items={featureChartItems} />
            </div>
          </section>

          <section id="mm-agent-validate" className="pmp-mm-agent-section pmp-card">
            <div className="pmp-mm-agent-section-head">
              <SectionBadge n={6} />
              <div className="pmp-panel-title" style={{ margin: 0 }}>
                外部验证（多中心外部数据）
              </div>
            </div>
            <Paragraph type="secondary" style={{ fontSize: 12 }}>
              上传独立中心验证集 CSV，对比 ROC 与校准曲线（功能开发中）。
            </Paragraph>
          </section>

          <section id="mm-agent-feedback" className="pmp-mm-agent-section pmp-card">
            <div className="pmp-mm-agent-section-head">
              <SectionBadge n={7} />
              <div className="pmp-panel-title" style={{ margin: 0 }}>
                模型反馈与持续学习
              </div>
            </div>
            <div className="pmp-mm-agent-feedback-grid">
              <div className="pmp-mm-agent-feedback-gauge">
                <Text type="secondary" style={{ fontSize: 12 }}>
                  模型稳定性评分
                </Text>
                {stabilityScore != null ? (
                  <>
                    <StabilityGauge score={stabilityScore} />
                    <Text style={{ fontSize: 12 }}>
                      {stabilityScore} / 100（稳定）
                    </Text>
                  </>
                ) : (
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    完成融合后显示
                  </Text>
                )}
              </div>
              <div className="pmp-mm-agent-feedback-drift">
                <Text type="secondary" style={{ fontSize: 12 }}>
                  漂移检测
                </Text>
                <div className="pmp-mm-agent-psi">
                  PSI = <strong>{saved ? "0.16" : "—"}</strong>
                  {saved ? (
                    <Tag color="success" style={{ marginLeft: 8 }}>
                      无显著漂移
                    </Tag>
                  ) : null}
                </div>
                <Space wrap style={{ marginTop: 14 }}>
                  <Button type="primary" size="small" disabled={!saved} style={{ background: ACCENT }}>
                    加入知识库
                  </Button>
                  <Button size="small" disabled={!saved}>
                    增量学习
                  </Button>
                </Space>
              </div>
            </div>
            {saved ? (
              <Paragraph type="secondary" style={{ fontSize: 11, marginTop: 12, marginBottom: 0 }}>
                融合结果已保存 · {new Date().toLocaleString("zh-CN")}
              </Paragraph>
            ) : null}
          </section>
        </div>

        <MultimodalAgentAssistant
          taskSummary={clinicalQuestionSummaryText(clinicalQuestion)}
          progressPct={progressPct}
          progressLabel={progressLabel}
          statusMessage={statusMessage}
          reasoning={reasoning}
          onStartAnalysis={() => void runFusion()}
          onRescan={() => void reloadData()}
        />
      </div>
    </div>
  );
}
