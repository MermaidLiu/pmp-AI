import { LineChartOutlined } from "@ant-design/icons";
import { Col, Descriptions, Progress, Row, Select, Space, Tag, Typography } from "antd";
import { useMemo, useState } from "react";
import { GradeTag } from "../../components/platform/DatabasePageShell";
import { MOCK_PROGNOSIS } from "../../data/analysisMock";

const { Title, Paragraph, Text } = Typography;

function riskColor(level: string) {
  if (level === "高危") return "#cf1322";
  if (level === "中危") return "#d48806";
  return "#3f8600";
}

export default function PlatformPrognosisPage() {
  const [selectedId, setSelectedId] = useState(MOCK_PROGNOSIS[0].id);

  const rec = useMemo(
    () => MOCK_PROGNOSIS.find((p) => p.id === selectedId) ?? MOCK_PROGNOSIS[0],
    [selectedId],
  );

  return (
    <div className="pmp-section">
      <Title level={4} style={{ marginBottom: 16 }}>
        <LineChartOutlined style={{ marginRight: 8, color: "#1677ff" }} />
        预后预测
      </Title>

      <div className="pmp-card" style={{ padding: 16, marginBottom: 16 }}>
        <Space wrap>
          <Text type="secondary">选择患者：</Text>
          <Select
            style={{ minWidth: 320 }}
            value={selectedId}
            onChange={setSelectedId}
            options={MOCK_PROGNOSIS.map((p) => ({
              value: p.id,
              label: `${p.patientName} · ${p.diagnosis}`,
            }))}
          />
          <Tag color={rec.riskLevel === "高危" ? "red" : rec.riskLevel === "中危" ? "orange" : "green"}>
            {rec.riskLevel}
          </Tag>
        </Space>
      </div>

      <Row gutter={16} style={{ marginBottom: 16 }}>
        {[
          { label: "mPFS", value: rec.mpfs },
          { label: "mOS", value: rec.mos },
          { label: "1 年生存", value: rec.os1y },
          { label: "3 年生存", value: rec.os3y },
        ].map((item) => (
          <Col xs={12} sm={6} key={item.label}>
            <div className="pmp-card" style={{ padding: 16, textAlign: "center" }}>
              <Text type="secondary">{item.label}</Text>
              <div style={{ fontSize: 22, fontWeight: 600, color: "#1677ff", marginTop: 4 }}>{item.value}</div>
            </div>
          </Col>
        ))}
      </Row>

      <Row gutter={16}>
        <Col xs={24} lg={12}>
          <div className="pmp-card" style={{ padding: 16, marginBottom: 16 }}>
            <div className="pmp-panel-title">综合预后评分</div>
            <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
              <Progress
                type="dashboard"
                percent={rec.score}
                strokeColor={riskColor(rec.riskLevel)}
                format={(p) => `${p}`}
                size={120}
              />
              <div>
                <div style={{ marginBottom: 8 }}>
                  <GradeTag label={rec.gradeLabel} />
                </div>
                <Text type="secondary">模型：{rec.model}</Text>
              </div>
            </div>
            <Paragraph type="secondary" style={{ marginTop: 12, marginBottom: 0, fontSize: 12 }}>
              评分越高表示复发/进展风险越大，需结合病理切片与分子检测最终确认。
            </Paragraph>
          </div>
        </Col>
        <Col xs={24} lg={12}>
          <div className="pmp-card" style={{ padding: 16, marginBottom: 16 }}>
            <div className="pmp-panel-title">生存率趋势（演示）</div>
            <div
              style={{
                height: 140,
                background: "linear-gradient(180deg,#eff6ff 0%,#fff 100%)",
                borderRadius: 8,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                border: "1px solid #e8edf5",
              }}
            >
              <Space direction="vertical" align="center">
                <Text type="secondary">Kaplan-Meier 曲线占位</Text>
                <Space>
                  <Tag>1y {rec.os1y}</Tag>
                  <Tag>2y {rec.os2y}</Tag>
                  <Tag>3y {rec.os3y}</Tag>
                </Space>
              </Space>
            </div>
          </div>
        </Col>
        <Col xs={24}>
          <div className="pmp-card" style={{ padding: 16 }}>
            <div className="pmp-panel-title">预后相关因素</div>
            <ul style={{ margin: 0, paddingLeft: 20, lineHeight: 2 }}>
              {rec.factors.map((f) => (
                <li key={f}>{f}</li>
              ))}
            </ul>
            <Descriptions column={{ xs: 1, sm: 3 }} size="small" style={{ marginTop: 16 }}>
              <Descriptions.Item label="患者">{rec.patientName}</Descriptions.Item>
              <Descriptions.Item label="诊断">{rec.diagnosis}</Descriptions.Item>
              <Descriptions.Item label="ID">{rec.patientId}</Descriptions.Item>
            </Descriptions>
          </div>
        </Col>
      </Row>
    </div>
  );
}
