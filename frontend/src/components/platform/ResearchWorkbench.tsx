import { ArrowLeftOutlined, ExportOutlined, FileTextOutlined, UploadOutlined } from "@ant-design/icons";
import { App, Alert, Button, Checkbox, Input, Space, Table, Tag, Typography, Upload } from "antd";
import type { UploadFile } from "antd/es/upload/interface";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import type { ModuleAnalysisResult, ResearchResultRow, ResearchTask } from "../../data/researchWorkbenchMock";
import type { IndicatorSpec } from "../../data/indicatorSpecs";
import { platformResearchGradeRun, platformRunResearch } from "../../api/platform";
import type { PathologyImagingGradeResult } from "../../api/platform";
import {
  filesToUploadFiles,
  getPendingDicomFiles,
  setPendingCaseFiles,
} from "../../lib/platformCaseUpload";
import { getPathologyImagingOrNull, hydratePathologyImagingResult } from "../../lib/platformSession";
import { consumeBatchSelection, type BatchPatientRef } from "../../lib/platformBatchSelection";
import { loadPathologyImage } from "../../lib/pathologyImagingCache";
import { getFollowUpBatchCase } from "../../lib/followUpBatchStore";
import { saveModuleResult } from "../../lib/researchModuleResults";
import { buildResearchWorkflowPayload, getWorkflowContext } from "../../lib/workflowContext";
import { hasAnnotatedImage, imageSrcFromBase64 } from "../../lib/pathologyImage";
import IndicatorInputPanel from "./IndicatorInputPanel";
import ClinicalQuestionPanel from "./ClinicalQuestionPanel";
import ImagingAgentAssistant from "./ImagingAgentAssistant";
import ImagingAgentStepBar from "./ImagingAgentStepBar";
import RadiomicsPipeline from "./RadiomicsPipeline";
import type { BatchImageItem } from "./BatchImageNavigator";
import WorkflowContextBanner from "./WorkflowContextBanner";
import {
  applyQuestionTemplate,
  clinicalQuestionSummaryText,
  clinicalQuestionToIndicators,
  defaultClinicalQuestion,
  type ClinicalQuestion,
} from "../../data/clinicalQuestions";
import {
  IMAGING_AGENT_ASSISTANT_MESSAGES,
  IMAGING_AGENT_REASONING,
  IMAGING_AGENT_STEPS,
  MULTIMODAL_AGENT_ASSISTANT_MESSAGES,
  MULTIMODAL_AGENT_REASONING,
  MULTIMODAL_AGENT_STEPS,
} from "../../data/agentSteps";

const { Title, Text, Paragraph } = Typography;

type Props = {
  moduleKey: "clinical" | "imaging" | "multimodal";
  title: string;
  subtitle: string;
  badge: string;
  theme: "navy" | "cyan" | "purple";
  dataTitle: string;
  fields: string[];
  tasks: ResearchTask[];
  methods: string[];
  resultMap: Record<string, ResearchResultRow[]>;
  stats: { label: string; value: string }[];
  outputs: string[];
  followUps: string[];
  indicatorSpecs?: Record<string, IndicatorSpec>;
  enablePathologyPlatform?: boolean;
  radiomicsAnnotatedImage?: string | null;
  radiomicsPathologyGrade?: string;
  initialTaskId?: string;
  batchPatients?: BatchPatientRef[];
  /** 批量导入仅含预勾画 ROI，不走智能分析接口 */
  batchRoiMode?: boolean;
  /** 影像分析 Agent 布局：顶部横向流程 + 右侧助手 */
  agentLayout?: boolean;
  extraCenter?: ReactNode;
  linkedBanner?: ReactNode;
};

const GRADE_DICOM_TASKS = new Set(["grade-pred", "grade-subtype"]);
const RADIOMICS_TASKS = new Set(["radiomics", "deeplearn"]);

const THEME = {
  navy: { accent: "#1e3a5f", light: "#eef4fb", tag: "blue" },
  cyan: { accent: "#0891b2", light: "#ecfeff", tag: "cyan" },
  purple: { accent: "#7c3aed", light: "#f5f3ff", tag: "purple" },
};

function BarChart({ rows }: { rows: ResearchResultRow[] }) {
  if (!rows.length) return null;
  const max = Math.max(...rows.map((r) => r.weight ?? 0), 1);
  return (
    <div style={{ marginTop: 12 }}>
      <Text type="secondary" style={{ fontSize: 12 }}>
        因素 / 特征贡献
      </Text>
      {rows.map((r) => (
        <div key={r.factor} style={{ marginTop: 8 }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
            <span>{r.factor}</span>
            <span>{r.weight ?? "—"}</span>
          </div>
          <div style={{ height: 6, background: "#f0f0f0", borderRadius: 3, marginTop: 4 }}>
            <div
              style={{
                width: `${((r.weight ?? 0) / max) * 100}%`,
                height: "100%",
                background: "#1677ff",
                borderRadius: 3,
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function PathologyPlatformPanel({
  data,
  imageBase64,
  light,
}: {
  data: PathologyImagingGradeResult;
  imageBase64: string | null;
  light: string;
}) {
  return (
    <div style={{ marginBottom: 16, padding: 12, background: light, borderRadius: 8, border: "1px solid #dbeafe" }}>
      <Text strong style={{ fontSize: 13, display: "block", marginBottom: 8 }}>
        影像诊断分析接口结果
      </Text>
      <Space wrap style={{ marginBottom: 8 }}>
        <Tag color="blue">{data.grade_label || "—"}</Tag>
        {data.confidence != null ? <Tag>置信度 {(data.confidence * 100).toFixed(0)}%</Tag> : null}
        <Tag>{data.dicom_count} 张 DICOM</Tag>
      </Space>
      {data.message ? (
        <Paragraph type="secondary" style={{ fontSize: 12, margin: "0 0 8px" }}>
          {data.message}
        </Paragraph>
      ) : null}
      {imageBase64 && hasAnnotatedImage(imageBase64) ? (
        <img
          src={imageSrcFromBase64(imageBase64)}
          alt="影像诊断标注图"
          style={{ maxWidth: "100%", borderRadius: 8, border: "1px solid #e8edf5", background: "#0a0a0a" }}
        />
      ) : null}
    </div>
  );
}

export default function ResearchWorkbench({
  moduleKey,
  title,
  subtitle,
  badge,
  theme,
  dataTitle,
  fields,
  tasks,
  methods,
  resultMap,
  stats,
  outputs,
  followUps,
  indicatorSpecs = {},
  enablePathologyPlatform = false,
  radiomicsAnnotatedImage,
  radiomicsPathologyGrade,
  initialTaskId,
  batchPatients = [],
  batchRoiMode = false,
  agentLayout = false,
  extraCenter,
  linkedBanner,
}: Props) {
  const { message } = App.useApp();
  const colors = THEME[theme];
  const [selectedFields, setSelectedFields] = useState<string[]>(fields.slice(0, 6));
  const [indicatorValues, setIndicatorValues] = useState<Record<string, string>>({});
  const [taskId, setTaskId] = useState(initialTaskId || tasks[0].id);
  const [inclusion, setInclusion] = useState("");
  const [exclusion, setExclusion] = useState("");
  const [outcome, setOutcome] = useState("");
  const [split, setSplit] = useState("");
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<ResearchResultRow[] | null>(null);
  const [resultSummary, setResultSummary] = useState("");
  const [saved, setSaved] = useState(false);
  const [dicomFiles, setDicomFiles] = useState<UploadFile[]>([]);
  const [gradeImage, setGradeImage] = useState<string | null>(null);
  const [pathologyPlatform, setPathologyPlatform] = useState<PathologyImagingGradeResult | null>(null);
  const [workflowReady, setWorkflowReady] = useState(false);
  const [clinicalQuestion, setClinicalQuestion] = useState<ClinicalQuestion>(() => defaultClinicalQuestion());
  const [batchRadiomicsImages, setBatchRadiomicsImages] = useState<BatchImageItem[]>([]);
  const [agentStep, setAgentStep] = useState("input");
  const isMultimodalAgent = agentLayout && moduleKey === "multimodal";
  const agentSteps = isMultimodalAgent ? MULTIMODAL_AGENT_STEPS : IMAGING_AGENT_STEPS;
  const [nlTaskInput, setNlTaskInput] = useState(
    isMultimodalAgent
      ? "构建一个模型，预测肺腺癌 EGFR 突变状态"
      : "构建一个模型，预测肺癌 EGFR 突变状态",
  );

  useEffect(() => {
    if (!batchPatients.length || moduleKey !== "imaging") {
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
          return {
            id: p.id,
            label: `${p.name}（${p.id}）`,
            base64,
            meta,
          };
        }),
      );
      if (!cancelled) {
        setBatchRadiomicsImages(
          loaded.filter((img) => img.volumeId || hasAnnotatedImage(img.base64)),
        );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [batchPatients, moduleKey]);

  useEffect(() => {
    let cancelled = false;
    async function bootstrapWorkflow() {
      const ctx = getWorkflowContext();
      const pendingDicom = getPendingDicomFiles();
      if (pendingDicom.length && !batchRoiMode) {
        setDicomFiles(filesToUploadFiles(pendingDicom));
      }
      if (ctx.pathology && !batchRoiMode) {
        const hydrated = await hydratePathologyImagingResult(ctx.pathology);
        if (!cancelled && hydrated) {
          setPathologyPlatform(hydrated);
          if (hydrated.result_image_base64) {
            setGradeImage(hydrated.result_image_base64);
          }
        }
      }
      if (!cancelled) setWorkflowReady(true);
    }
    void bootstrapWorkflow();
    return () => {
      cancelled = true;
    };
  }, [batchRoiMode]);

  const task = tasks.find((t) => t.id === taskId) ?? tasks[0];
  const isGradeDicomTask = GRADE_DICOM_TASKS.has(taskId);
  const isRadiomicsTask = moduleKey === "imaging" && RADIOMICS_TASKS.has(taskId);

  useEffect(() => {
    const ctx = getWorkflowContext();
    if (taskId === "deeplearn") {
      setClinicalQuestion((q) => applyQuestionTemplate(ctx.hasPathologyResult ? "single_case" : "deeplearn_lesion", q));
    } else if (taskId === "radiomics" || taskId === "grade-pred") {
      setClinicalQuestion((q) =>
        applyQuestionTemplate(ctx.hasPathologyResult ? "single_case" : "pathology_binary", q),
      );
    } else if (taskId === "genotype") {
      setClinicalQuestion((q) => applyQuestionTemplate("genotype_binary", q));
    } else if (taskId === "prognosis-img" || taskId === "survival" || taskId === "prognosis") {
      setClinicalQuestion((q) => applyQuestionTemplate("prognosis_survival", q));
    }
  }, [taskId]);
  const showOptionalDicom =
    enablePathologyPlatform && moduleKey === "clinical" && taskId === "grade-factor";
  const useLiveResultsOnly = isGradeDicomTask || isRadiomicsTask || Boolean(result);
  const previewRows = result ?? (useLiveResultsOnly ? [] : resultMap[taskId] ?? []);

  const toggleField = (f: string) => {
    setSelectedFields((prev) => (prev.includes(f) ? prev.filter((x) => x !== f) : [...prev, f]));
  };

  function handleRadiomicsComplete(rows: ResearchResultRow[], summary: string, auc?: number) {
    setResult(rows);
    setResultSummary(summary);
    setSaved(false);
    const payload: ModuleAnalysisResult = {
      module: moduleKey,
      taskId,
      taskTitle: task.title,
      ranAt: new Date().toISOString(),
      rows,
      summary,
      auc,
    };
    saveModuleResult(payload);
    setSaved(true);
  }

  async function runAnalysis() {
    if (isRadiomicsTask) {
      message.info("请使用下方「影像组学流程」完成上传、勾画 ROI 与组学分析");
      return;
    }

    setRunning(true);
    setSaved(false);
    const workflowPayload = buildResearchWorkflowPayload(getWorkflowContext());
    const ctx = getWorkflowContext();

    try {
      const indicators = {
        ...Object.fromEntries(Object.entries(indicatorValues).filter(([, v]) => v.trim())),
        ...clinicalQuestionToIndicators(clinicalQuestion),
      };

      let res;
      const dicomFromUi = dicomFiles.map((f) => (f.originFileObj ?? f) as unknown as File);
      const dicomToRun = dicomFromUi.length ? dicomFromUi : getPendingDicomFiles();

      if (isGradeDicomTask || (showOptionalDicom && dicomToRun.length > 0)) {
        if (isGradeDicomTask && !dicomToRun.length && !ctx.hasPathologyResult) {
          message.warning("请先在「工作台」上传 DICOM，或完成「智能分析」后再运行");
          setRunning(false);
          return;
        }
        res = await platformResearchGradeRun(
          dicomToRun,
          moduleKey,
          taskId,
          {
            inclusion,
            exclusion,
            outcome,
            indicators,
            workflow_context: workflowPayload,
          },
        );
      } else {
        res = await platformRunResearch({
          module: moduleKey,
          task_id: taskId,
          fields: selectedFields,
          inclusion,
          exclusion,
          outcome,
          split,
          indicators,
          workflow_context: workflowPayload,
        });
      }

      if (res.pathology_imaging_pending) {
        message.warning(res.summary);
      }
      const rows = res.rows as ResearchResultRow[];
      setResult(rows);
      setResultSummary(res.summary);
      if (res.pathology_imaging?.result_image_base64) {
        setGradeImage(res.pathology_imaging.result_image_base64);
      } else if (ctx.pathology?.result_image_base64) {
        setGradeImage(ctx.pathology.result_image_base64);
      }
      if (res.pathology_imaging) {
        setPathologyPlatform(res.pathology_imaging);
      } else if (ctx.pathology) {
        setPathologyPlatform(ctx.pathology);
      }
      const payload: ModuleAnalysisResult = {
        module: moduleKey,
        taskId,
        taskTitle: res.task_title,
        ranAt: new Date().toISOString(),
        rows,
        summary: res.summary,
        auc: res.auc,
        cIndex: res.c_index,
      };
      saveModuleResult(payload);
      setSaved(true);
      message.success(`${res.task_title} 分析完成，结果已保存`);
    } catch (e) {
      message.error(e instanceof Error ? e.message : "分析失败");
      if (!isGradeDicomTask && !isRadiomicsTask) {
        setResult(resultMap[taskId] ?? []);
      }
    } finally {
      setRunning(false);
    }
  }

  const outputChecks = useMemo(() => outputs.map((o) => ({ label: o, checked: Boolean(result) })), [outputs, result]);

  const agentCompletedSteps = useMemo(() => {
    if (!agentLayout) return [] as string[];
    const done: string[] = ["input"];
    if (selectedFields.length || batchPatients.length) done.push("data");
    if (taskId) done.push("strategy");
    if (result || saved) {
      done.push("train", "eval");
    }
    if (result) done.push("validate", "feedback", "report");
    return done;
  }, [agentLayout, selectedFields.length, batchPatients.length, taskId, result, saved]);

  function goAgentStep(key: string) {
    setAgentStep(key);
    document.getElementById(`agent-${key}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  const dataCol = (
    <div className="pmp-card pmp-research-wb-col">
      <div className="pmp-panel-title">{dataTitle}</div>
      <Text type="secondary" style={{ fontSize: 12 }}>
        数据字段（点击选择）
      </Text>
      <div className="pmp-field-tags" style={{ marginTop: 8, marginBottom: 16 }}>
        {fields.map((f) => (
          <Tag
            key={f}
            color={selectedFields.includes(f) ? colors.tag : "default"}
            style={{ cursor: "pointer", marginBottom: 6 }}
            onClick={() => toggleField(f)}
          >
            {f}
          </Tag>
        ))}
      </div>

      {Object.keys(indicatorSpecs).length > 0 ? (
        <>
          <div className="pmp-panel-title">指标录入</div>
          <IndicatorInputPanel
            selectedFields={selectedFields}
            specs={indicatorSpecs}
            values={indicatorValues}
            onChange={(field, value) => setIndicatorValues((prev) => ({ ...prev, [field]: value }))}
          />
        </>
      ) : null}

      <div className="pmp-panel-title" style={{ marginTop: 16 }}>
        队列筛选
      </div>
      <Space direction="vertical" style={{ width: "100%" }} size={8}>
        <Input placeholder="纳入标准" value={inclusion} onChange={(e) => setInclusion(e.target.value)} />
        <Input placeholder="排除标准" value={exclusion} onChange={(e) => setExclusion(e.target.value)} />
        <Input placeholder="结局定义" value={outcome} onChange={(e) => setOutcome(e.target.value)} />
        <Input placeholder="训练 / 验证集" value={split} onChange={(e) => setSplit(e.target.value)} />
      </Space>
      <Space style={{ marginTop: 12 }}>
        <Button size="small">+ 添加字段</Button>
        <Button size="small">数据质控</Button>
      </Space>
    </div>
  );

  const taskSelectionBlock = (
    <>
      <div className="pmp-panel-title">选择分析任务</div>
      <div className="pmp-task-grid">
        {tasks.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`pmp-task-card${taskId === t.id ? " pmp-task-card--active" : ""}`}
            style={taskId === t.id ? { borderColor: colors.accent, background: colors.light } : undefined}
            onClick={() => {
              setTaskId(t.id);
              setResult(null);
              setResultSummary("");
              setSaved(false);
              if (!getPendingDicomFiles().length) {
                setGradeImage(null);
                setPathologyPlatform(null);
              }
            }}
          >
            <div style={{ fontWeight: 600, fontSize: 13 }}>{t.title}</div>
            <div style={{ fontSize: 11, color: "#6b7280", marginTop: 4 }}>{t.desc}</div>
          </button>
        ))}
      </div>
      <div style={{ margin: "16px 0" }}>
        <Text type="secondary" style={{ fontSize: 12 }}>
          智能体推荐方法
        </Text>
        <div style={{ marginTop: 6 }}>
          {methods.map((m) => (
            <Tag key={m} style={{ marginBottom: 4 }}>
              {m}
            </Tag>
          ))}
        </div>
      </div>
    </>
  );

  const analysisContent = (
    <>
      {extraCenter}

      {isRadiomicsTask ? (
        <RadiomicsPipeline
          accent={colors.accent}
          light={colors.light}
          annotatedImageBase64={batchRoiMode ? null : radiomicsAnnotatedImage}
          batchImages={batchRadiomicsImages}
          batchRoiMode={batchRoiMode}
          pathologyGrade={radiomicsPathologyGrade}
          clinicalQuestion={clinicalQuestion}
          onComplete={handleRadiomicsComplete}
        />
      ) : null}

      {isGradeDicomTask || showOptionalDicom ? (
        <div style={{ marginBottom: 16, padding: 12, background: colors.light, borderRadius: 8 }}>
          <Text type="secondary" style={{ fontSize: 12, display: "block", marginBottom: 8 }}>
            {isGradeDicomTask
              ? "已自动关联工作台 DICOM；也可在此追加上传（.dcm / .dicom / ZIP）"
              : "可选：追加 DICOM 与队列因素分析一并展示（工作台文件已自动关联）"}
          </Text>
          {dicomFiles.length > 0 ? (
            <Tag color="blue" style={{ marginBottom: 8 }}>
              已关联 {dicomFiles.length} 个 DICOM/ZIP 文件
            </Tag>
          ) : workflowReady && isGradeDicomTask && getWorkflowContext().hasPathologyResult ? (
            <Tag color="green" style={{ marginBottom: 8 }}>
              将使用智能分析结果，无需重新上传
            </Tag>
          ) : null}
          <Upload
            multiple
            accept=".dcm,.dicom,.zip"
            showUploadList
            fileList={dicomFiles}
            beforeUpload={() => false}
            onChange={({ fileList }) => {
              setDicomFiles(fileList);
              setPendingCaseFiles(fileList);
            }}
          >
            <Button icon={<UploadOutlined />}>追加 DICOM 文件</Button>
          </Upload>
        </div>
      ) : null}

      {pathologyPlatform && !(batchRoiMode && isRadiomicsTask) ? (
        <PathologyPlatformPanel data={pathologyPlatform} imageBase64={gradeImage} light={colors.light} />
      ) : null}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <div className="pmp-panel-title" style={{ margin: 0 }}>
          分析结果{result ? "（已运行）" : isRadiomicsTask || isGradeDicomTask ? "" : "（预览）"}
        </div>
        {!isRadiomicsTask ? (
          <Button type="primary" loading={running} onClick={runAnalysis}>
            运行分析
          </Button>
        ) : null}
      </div>

      {resultSummary ? (
        <Paragraph type="secondary" style={{ fontSize: 12, marginBottom: 8 }}>
          {resultSummary}
        </Paragraph>
      ) : null}

      <Table
        size="small"
        pagination={false}
        rowKey="factor"
        locale={{ emptyText: isGradeDicomTask ? "请上传 DICOM 并运行分析" : "暂无结果，点击运行分析" }}
        dataSource={previewRows}
        columns={[
          { title: "因素 / 特征", dataIndex: "factor" },
          { title: "OR / HR / AUC", dataIndex: "metric", width: 120 },
          { title: "P 值", dataIndex: "pValue", width: 72 },
          { title: "解释", dataIndex: "note", ellipsis: true },
        ]}
      />
      <BarChart rows={previewRows} />
      {gradeImage && hasAnnotatedImage(gradeImage) && !pathologyPlatform ? (
        <img
          src={imageSrcFromBase64(gradeImage)}
          alt="影像诊断标注图"
          style={{ maxWidth: "100%", marginTop: 12, borderRadius: 8, border: "1px solid #e8edf5", background: "#0a0a0a" }}
        />
      ) : null}
      {saved ? (
        <Tag color="green" style={{ marginTop: 12 }}>
          结果已保存，多模态模块可关联引用
        </Tag>
      ) : null}
    </>
  );

  const mainCol = (
    <div className="pmp-card pmp-research-wb-col pmp-research-wb-col--main">
      {taskSelectionBlock}
      {analysisContent}
    </div>
  );

  const outputCol = (
    <div className="pmp-card pmp-research-wb-col">
      <div className="pmp-panel-title">结果与输出</div>
      <div className="pmp-wb-stats">
        {stats.map((s) => (
          <div key={s.label} className="pmp-wb-stat">
            <div className="pmp-wb-stat-value">{s.value}</div>
            <div className="pmp-wb-stat-label">{s.label}</div>
          </div>
        ))}
      </div>
      <div className="pmp-panel-title" style={{ marginTop: 16 }}>
        可生成成果
      </div>
      <Space direction="vertical" style={{ width: "100%" }}>
        {outputChecks.map((o) => (
          <Checkbox key={o.label} checked={o.checked} disabled={!o.checked}>
            {o.label}
          </Checkbox>
        ))}
      </Space>
      <div className="pmp-panel-title" style={{ marginTop: 16 }}>
        推荐追问
      </div>
      <Space direction="vertical" style={{ width: "100%" }}>
        {followUps.map((q) => (
          <Button key={q} block size="small" style={{ textAlign: "left", height: "auto", whiteSpace: "normal" }}>
            {q}
          </Button>
        ))}
      </Space>
    </div>
  );

  const headerBlock = (
    <div className="pmp-research-wb-header" style={{ borderLeftColor: colors.accent }}>
      <div>
        <Link to="/knowledge/data">
          <Button type="text" icon={<ArrowLeftOutlined />} size="small">
            返回模块选择
          </Button>
        </Link>
        <Title level={4} style={{ margin: "8px 0 4px" }}>
          {title}
        </Title>
        <Paragraph type="secondary" style={{ margin: 0, fontSize: 13 }}>
          {subtitle}
        </Paragraph>
        <Space style={{ marginTop: 8 }}>
          <Tag color="green">已连接：多模态科研数据库</Tag>
          <Tag color={colors.tag as "blue"}>{badge}</Tag>
        </Space>
      </div>
      <Space>
        <Button icon={<FileTextOutlined />}>生成报告</Button>
        <Button type="primary" icon={<ExportOutlined />}>
          导出
        </Button>
      </Space>
    </div>
  );

  const alertsBlock = (
    <>
      {linkedBanner}
      {batchPatients.length ? (
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
          message={
            moduleKey === "imaging"
              ? batchRoiMode
                ? `批量预勾画 ROI · ${batchRadiomicsImages.length} 例（跳过智能分析接口）`
                : `已从患者库批量带入 ${batchPatients.length} 例（含标注图 ${batchRadiomicsImages.length} 例）`
              : `已从患者库批量带入 ${batchPatients.length} 例，用于临床及病理数据分析`
          }
          description={
            moduleKey === "imaging"
              ? batchRoiMode
                ? "下方组学流程已自动进入 ROI 步骤，可直接点击「提取特征」。"
                : "可在下方影像组学流程中用 ↑ / ↓ 翻阅各例标注图"
              : "已选病例将用于病理分级相关因素、生存分析、预后模型等结构化分析任务"
          }
        />
      ) : null}
      {!batchRoiMode ? <WorkflowContextBanner /> : null}
    </>
  );

  return (
    <div className={`pmp-research-wb${agentLayout ? " pmp-imaging-agent-page" : ""}${isMultimodalAgent ? " pmp-multimodal-agent-page" : ""}`}>
      {headerBlock}
      {alertsBlock}

      {agentLayout ? (
        <>
          <ImagingAgentStepBar
            steps={agentSteps}
            activeKey={agentStep}
            completedKeys={agentCompletedSteps}
            onChange={goAgentStep}
          />
          <div className="pmp-imaging-agent-body">
            <div className="pmp-imaging-agent-main">
              <section id="agent-input" className="pmp-imaging-agent-section pmp-card">
                <div className="pmp-panel-title">自然语言任务输入</div>
                <Input.TextArea
                  rows={3}
                  value={nlTaskInput}
                  onChange={(e) => setNlTaskInput(e.target.value)}
                  placeholder={
                    isMultimodalAgent
                      ? "用自然语言描述多模态研究目标，例如：预测 EGFR 突变 / 病理分级 / 生存风险"
                      : "用自然语言描述研究目标，例如：构建模型预测 EGFR 突变状态"
                  }
                />
                <Button
                  type="primary"
                  style={{ marginTop: 12 }}
                  onClick={() => {
                    setClinicalQuestion((q) => ({ ...q, hypothesis: nlTaskInput }));
                    goAgentStep("data");
                    message.success("已生成分析方案，请确认数据");
                  }}
                >
                  AI 生成分析方案
                </Button>
                {isMultimodalAgent ? (
                  <Space wrap style={{ marginTop: 12 }}>
                    <Tag color="purple">疾病：肺腺癌</Tag>
                    <Tag color="blue">预测类型：二分类</Tag>
                    <Tag color="cyan">推荐：Early Fusion + XGBoost</Tag>
                  </Space>
                ) : null}
                <div style={{ marginTop: 16 }}>
                  <ClinicalQuestionPanel
                    value={clinicalQuestion}
                    onChange={setClinicalQuestion}
                    suggestedTaskId={taskId}
                  />
                </div>
              </section>

              <section id="agent-data" className="pmp-imaging-agent-section">
                <div className="pmp-imaging-agent-data-stats">
                  {(isMultimodalAgent
                    ? [
                        { label: "总病例", value: stats[0]?.value ?? "512" },
                        { label: "CT 影像", value: stats[1]?.value ?? "512" },
                        { label: "临床数据", value: "512" },
                        { label: "病理 WSI", value: "486" },
                      ]
                    : [
                        { label: "匹配病例", value: String(batchPatients.length || stats[1]?.value || "0") },
                        { label: "CT 影像", value: String(batchRadiomicsImages.length || stats[0]?.value || "0") },
                        { label: "ROI 区域", value: String(batchRadiomicsImages.filter((i) => i.volumeId).length) },
                        { label: "临床字段", value: String(selectedFields.length) },
                      ]
                  ).map((s) => (
                    <div key={s.label} className="pmp-imaging-agent-data-stat">
                      <div
                        className="pmp-imaging-agent-data-stat-value"
                        style={isMultimodalAgent ? { color: colors.accent } : undefined}
                      >
                        {s.value}
                      </div>
                      <div className="pmp-imaging-agent-data-stat-label">{s.label}</div>
                    </div>
                  ))}
                </div>
                {dataCol}
              </section>

              <section id="agent-strategy" className="pmp-imaging-agent-section pmp-card">
                <div className="pmp-panel-title">
                  {isMultimodalAgent ? "多模态策略选择" : "推荐分析策略"}
                </div>
                <div className="pmp-imaging-strategy-cards">
                  {(isMultimodalAgent
                    ? [
                        { key: "clinical-imaging", title: "影像 + 临床", desc: "Early Fusion · 结构化拼接" },
                        { key: "path-omics", title: "病理 + 组学", desc: "多组学特征整合" },
                        { key: "fusion", title: "全模态融合", desc: "影像 + 临床 + 病理", active: true },
                      ]
                    : [
                        { key: "radiomics", title: "Radiomics", desc: "纹理 / 形态特征 · LASSO 筛选" },
                        { key: "deeplearn", title: "Deep Learning", desc: "CNN 特征 · Grad-CAM 解释" },
                        { key: "fusion", title: "Radiomics + DL", desc: "联合建模 · 互补特征", active: true },
                      ]
                  ).map((s) => (
                    <button
                      key={s.key}
                      type="button"
                      className={`pmp-imaging-strategy-card${s.active ? " pmp-imaging-strategy-card--active" : ""}${isMultimodalAgent ? " pmp-imaging-strategy-card--purple" : ""}`}
                      onClick={() => {
                        if (isMultimodalAgent) {
                          if (s.key === "clinical-imaging") setTaskId("clinical-imaging");
                          else if (s.key === "path-omics") setTaskId("path-omics");
                          else setTaskId("clinical-imaging");
                        } else {
                          setTaskId(s.key === "deeplearn" ? "deeplearn" : "radiomics");
                        }
                      }}
                    >
                      <div className="pmp-imaging-strategy-title">{s.title}</div>
                      <div className="pmp-imaging-strategy-desc">{s.desc}</div>
                    </button>
                  ))}
                </div>
                {isMultimodalAgent ? (
                  <Space wrap style={{ marginTop: 12 }}>
                    {["Feature-level Fusion", "Model-level Fusion", "Decision-level Fusion"].map((m) => (
                      <Tag key={m} color="purple">
                        {m}
                      </Tag>
                    ))}
                  </Space>
                ) : null}
                <div style={{ marginTop: 16 }}>{taskSelectionBlock}</div>
              </section>

              <section id="agent-train" className="pmp-imaging-agent-section pmp-card">
                <div className="pmp-panel-title">AutoML 训练进度</div>
                <div className="pmp-imaging-automl-track">
                  {(isMultimodalAgent
                    ? ["数据预处理", "模态对齐", "特征融合", "模型搜索", "完成"]
                    : ["数据检查", "特征工程", "模型搜索", "超参优化", "完成"]
                  ).map((label, i) => (
                    <div
                      key={label}
                      className={`pmp-imaging-automl-step${result || saved ? " pmp-imaging-automl-step--done" : i === 0 ? " pmp-imaging-automl-step--active" : ""}${isMultimodalAgent && i === 0 && !result ? " pmp-imaging-automl-step--purple" : ""}`}
                    >
                      {label}
                    </div>
                  ))}
                </div>
                <div style={{ marginTop: 16 }}>{analysisContent}</div>
              </section>

              <section id="agent-eval" className="pmp-imaging-agent-section pmp-card">
                <div className="pmp-panel-title">模型评估与解释</div>
                <div className="pmp-wb-stats" style={{ marginBottom: 16 }}>
                  {stats.map((s) => (
                    <div key={s.label} className="pmp-wb-stat">
                      <div className="pmp-wb-stat-value">{s.value}</div>
                      <div className="pmp-wb-stat-label">{s.label}</div>
                    </div>
                  ))}
                </div>
                {isMultimodalAgent ? extraCenter : null}
              </section>

              <section id="agent-validate" className="pmp-imaging-agent-section pmp-card">
                <div className="pmp-panel-title">外部验证</div>
                <Paragraph type="secondary" style={{ fontSize: 12 }}>
                  {isMultimodalAgent
                    ? "上传独立中心验证集或多中心 CSV，对比 ROC 与校准曲线。"
                    : "上传独立验证集 CSV（含结局变量与预测特征），评估模型泛化能力。"}
                </Paragraph>
                <Button icon={<UploadOutlined />}>上传验证集 CSV</Button>
              </section>

              <section id="agent-feedback" className="pmp-imaging-agent-section pmp-card">
                <div className="pmp-panel-title">模型反哺与知识更新</div>
                <div className="pmp-imaging-stability">
                  <span className="pmp-imaging-stability-score" style={isMultimodalAgent ? { color: colors.accent } : undefined}>
                    {saved ? (isMultimodalAgent ? 88 : 86) : "—"}
                  </span>
                  <span className="pmp-imaging-stability-label">模型稳定性评分 / 100</span>
                </div>
                {isMultimodalAgent ? (
                  <Paragraph type="secondary" style={{ fontSize: 12, marginTop: 8 }}>
                    数据漂移检测 PSI = 0.16 · 建议纳入增量样本后更新知识库
                  </Paragraph>
                ) : null}
                <Space wrap style={{ marginTop: 12 }}>
                  <Button type="primary" disabled={!saved}>
                    加入知识库
                  </Button>
                  <Button disabled={!saved}>增量学习</Button>
                </Space>
              </section>

              <section id="agent-report" className="pmp-imaging-agent-section pmp-card">
                <div className="pmp-panel-title">报告生成</div>
                {outputCol}
              </section>
            </div>

            <ImagingAgentAssistant
              taskSummary={clinicalQuestionSummaryText(clinicalQuestion)}
              caseCount={isMultimodalAgent ? undefined : batchPatients.length}
              messages={isMultimodalAgent ? MULTIMODAL_AGENT_ASSISTANT_MESSAGES : IMAGING_AGENT_ASSISTANT_MESSAGES}
              reasoning={isMultimodalAgent ? MULTIMODAL_AGENT_REASONING : IMAGING_AGENT_REASONING}
              suggestions={followUps}
              progressPct={isMultimodalAgent ? 65 : undefined}
              accent={colors.accent}
            />
          </div>
        </>
      ) : (
        <>
          <ClinicalQuestionPanel
            value={clinicalQuestion}
            onChange={setClinicalQuestion}
            suggestedTaskId={taskId}
          />
          <div className="pmp-research-wb-grid">
            {dataCol}
            {mainCol}
            {outputCol}
          </div>
        </>
      )}
    </div>
  );
}
