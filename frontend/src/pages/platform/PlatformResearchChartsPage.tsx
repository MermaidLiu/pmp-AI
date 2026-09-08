import { PieChartOutlined } from "@ant-design/icons";
import { App, Button, Col, Progress, Row, Select, Space, Tag, Typography } from "antd";
import { useMemo, useState } from "react";
import { MOCK_CHART_TEMPLATES } from "../../data/researchMock";

const { Title, Paragraph, Text } = Typography;

function BarChartDemo({ labels, values, colors }: { labels: string[]; values: number[]; colors: string[] }) {
  const max = Math.max(...values, 1);
  return (
    <div style={{ padding: "8px 0" }}>
      {labels.map((label, i) => (
        <div key={label} style={{ marginBottom: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 4 }}>
            <span>{label}</span>
            <span>{values[i]}</span>
          </div>
          <Progress percent={Math.round((values[i] / max) * 100)} showInfo={false} strokeColor={colors[i]} size="small" />
        </div>
      ))}
    </div>
  );
}

function ScatterDemo() {
  const points = [
    { x: 15, y: 20 },
    { x: 25, y: 35 },
    { x: 35, y: 28 },
    { x: 45, y: 55 },
    { x: 55, y: 48 },
    { x: 65, y: 72 },
    { x: 75, y: 68 },
    { x: 85, y: 85 },
  ];
  return (
    <svg viewBox="0 0 200 120" style={{ width: "100%", maxWidth: 360, height: 180 }}>
      <line x1="20" y1="100" x2="190" y2="100" stroke="#e8edf5" />
      <line x1="20" y1="100" x2="20" y2="10" stroke="#e8edf5" />
      {points.map((p, i) => (
        <circle key={i} cx={20 + p.x * 1.7} cy={100 - p.y * 0.9} r="4" fill="#1677ff" opacity={0.75} />
      ))}
      <text x="100" y="115" textAnchor="middle" fontSize="8" fill="#6b7280">
        SUVmax
      </text>
      <text x="8" y="55" textAnchor="middle" fontSize="8" fill="#6b7280" transform="rotate(-90 8 55)">
        Ki-67%
      </text>
    </svg>
  );
}

export default function PlatformResearchChartsPage() {
  const { message } = App.useApp();
  const [chartId, setChartId] = useState(MOCK_CHART_TEMPLATES[0].id);
  const [variable, setVariable] = useState(MOCK_CHART_TEMPLATES[0].variables[0]);
  const [generated, setGenerated] = useState(false);

  const template = useMemo(
    () => MOCK_CHART_TEMPLATES.find((c) => c.id === chartId) ?? MOCK_CHART_TEMPLATES[0],
    [chartId],
  );

  function onChartChange(id: string) {
    setChartId(id);
    const t = MOCK_CHART_TEMPLATES.find((c) => c.id === id);
    if (t) setVariable(t.variables[0]);
    setGenerated(false);
  }

  function generate() {
    setGenerated(true);
    message.success(`已生成「${template.name}」（演示）`);
  }

  return (
    <div className="pmp-section">
      <Title level={4} style={{ marginBottom: 16 }}>
        <PieChartOutlined style={{ marginRight: 8, color: "#1677ff" }} />
        图表生成
      </Title>

      <Row gutter={16}>
        <Col xs={24} lg={8}>
          <div className="pmp-card" style={{ padding: 16, marginBottom: 16 }}>
            <div className="pmp-panel-title">图表类型</div>
            <Select
              style={{ width: "100%", marginBottom: 12 }}
              value={chartId}
              onChange={onChartChange}
              options={MOCK_CHART_TEMPLATES.map((c) => ({ value: c.id, label: c.name }))}
            />
            <Paragraph type="secondary" style={{ fontSize: 12 }}>
              {template.description}
            </Paragraph>
            <Tag>{template.type}</Tag>
            <div className="pmp-panel-title" style={{ marginTop: 16 }}>
              分层 / X 轴变量
            </div>
            <Select
              style={{ width: "100%", marginBottom: 16 }}
              value={variable}
              onChange={setVariable}
              options={template.variables.map((v) => ({ value: v, label: v }))}
            />
            <Button type="primary" block onClick={generate}>
              生成图表
            </Button>
          </div>
        </Col>
        <Col xs={24} lg={16}>
          <div className="pmp-card" style={{ padding: 16, minHeight: 320 }}>
            <div className="pmp-panel-title">预览 · {template.name}</div>
            {!generated ? (
              <Paragraph type="secondary">选择类型与变量后点击「生成图表」</Paragraph>
            ) : chartId === "scatter-suv" ? (
              <ScatterDemo />
            ) : chartId === "km" ? (
              <div
                style={{
                  height: 200,
                  background: "linear-gradient(180deg,#f0fdf4,#fff 50%,#fef2f2)",
                  borderRadius: 8,
                  border: "1px solid #e8edf5",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Text type="secondary">KM 曲线 · 按{variable}分层（演示）</Text>
              </div>
            ) : chartId === "forest" ? (
              <BarChartDemo
                labels={["病理分级", "SUVmax", "Ki-67", "EGFR"]}
                values={[2.84, 1.18, 2.11, 0.62]}
                colors={["#cf1322", "#1677ff", "#d48806", "#3f8600"]}
              />
            ) : (
              <BarChartDemo
                labels={variable === "病理分级" ? ["高级别", "低级别", "未确定"] : ["组 A", "组 B", "组 C"]}
                values={variable === "病理分级" ? [62, 66, 8] : [45, 38, 45]}
                colors={["#cf1322", "#3f8600", "#9ca3af"]}
              />
            )}
            {generated ? (
              <Space style={{ marginTop: 16 }}>
                <Button onClick={() => message.info("导出 PNG（演示）")}>导出 PNG</Button>
                <Button onClick={() => message.info("导出 SVG（演示）")}>导出 SVG</Button>
                <Button type="primary" onClick={() => message.info("插入论文（演示）")}>
                  插入论文
                </Button>
              </Space>
            ) : null}
          </div>
        </Col>
      </Row>
    </div>
  );
}
