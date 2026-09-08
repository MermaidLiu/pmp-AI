import { Select, Space, Tag, Typography } from "antd";
import { useEffect, useState } from "react";
import { platformListLlmProviders } from "../../api/platform";
import {
  loadLlmProvider,
  saveLlmProvider,
  type LlmProviderId,
  type LlmProviderInfo,
} from "../../lib/llmProvider";

const { Text } = Typography;

type Props = {
  value?: LlmProviderId;
  onChange?: (id: LlmProviderId) => void;
  size?: "small" | "middle" | "large";
  /** compact: only the select; default shows a short hint */
  compact?: boolean;
};

export function LlmProviderSelect({ value, onChange, size = "middle", compact }: Props) {
  const [providers, setProviders] = useState<LlmProviderInfo[]>([]);
  const [inner, setInner] = useState<LlmProviderId>(() => value || loadLlmProvider());

  useEffect(() => {
    void platformListLlmProviders()
      .then((res) => {
        setProviders(res.providers);
        const current = value || loadLlmProvider();
        const match = res.providers.find((p) => p.id === current);
        if (match && !match.configured) {
          const fallback = res.providers.find((p) => p.configured)?.id;
          if (fallback) {
            setInner(fallback);
            saveLlmProvider(fallback);
            onChange?.(fallback);
          }
        }
      })
      .catch(() => {
        setProviders([
          { id: "reachapi", label: "ReachAPI", model: "gpt-5.6-sol", configured: true, base_url: "" },
          { id: "deepseek", label: "DeepSeek", model: "deepseek-chat", configured: false, base_url: "" },
        ]);
      });
  }, []);

  const current = value ?? inner;

  function handleChange(id: LlmProviderId) {
    setInner(id);
    saveLlmProvider(id);
    onChange?.(id);
  }

  const selected = providers.find((p) => p.id === current);

  return (
    <Space size={8} wrap>
      <Select
        size={size}
        value={current}
        onChange={handleChange}
        style={{ minWidth: compact ? 140 : 180 }}
        options={providers.map((p) => ({
          value: p.id,
          label: `${p.label}${p.model ? ` · ${p.model}` : ""}`,
          disabled: !p.configured,
        }))}
      />
      {!compact && selected ? (
        selected.configured ? (
          <Text type="secondary" style={{ fontSize: 12 }}>
            将用于本次对话 / 治疗草案润色
          </Text>
        ) : (
          <Tag color="warning">未配置 Key</Tag>
        )
      ) : null}
    </Space>
  );
}
