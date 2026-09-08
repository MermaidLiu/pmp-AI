import { CheckOutlined } from "@ant-design/icons";
import type { AgentStep } from "../../data/agentSteps";

type Props = {
  steps: AgentStep[];
  activeKey: string;
  completedKeys?: string[];
  onChange: (key: string) => void;
};

export default function ImagingAgentStepBar({ steps, activeKey, completedKeys = [], onChange }: Props) {
  const activeIndex = steps.findIndex((s) => s.key === activeKey);

  return (
    <nav className="pmp-imaging-agent-steps" aria-label="智能分析流程">
      {steps.map((step, i) => {
        const done = completedKeys.includes(step.key) || i < activeIndex;
        const active = step.key === activeKey;
        return (
          <button
            key={step.key}
            type="button"
            className={`pmp-imaging-agent-step${active ? " pmp-imaging-agent-step--active" : ""}${done ? " pmp-imaging-agent-step--done" : ""}`}
            onClick={() => onChange(step.key)}
          >
            <span className="pmp-imaging-agent-step-num">
              {done && !active ? <CheckOutlined /> : i + 1}
            </span>
            <span className="pmp-imaging-agent-step-text">
              <span className="pmp-imaging-agent-step-label">{step.label}</span>
              <span className="pmp-imaging-agent-step-sub">{step.subtitle}</span>
            </span>
          </button>
        );
      })}
    </nav>
  );
}
