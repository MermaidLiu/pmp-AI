import { PlayCircleOutlined, ReloadOutlined, RobotOutlined, SendOutlined } from "@ant-design/icons";
import { Button, Input, Progress, Tag, Typography } from "antd";
import { useState } from "react";

const { Text } = Typography;

const ACCENT = "#7c3aed";

type Props = {
  taskSummary?: string;
  progressPct: number;
  progressLabel?: string;
  statusMessage: string;
  reasoning: string[];
  suggestions?: string[];
  onStartAnalysis?: () => void;
  onRescan?: () => void;
};

export default function MultimodalAgentAssistant({
  taskSummary,
  progressPct,
  progressLabel,
  statusMessage,
  reasoning,
  suggestions = ["三种融合方式有什么区别？", "为什么 XGBoost 表现最好？", "帮我生成论文 Methods 段落", "外部验证结果如何解读？"],
  onStartAnalysis,
  onRescan,
}: Props) {
  const [input, setInput] = useState("");

  return (
    <aside className="pmp-imaging-agent-assistant pmp-card pmp-mm-agent-assistant">
      <div className="pmp-imaging-agent-assistant-head">
        <RobotOutlined style={{ color: ACCENT, fontSize: 18 }} />
        <Text strong>AI 分析助手</Text>
      </div>

      <div className="pmp-imaging-agent-chat">
        <div className="pmp-imaging-agent-chat-bubble pmp-imaging-agent-chat-bubble--ai">
          您好，我是多模态 AI 分析助手。请描述研究目标，我将自动检索并整合影像、临床、病理与组学数据。
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
        <Progress percent={progressPct} size="small" strokeColor={ACCENT} style={{ marginTop: 6 }} />
        {progressLabel ? (
          <Text type="secondary" style={{ fontSize: 11 }}>
            {progressLabel}
          </Text>
        ) : null}
      </div>

      <div className="pmp-imaging-agent-reasoning">
        <Text type="secondary" style={{ fontSize: 12 }}>
          AI 推理过程
        </Text>
        <ul className="pmp-imaging-agent-reasoning-list">
          {reasoning.map((item) => (
            <li key={item}>
              <span className="pmp-imaging-agent-reasoning-dot" aria-hidden />
              {item}
            </li>
          ))}
        </ul>
      </div>

      <div className="pmp-mm-agent-status-card">
        <Text style={{ fontSize: 12 }}>{statusMessage}</Text>
      </div>

      <div className="pmp-mm-agent-controls">
        <Button size="small" type="primary" icon={<PlayCircleOutlined />} style={{ background: ACCENT }} onClick={onStartAnalysis}>
          运行融合
        </Button>
        <Button size="small">修改目标</Button>
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
        <Input.TextArea rows={2} placeholder="向 AI 助手提问…" value={input} onChange={(e) => setInput(e.target.value)} />
        <Button type="primary" icon={<SendOutlined />} block style={{ marginTop: 8, background: ACCENT }}>
          发送
        </Button>
      </div>
    </aside>
  );
}
