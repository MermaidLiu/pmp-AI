import { CloudUploadOutlined, DownloadOutlined, FileExcelOutlined } from "@ant-design/icons";
import { App, Alert, Button, Col, Row, Space, Tag, Typography, Upload } from "antd";
import { useState } from "react";
import { importFollowUpBatch, type FollowUpBatchImportResult } from "../../lib/followUpBatchImport";
import {
  activateResearchFromFollowUpBatch,
  hasResearchClinicalReady,
  loadResearchBatchContext,
  markResearchClinicalFromExcelUpload,
} from "../../lib/researchBatchContext";
import {
  FOLLOWUP_BATCH_IMPORTED_EVENT,
  loadFollowUpBatch,
  type FollowUpBatchState,
} from "../../lib/followUpBatchStore";
import { downloadClinicalExcelTemplate } from "../../lib/clinicalDataset/template";
import { parseClinicalExcelFile } from "../../lib/clinicalDataset/parseExcel";
import { saveClinicalDataset } from "../../lib/clinicalDataset/store";
import { RESEARCH_COHORT_DATASET_ID } from "../../lib/clinicalDataset/patientCohortDataset";
import { DEFAULT_PURCHASED_MODULES } from "../../lib/clinicalDataset/types";

const { Text, Paragraph } = Typography;

export type ResearchBatchImportVariant = "followup" | "research";

type Props = {
  variant?: ResearchBatchImportVariant;
  onImported?: (result: FollowUpBatchImportResult) => void;
};

function importModeLabel(hasZip: boolean, hasExcel: boolean): string {
  if (hasZip && hasExcel) return "完整导入（临床 + 影像关联）";
  if (hasExcel) return "仅临床 Excel";
  return "仅预勾画 ZIP";
}

function successMessage(result: FollowUpBatchImportResult, hasZip: boolean, hasExcel: boolean): string {
  if (hasZip && hasExcel) {
    return `导入完成：${result.cases.length} 例临床，${result.matchedCount} 例已关联预勾画影像`;
  }
  if (hasExcel) {
    return `临床导入完成：${result.cases.length} 例（${result.matchedCount} 例已有影像）`;
  }
  return `影像导入完成：${result.cases.length} 例，${result.matchedCount} 例已关联 ROI`;
}

export default function ResearchBatchImportPanel({
  variant = "research",
  onImported,
}: Props) {
  const { message } = App.useApp();
  const [zipFile, setZipFile] = useState<File | null>(null);
  const [excelFile, setExcelFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [batch, setBatch] = useState<FollowUpBatchState | null>(() => loadFollowUpBatch());
  const [researchCtx, setResearchCtx] = useState(() => loadResearchBatchContext());

  const clinicalReady = hasResearchClinicalReady(researchCtx);
  const fromWorkflow = researchCtx?.clinicalSource === "workflow_mapped";
  const activeClinicalN = researchCtx?.clinical.length ?? batch?.cases.length ?? 0;
  const activeImagingN = researchCtx?.imaging.length ?? batch?.matchedCount ?? 0;

  async function handleImport() {
    // 已有工作台映射：无新文件时仅确认可进入分析
    if (variant === "research" && fromWorkflow && !zipFile && !excelFile) {
      setResearchCtx(loadResearchBatchContext());
      message.success("已确认使用工作台临床映射，可进入下方分析模块");
      const b = loadFollowUpBatch();
      if (b) onImported?.(b as FollowUpBatchImportResult);
      return;
    }
    // 科研延伸：未走工作台映射时，必须上传模板临床 Excel
    if (variant === "research" && !fromWorkflow && !excelFile && !clinicalReady) {
      message.warning("请先上传与模板一致的临床 Excel（或从工作台→随访队列进入以自动映射）");
      return;
    }
    if (!zipFile && !excelFile) {
      message.warning(
        variant === "research" && !fromWorkflow
          ? "请上传临床 Excel（须与模板表头一致）"
          : "请至少选择预勾画 ZIP 或临床 Excel 之一",
      );
      return;
    }
    setLoading(true);
    try {
      if (excelFile && variant === "research") {
        const parsed = await parseClinicalExcelFile(excelFile, undefined, {
          purchasedModules: { ...DEFAULT_PURCHASED_MODULES, waveform: true },
        });
        if (parsed.errors.length) {
          message.error(parsed.errors[0] || "临床 Excel 不符合模板，请下载模板后重试");
          return;
        }
        saveClinicalDataset({ ...parsed.dataset, id: RESEARCH_COHORT_DATASET_ID });
      }

      const result = await importFollowUpBatch({ zipFile, excelFile });
      setBatch(result);
      setZipFile(null);
      setExcelFile(null);
      if (variant === "research") {
        const ctx = activateResearchFromFollowUpBatch("research_upload");
        if (excelFile || result.excelFileName) {
          markResearchClinicalFromExcelUpload();
        }
        setResearchCtx(loadResearchBatchContext() ?? ctx);
      }
      onImported?.(result);
      message.success(successMessage(result, Boolean(zipFile), Boolean(excelFile)));
      if (result.warnings.length) message.warning(result.warnings[0]);
    } catch (e) {
      message.error(e instanceof Error ? e.message : "批量导入失败");
    } finally {
      setLoading(false);
    }
  }

  const title =
    variant === "followup"
      ? "批量导入 · 预勾画影像 + 临床记录"
      : "导入临床数据（科研分析）";

  const hint =
    variant === "followup"
      ? "导入后可在下方队列查看，并通过表格右上角进入科研分析。"
      : "若已从「工作台 → 随访队列」勾选进入，将自动使用工作台临床映射为模板字段；否则须上传与模板一致的临床 Excel。";

  const canImport =
    variant === "research"
      ? Boolean(excelFile || zipFile || fromWorkflow)
      : Boolean(zipFile || excelFile);

  return (
    <div className="pmp-card pmp-research-batch-import" style={{ padding: 16, marginBottom: 16 }}>
      <div className="pmp-panel-title" style={{ marginBottom: 8 }}>
        <CloudUploadOutlined style={{ marginRight: 6, color: "#1677ff" }} />
        {title}
      </div>
      <Paragraph type="secondary" style={{ fontSize: 12, marginBottom: 12 }}>
        {hint}
        {variant === "research" ? (
          <>
            {" "}
            表头：患者ID · 患者信息（年龄/性别/RBC）· 影像文件 · 病理文件 · 波形文件。
          </>
        ) : (
          <>
            支持三种方式：<Text strong>仅 Excel</Text>、<Text strong>仅 ZIP</Text>、或
            <Text strong>两者都传</Text>（推荐，自动关联就诊号）。
          </>
        )}
      </Paragraph>

      {variant === "research" && fromWorkflow ? (
        <Alert
          type="success"
          showIcon
          style={{ marginBottom: 12, fontSize: 12 }}
          message={`已使用工作台临床映射（${activeClinicalN} 例）`}
          description="患者与临床信息已按科研 Excel 模板字段写入，可直接进入下方分析模块；仍可补充上传 ZIP 关联预勾画。"
        />
      ) : null}

      {variant === "research" && !fromWorkflow && !clinicalReady ? (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 12, fontSize: 12 }}
          message="请上传临床 Excel 模板"
          description="未从工作台入队时，须下载模板并上传同结构 Excel 后才能进行科研分析。"
        />
      ) : null}

      <Space wrap style={{ marginBottom: 12 }}>
        <Button icon={<DownloadOutlined />} onClick={downloadClinicalExcelTemplate}>
          下载临床 Excel 模板
        </Button>
      </Space>

      <Row gutter={[12, 12]}>
        <Col xs={24} sm={12}>
          <Upload accept=".zip" showUploadList={false} beforeUpload={(f) => { setZipFile(f); return false; }}>
            <Button block icon={<CloudUploadOutlined />}>
              {zipFile ? zipFile.name : "选择预勾画 ZIP（可选）"}
            </Button>
          </Upload>
        </Col>
        <Col xs={24} sm={12}>
          <Upload
            accept=".xls,.xlsx,.csv"
            showUploadList={false}
            beforeUpload={(f) => { setExcelFile(f); return false; }}
          >
            <Button block icon={<FileExcelOutlined />} type={variant === "research" && !fromWorkflow ? "primary" : "default"}>
              {excelFile
                ? excelFile.name
                : variant === "research" && !fromWorkflow
                  ? "选择临床 Excel（必填）"
                  : "选择临床 Excel（可选）"}
            </Button>
          </Upload>
        </Col>
      </Row>

      {zipFile || excelFile ? (
        <Tag color="blue" style={{ marginTop: 12 }}>
          {importModeLabel(Boolean(zipFile), Boolean(excelFile))}
        </Tag>
      ) : null}

      <Button
        type="primary"
        block
        disabled={!canImport || (variant === "research" && !fromWorkflow && !excelFile && !clinicalReady)}
        loading={loading}
        style={{ marginTop: 12 }}
        onClick={() => void handleImport()}
      >
        {variant === "research" && fromWorkflow && !zipFile && !excelFile ? "确认临床映射" : "导入"}
      </Button>

      {batch || researchCtx ? (
        <Space wrap style={{ marginTop: 12 }}>
          {batch?.zipFileName ? <Tag color="blue">{batch.zipFileName}</Tag> : null}
          {batch?.excelFileName ? <Tag color="green">{batch.excelFileName}</Tag> : null}
          <Tag color="purple">
            当前分析 {activeClinicalN} 例
            {activeImagingN ? ` · 影像 ${activeImagingN}` : ""}
          </Tag>
          {researchCtx?.clinicalSource === "workflow_mapped" ? (
            <Tag color="cyan">来源：工作台映射</Tag>
          ) : researchCtx?.clinicalSource === "excel_upload" ? (
            <Tag color="green">来源：临床 Excel</Tag>
          ) : (
            <Tag>待补临床 Excel</Tag>
          )}
        </Space>
      ) : null}
    </div>
  );
}

export { FOLLOWUP_BATCH_IMPORTED_EVENT };
