import { PlayCircleOutlined, ReloadOutlined, RobotOutlined, SendOutlined } from "@ant-design/icons";
import { Button, Input, Progress, Tag, Typography } from "antd";
import { useState } from "react";

const { Text } = Typography;

type Props = {
  taskSummary?: string;
  progressPct: number;
  progressLabel?: string;
  statusMessage: string;
  suggestions?: string[];
  onStartAnalysis?: () => void;
  onRescan?: () => void;
};

export default function ImagingAgentAssistantPanel({
  taskSummary,
  progressPct,
  progressLabel,
  statusMessage,
  suggestions = ["哪种模型更适合这个任务？", "这个任务有哪些难点？", "帮我解释 Top 特征含义", "生成论文 Results 段落"],
  onStartAnalysis,
  onRescan,
}: Props) {
  const [input, setInput] = useState("");

  return (
    <aside className="pmp-imaging-agent-assistant pmp-card pmp-mm-agent-assistant">
      <div className="pmp-imaging-agent-assistant-head">
        <RobotOutlined style={{ color: "#1677ff", fontSize: 18 }} />
        <Text strong>AI 分析助手</Text>
      </div>

      <div className="pmp-imaging-agent-chat">
        <div className="pmp-imaging-agent-chat-bubble pmp-imaging-agent-chat-bubble--ai">
          您好，我是 AI 分析助手。请用自然语言描述研究目标，我将自动检索数据并生成分析方案。
        </div>
        {taskSummary ? (
          <div className="pmp-imaging-agent-chat-bubble pmp-imaging-agent-chat-bubble--ai pmp-mm-agent-plan">
            当前任务：{taskSummary}
          </div>
        ) : null}
      </div>

      <div className="pmp-imaging-agent-progress">
        <Text type="secondary" style={{ fontSize: 12 }}>
          当前任务进度
        </Text>
        <Progress percent={progressPct} size="small" strokeColor="#1677ff" style={{ marginTop: 6 }} />
        {progressLabel ? (
          <Text type="secondary" style={{ fontSize: 11 }}>
            {progressLabel}
          </Text>
        ) : null}
      </div>

      <div className="pmp-mm-agent-status-card pmp-img-agent-status-card">
        <Text style={{ fontSize: 12 }}>{statusMessage}</Text>
      </div>

      <div className="pmp-mm-agent-controls">
        <Button size="small" type="primary" icon={<PlayCircleOutlined />} onClick={onStartAnalysis}>
          开始分析
        </Button>
        <Button size="small">修改筛选</Button>
        <Button size="small" icon={<ReloadOutlined />} onClick={onRescan}>
          重新检索
        </Button>
      </div>

      <div className="pmp-imaging-agent-suggest">
        <Text type="secondary" style={{ fontSize: 12 }}>
          推荐追问
        </Text>
        <div className="pmp-imaging-agent-suggest-tags">
          {suggestions.map((q) => (
            <Tag key={q} className="pmp-imaging-agent-suggest-tag">
              {q}
            </Tag>
          ))}
        </div>
      </div>

      <div className="pmp-imaging-agent-input">
        <Input.TextArea
          rows={2}
          placeholder="向 AI 助手提问…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
        />
        <Button type="primary" icon={<SendOutlined />} block style={{ marginTop: 8 }}>
          发送
        </Button>
      </div>
    </aside>
  );
}
