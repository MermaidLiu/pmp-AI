import { Button, Input, Select, Space, Typography } from "antd";

const { Text } = Typography;

export type AnalysisIntent = {
  question: string;
  variables: string;
  outcome: string;
  notes: string;
};

type Props = {
  value: AnalysisIntent;
  onChange: (next: AnalysisIntent) => void;
  compact?: boolean;
  onRun?: () => void;
  running?: boolean;
};

export default function AnalysisIntentPanel({ value, onChange, compact, onRun, running }: Props) {
  function patch(partial: Partial<AnalysisIntent>) {
    onChange({ ...value, ...partial });
  }

  return (
    <div className="pmp-card" style={{ padding: compact ? 12 : 16, marginBottom: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <div className="pmp-panel-title" style={{ margin: 0 }}>
          分析需求（可编辑）
        </div>
      </div>
      <Space direction="vertical" style={{ width: "100%" }} size={compact ? 8 : 12}>
        <div>
          <Text type="secondary" style={{ fontSize: 12 }}>
            想要分析什么？
          </Text>
          <Input.TextArea
            rows={compact ? 2 : 3}
            placeholder="例如：比较高级别与低级别 PMP 的总生存差异，并评估 SUVmax 的预后价值"
            value={value.question}
            onChange={(e) => patch({ question: e.target.value })}
            style={{ marginTop: 4 }}
          />
        </div>
        {!compact ? (
          <>
            <div>
              <Text type="secondary" style={{ fontSize: 12 }}>
                关注变量 / 指标
              </Text>
              <Input.TextArea
                rows={2}
                placeholder="例如：病理分级、SUVmax、Ki-67、PMCA/DPAM 分型、年龄"
                value={value.variables}
                onChange={(e) => patch({ variables: e.target.value })}
                style={{ marginTop: 4 }}
              />
            </div>
            <Space wrap style={{ width: "100%" }}>
              <div style={{ flex: 1, minWidth: 200 }}>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  主要结局
                </Text>
                <Select
                  style={{ width: "100%", marginTop: 4 }}
                  value={value.outcome}
                  onChange={(v) => patch({ outcome: v })}
                  options={[
                    { value: "os", label: "总生存 OS" },
                    { value: "pfs", label: "无进展生存 PFS" },
                    { value: "grade", label: "病理分级 / 分型" },
                    { value: "response", label: "治疗反应" },
                    { value: "custom", label: "自定义结局" },
                  ]}
                />
              </div>
            </Space>
          </>
        ) : null}
        <div>
          <Text type="secondary" style={{ fontSize: 12 }}>
            补充说明
          </Text>
          <Input.TextArea
            rows={compact ? 1 : 2}
            placeholder="统计方法偏好、亚组条件、输出格式等"
            value={value.notes}
            onChange={(e) => patch({ notes: e.target.value })}
            style={{ marginTop: 4 }}
          />
        </div>
        {!compact && onRun ? (
          <div style={{ textAlign: "right" }}>
            <Button type="primary" size="large" loading={running} onClick={onRun}>
              运行分析
            </Button>
          </div>
        ) : null}
      </Space>
    </div>
  );
}
