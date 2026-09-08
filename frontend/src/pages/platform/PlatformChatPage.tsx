import {
  DatabaseOutlined,
  FileExcelOutlined,
  FilePdfOutlined,
  FileWordOutlined,
  FileZipOutlined,
  RobotOutlined,
  SendOutlined,
} from "@ant-design/icons";
import { App, Alert, Button, Spin, Tag, Typography, Upload } from "antd";
import type { UploadFile } from "antd/es/upload/interface";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { platformChatAnalyze, platformChatSave } from "../../api/platform";
import { LlmProviderSelect } from "../../components/platform/LlmProviderSelect";
import { loadLlmProvider, providerDisplayName, type LlmProviderId } from "../../lib/llmProvider";
import {
  filesToUploadFiles,
  getPendingCaseFiles,
  mergeAnalysisFiles,
  setPendingCaseFiles,
} from "../../lib/platformCaseUpload";
import { hasAnnotatedImage, imageSrcFromBase64 } from "../../lib/pathologyImage";
import { getPathologyImagingOrNull, markSaved, loadPlatformSession, setAnalysisResult } from "../../lib/platformSession";

const { Text, Paragraph } = Typography;

const ACCEPT = ".xlsx,.xls,.csv,.zip,.pdf,.doc,.docx,.json,.dcm,.dicom";

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  files?: { name: string; icon: React.ReactNode }[];
  analysisDone?: boolean;
  gradeImage?: string;
  llmUsed?: boolean;
  llmModel?: string;
  llmProvider?: string;
};

function fileIcon(name: string) {
  const lower = name.toLowerCase();
  if (lower.endsWith(".zip")) return <FileZipOutlined />;
  if (lower.endsWith(".pdf")) return <FilePdfOutlined />;
  if (lower.endsWith(".doc") || lower.endsWith(".docx")) return <FileWordOutlined />;
  return <FileExcelOutlined />;
}

function formatDiagnosisReply(
  diagnosis: {
    title: string;
    confidence: number;
    staging: string;
    evidence: string[];
    probabilities: { label: string; pct: number }[];
  },
  intentQuestion: string,
  extraNotes: string[],
) {
  return [
    `**首要怀疑：** ${diagnosis.title}`,
    `置信度 ${(diagnosis.confidence * 100).toFixed(0)}% · ${diagnosis.staging}`,
    "",
    "**鉴别诊断：**",
    ...diagnosis.probabilities.map((p) => `• ${p.label}（${p.pct}%）`),
    "",
    "**支持依据：**",
    ...diagnosis.evidence.map((e) => `• ${e}`),
    ...extraNotes.map((n) => `\n> ${n}`),
    "",
    intentQuestion ? `**按您的分析需求：** ${intentQuestion}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

export default function PlatformChatPage() {
  const { message } = App.useApp();
  const nav = useNavigate();
  const bottomRef = useRef<HTMLDivElement>(null);
  const [input, setInput] = useState("");
  const [files, setFiles] = useState<UploadFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [savedToDb, setSavedToDb] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "welcome",
      role: "assistant",
      content:
        "您好，我是 PMP 智能助手。工作台上传的病例会自动同步到此处，您可直接描述分析需求；也可继续追加 Excel、ZIP、PDF、Word 或 DICOM 文件。",
    },
  ]);
  const [syncedFromWorkbench, setSyncedFromWorkbench] = useState(false);
  const [llmProvider, setLlmProvider] = useState<LlmProviderId>(() => loadLlmProvider());

  useEffect(() => {
    const pending = getPendingCaseFiles();
    if (!pending.length) return;
    setFiles(filesToUploadFiles(pending));
    setSyncedFromWorkbench(true);
    const pathology = getPathologyImagingOrNull();
    if (pathology?.grade_label) {
      setInput((prev) =>
        prev ||
        `请结合工作台已完成的影像诊断分析（${pathology.grade_label}）与上传的 ${pending.length} 个病例文件，给出综合解读与后续科研建议。`,
      );
    }
  }, []);

  function scrollBottom() {
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 80);
  }

  async function handleSend() {
    const composerFiles = files.map((f) => (f.originFileObj ?? f) as unknown as File);
    const uploadFiles = mergeAnalysisFiles(composerFiles);
    const text = input.trim();
    if (!text && uploadFiles.length === 0) {
      message.warning("请输入分析需求或上传文件");
      return;
    }

    const userMsg: ChatMessage = {
      id: `u-${Date.now()}`,
      role: "user",
      content: text || "（已上传文件，请分析）",
      files: uploadFiles.map((f) => ({ name: f.name, icon: fileIcon(f.name) })),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setFiles([]);
    setLoading(true);
    setSavedToDb(false);
    scrollBottom();

    try {
      const pathology = getPathologyImagingOrNull();
      const result = await platformChatAnalyze(
        uploadFiles,
        {
          question: text || "请基于上传的数据给出分析结论与建议。",
          variables: "",
          outcome: "grade",
          notes: pathology?.grade_label
            ? `工作台影像诊断：${pathology.grade_label}${pathology.confidence != null ? `，置信度 ${(pathology.confidence * 100).toFixed(0)}%` : ""}`
            : "",
        },
        { llmProvider },
      );
      setAnalysisResult(result);
      setPendingCaseFiles(uploadFiles);

      const extraNotes: string[] = [];
      if (result.pathology_imaging_status) {
        extraNotes.push(result.pathology_imaging_status);
      }
      if (result.ingest_notes.length) {
        extraNotes.push(...result.ingest_notes.slice(0, 2));
      }

      const aiMsg: ChatMessage = {
        id: `a-${Date.now()}`,
        role: "assistant",
        analysisDone: true,
        content:
          result.ai_reply?.trim() ||
          formatDiagnosisReply(result.diagnosis, text, extraNotes),
        gradeImage: result.pathology_imaging?.result_image_base64 || undefined,
        llmUsed: result.llm_used,
        llmModel: result.llm_model,
        llmProvider: result.llm_provider || llmProvider,
      };
      setMessages((prev) => [...prev, aiMsg]);
    } catch (e) {
      message.error(e instanceof Error ? e.message : "分析失败，请检查后端服务是否启动");
      setMessages((prev) => [
        ...prev,
        {
          id: `err-${Date.now()}`,
          role: "assistant",
          content: "分析请求失败。请确认后端已启动（`uvicorn app.main:app`），并重试。",
        },
      ]);
    } finally {
      setLoading(false);
      scrollBottom();
    }
  }

  async function joinDatabase() {
    try {
      const session = loadPlatformSession();
      if (!session.record) {
        message.warning("暂无分析结果可入库");
        return;
      }
      const res = await platformChatSave(session.record);
      markSaved(res.exam_id);
      setSavedToDb(true);
      message.success("分析结果已加入患者数据库");
    } catch (e) {
      message.error(e instanceof Error ? e.message : "入库失败");
    }
  }

  return (
    <div className="pmp-gpt-page">
      <div className="pmp-gpt-main">
        <div className="pmp-gpt-messages">
          {messages.map((m) => (
            <div key={m.id} className={`pmp-gpt-msg pmp-gpt-msg--${m.role}`}>
              {m.role === "assistant" ? (
                <div className="pmp-gpt-avatar">
                  <RobotOutlined />
                </div>
              ) : null}
              <div className="pmp-gpt-bubble">
                {m.role === "assistant" && m.id !== "welcome" ? (
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                    <Text strong>PMP 智能体</Text>
                    {m.llmUsed ? (
                      <Tag color="blue">{providerDisplayName(m.llmProvider, m.llmModel)}</Tag>
                    ) : null}
                  </div>
                ) : null}
                {m.files?.length ? (
                  <div className="pmp-file-grid" style={{ marginBottom: 10 }}>
                    {m.files.map((f) => (
                      <div key={f.name} className="pmp-file-thumb">
                        <div className="pmp-file-thumb-icon">{f.icon}</div>
                        {f.name}
                      </div>
                    ))}
                  </div>
                ) : null}
                <Paragraph style={{ margin: 0, whiteSpace: "pre-wrap" }}>{m.content}</Paragraph>
                {m.gradeImage && hasAnnotatedImage(m.gradeImage) ? (
                  <img
                    src={imageSrcFromBase64(m.gradeImage)}
                    alt="影像诊断标注图"
                    style={{ maxWidth: "100%", marginTop: 12, borderRadius: 8, border: "1px solid #e8edf5", background: "#0a0a0a" }}
                  />
                ) : null}
                {m.analysisDone ? (
                  <div style={{ marginTop: 14, paddingTop: 12, borderTop: "1px solid #e8edf5" }}>
                    <Tag color="green">分析完成</Tag>
                    <Button
                      type="primary"
                      icon={<DatabaseOutlined />}
                      disabled={savedToDb}
                      style={{ marginLeft: 8 }}
                      onClick={joinDatabase}
                    >
                      {savedToDb ? "已加入数据库" : "加入数据库"}
                    </Button>
                    <Button style={{ marginLeft: 8 }} onClick={() => nav("/analysis")}>
                      查看诊断分析
                    </Button>
                  </div>
                ) : null}
              </div>
            </div>
          ))}
          {loading ? (
            <div className="pmp-gpt-msg pmp-gpt-msg--assistant">
              <div className="pmp-gpt-avatar">
                <RobotOutlined />
              </div>
              <div className="pmp-gpt-bubble">
                <Spin size="small" /> <Text type="secondary"> 正在分析多模态数据…</Text>
              </div>
            </div>
          ) : null}
          <div ref={bottomRef} />
        </div>

        <div className="pmp-gpt-composer-wrap">
          {syncedFromWorkbench && files.length > 0 ? (
            <Alert
              type="info"
              showIcon
              style={{ marginBottom: 8 }}
              message={`已从工作台同步 ${files.length} 个病例文件，无需重新上传`}
            />
          ) : null}
          {files.length > 0 ? (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 8 }}>
              {files.map((f) => (
                <Tag key={f.uid} closable onClose={() => setFiles((prev) => prev.filter((x) => x.uid !== f.uid))}>
                  {fileIcon(f.name)} {f.name}
                </Tag>
              ))}
            </div>
          ) : null}

          <div className="pmp-gpt-composer">
            <Upload
              multiple
              showUploadList={false}
              accept={ACCEPT}
              fileList={files}
              beforeUpload={() => false}
              onChange={({ fileList }) => {
                setFiles(fileList);
                setPendingCaseFiles(fileList);
              }}
            >
              <Button type="text" title="上传 Excel / ZIP / PDF / Word / DICOM">
                📎
              </Button>
            </Upload>
            <textarea
              className="pmp-gpt-input"
              rows={3}
              placeholder="描述分析需求，例如：请基于上传的影像指出病变，或比较高级别与低级别患者的生存差异…"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
            />
            <LlmProviderSelect compact size="middle" value={llmProvider} onChange={setLlmProvider} />
            <Button type="primary" icon={<SendOutlined />} loading={loading} onClick={handleSend}>
              分析
            </Button>
          </div>
          <Text type="secondary" style={{ fontSize: 11, display: "block", marginTop: 8, textAlign: "center" }}>
            支持 Excel · ZIP · PDF · Word · DICOM · 分析完成后入库
          </Text>
        </div>
      </div>
    </div>
  );
}
