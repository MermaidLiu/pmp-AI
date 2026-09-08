import { RobotOutlined, SendOutlined } from "@ant-design/icons";
import { Button, Input, Progress, Tag, Typography } from "antd";
import { useState } from "react";

const { Text } = Typography;

type Props = {
  taskSummary?: string;
  caseCount?: number;
  messages: { role: "assistant"; text: string }[];
  reasoning: string[];
  suggestions?: string[];
  progressPct?: number;
  accent?: string;
};

export default function ImagingAgentAssistant({
  taskSummary,
  caseCount,
  messages,
  reasoning,
  suggestions = ["联合模型比单模态提升了多少？", "生成风险分层图", "解释模态贡献度", "写成论文讨论段"],
  progressPct,
  accent = "#1677ff",
}: Props) {
  const [input, setInput] = useState("");

  return (
    <aside className="pmp-imaging-agent-assistant pmp-card">
      <div className="pmp-imaging-agent-assistant-head">
        <RobotOutlined style={{ color: accent, fontSize: 18 }} />
        <Text strong>AI 分析助手</Text>
      </div>

      <div className="pmp-imaging-agent-chat">
        {messages.map((m, i) => (
          <div key={i} className="pmp-imaging-agent-chat-bubble pmp-imaging-agent-chat-bubble--ai">
            {m.text}
          </div>
        ))}
        {taskSummary ? (
          <div className="pmp-imaging-agent-chat-bubble pmp-imaging-agent-chat-bubble--ai">
            当前任务：{taskSummary}
            {caseCount != null ? ` · 已匹配 ${caseCount} 例` : ""}
          </div>
        ) : null}
      </div>

      {progressPct != null ? (
        <div className="pmp-imaging-agent-progress">
          <Text type="secondary" style={{ fontSize: 12 }}>
            当前任务进度
          </Text>
          <Progress percent={progressPct} size="small" strokeColor={accent} style={{ marginTop: 6 }} />
        </div>
      ) : null}

      <div className="pmp-imaging-agent-reasoning">
        <Text type="secondary" style={{ fontSize: 12 }}>
          AI 推理过程
        </Text>
        <ul className="pmp-imaging-agent-reasoning-list">
          {reasoning.map((item) => (
            <li key={item}>
              <CheckDot />
              {item}
            </li>
          ))}
        </ul>
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

function CheckDot() {
  return <span className="pmp-imaging-agent-reasoning-dot" aria-hidden />;
}
