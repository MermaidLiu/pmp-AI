import { Input, Select, Space, Typography } from "antd";
import type { IndicatorSpec } from "../../data/indicatorSpecs";

const { Text } = Typography;

type Props = {
  selectedFields: string[];
  specs: Record<string, IndicatorSpec>;
  values: Record<string, string>;
  onChange: (field: string, value: string) => void;
};

export default function IndicatorInputPanel({ selectedFields, specs, values, onChange }: Props) {
  const fields = selectedFields.filter((f) => specs[f]);

  if (fields.length === 0) {
    return (
      <Text type="secondary" style={{ fontSize: 12 }}>
        请在上方点击选择字段，然后在此录入指标值
      </Text>
    );
  }

  return (
    <Space direction="vertical" style={{ width: "100%" }} size={8}>
      {fields.map((field) => {
        const spec = specs[field];
        const val = values[field] ?? "";
        return (
          <div key={field}>
            <Text type="secondary" style={{ fontSize: 12 }}>
              {field}
            </Text>
            <div style={{ marginTop: 4 }}>
              {spec.type === "select" ? (
                <Select
                  style={{ width: "100%" }}
                  placeholder={`选择${field}`}
                  value={val || undefined}
                  onChange={(v) => onChange(field, v)}
                  options={spec.options.map((o) => ({ value: o, label: o }))}
                  allowClear
                />
              ) : spec.type === "number" ? (
                <Input
                  type="number"
                  placeholder={spec.placeholder ?? `输入${field}`}
                  value={val}
                  onChange={(e) => onChange(field, e.target.value)}
                  suffix={spec.unit}
                />
              ) : (
                <Input
                  placeholder={spec.placeholder ?? `输入${field}`}
                  value={val}
                  onChange={(e) => onChange(field, e.target.value)}
                />
              )}
            </div>
          </div>
        );
      })}
    </Space>
  );
}
