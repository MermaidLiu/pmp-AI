import { LinkOutlined } from "@ant-design/icons";
import { Alert, Space, Tag } from "antd";
import { Link } from "react-router-dom";
import { loadFollowUpBatch } from "../../lib/followUpBatchStore";
import { loadResearchBatchContext } from "../../lib/researchBatchContext";
import { getWorkflowContext } from "../../lib/workflowContext";

type Props = {
  compact?: boolean;
};

export default function WorkflowContextBanner({ compact = false }: Props) {
  const ctx = getWorkflowContext();
  const batch = loadFollowUpBatch();
  const researchCtx = loadResearchBatchContext();

  if (!ctx.hasCaseFiles && !ctx.hasPathologyResult && !ctx.diagnosis && !batch && !researchCtx) {
    return (
      <Alert
        type="info"
        showIcon
        style={{ marginBottom: compact ? 12 : 16 }}
        message="尚未关联工作台病例"
        description={
          <span>
            请先在 <Link to="/workflow">工作台</Link> 上传病例并完成{" "}
            <Link to="/workflow?step=diagnosis">智能分析</Link>，此处将自动串联上传文件与诊断结果。
          </span>
        }
      />
    );
  }

  return (
    <Alert
      type="success"
      showIcon
      icon={<LinkOutlined />}
      style={{ marginBottom: compact ? 12 : 16 }}
      message={researchCtx || batch ? "已串联批量科研数据" : "已串联工作台工作流数据"}
      description={
        <Space direction="vertical" size={4} style={{ width: "100%" }}>
          {researchCtx ? (
            <span>
              <Tag color="purple">科研队列</Tag>
              {researchCtx.label}
              {" · "}
              <Link to="/knowledge/data">数据分析</Link>
            </span>
          ) : null}
          {batch && !researchCtx ? (
            <span>
              <Tag color="cyan">随访批量</Tag>
              {batch.cases.length} 例临床 · {batch.matchedCount} 例已关联预勾画 NIfTI
              {" · "}
              <Link to="/knowledge/data/clinical">临床分析</Link>
              {" · "}
              <Link to="/db/imaging">影像库</Link>
            </span>
          ) : null}
          {ctx.uploadedFileNames.length > 0 ? (
            <span>
              <Tag>病例文件 {ctx.uploadedFileNames.length} 个</Tag>
              {ctx.uploadedFileNames.length <= 3
                ? ctx.uploadedFileNames.join(" · ")
                : `${ctx.uploadedFileNames.slice(0, 3).join(" · ")} … 等 ${ctx.uploadedFileNames.length} 个`}
            </span>
          ) : null}
          {ctx.hasPathologyResult && ctx.pathology ? (
            <span>
              <Tag color="blue">本例影像</Tag>
              {ctx.pathology.grade_label?.trim()
                ? ctx.pathology.grade_label
                : "勾画完成 · 分级待接口返回"}
              {ctx.pathology.confidence != null
                ? ` · 置信度 ${(ctx.pathology.confidence * 100).toFixed(0)}%`
                : ""}
              {ctx.pathology.dicom_count ? ` · ${ctx.pathology.dicom_count} 张 DICOM` : ""}
            </span>
          ) : null}
          {ctx.diagnosis ? (
            <span>
              <Tag color="purple">辅助诊断</Tag>
              {ctx.diagnosis.title} · 置信度 {(ctx.diagnosis.confidence * 100).toFixed(0)}%
            </span>
          ) : null}
          {ctx.examId ? (
            <span>
              <Tag color="green">已入库</Tag>
              {ctx.examId}
            </span>
          ) : null}
        </Space>
      }
    />
  );
}
