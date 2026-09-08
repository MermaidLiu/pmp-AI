import { DatabaseOutlined } from "@ant-design/icons";
import { App, Button, Card, Descriptions, Input, Table, Tag, Typography } from "antd";
import { useState } from "react";
import { Link } from "react-router-dom";
import { correlatePathology, type ClinicalCorrelationResult } from "../api/client";
import { parseIndicators } from "../lib/parseIndicators";

const { Paragraph, Title, Text } = Typography;

export default function ModuleKnowledge() {
  const { message } = App.useApp();
  const [correlation, setCorrelation] = useState<ClinicalCorrelationResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [indicatorText, setIndicatorText] = useState(
    "Ki-67: 35%\nCEA: 12.4 ng/mL\nCA125: 186 U/mL\nCA19-9: 45 U/mL\nSUVmax: 6.8",
  );
  const [diseaseContext, setDiseaseContext] = useState("卵巢肿瘤 · 高级别浆液性癌待排");

  async function runCorrelation() {
    setLoading(true);
    try {
      const res = await correlatePathology({
        indicators: parseIndicators(indicatorText),
        disease_context: diseaseContext,
      });
      setCorrelation(res);
      message.success("相关性分析完成，已纳入知识库");
    } catch {
      message.error("分析失败");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <Title level={4} className="glass-page-title">
        知识积累
      </Title>
      <Paragraph type="secondary">
        工作台第 5 步：医生输入临床指标，智能体分析可能与诊断结果的相关性，推荐文献；随病例入库持续积累，推荐越来越精准。
      </Paragraph>
      <Input
        placeholder="病种背景（可选）"
        value={diseaseContext}
        onChange={(e) => setDiseaseContext(e.target.value)}
        style={{ marginBottom: 12, maxWidth: 480 }}
      />
      <Input.TextArea
        rows={5}
        value={indicatorText}
        onChange={(e) => setIndicatorText(e.target.value)}
        placeholder="每行一个指标，格式：指标名: 值"
        style={{ maxWidth: 480 }}
      />
      <Button
        type="primary"
        icon={<DatabaseOutlined />}
        style={{ marginTop: 12 }}
        loading={loading}
        onClick={runCorrelation}
      >
        分析相关因素
      </Button>
      {correlation ? (
        <div style={{ marginTop: 24 }}>
          <Descriptions bordered size="small" column={1} style={{ marginBottom: 16 }}>
            <Descriptions.Item label="知识库">{correlation.accumulated_cases_note}</Descriptions.Item>
          </Descriptions>
          <Card title="可能相关因素" size="small" style={{ marginBottom: 16 }}>
            {correlation.correlated_factors.length === 0 ? (
              <Text type="secondary">未命中已知关联，请补充更多指标或先完成前几步入库病例。</Text>
            ) : (
              <Table
                size="small"
                rowKey="indicator"
                pagination={false}
                dataSource={correlation.correlated_factors}
                columns={[
                  { title: "指标", dataIndex: "indicator", width: 100 },
                  { title: "输入值", dataIndex: "input_value", width: 100 },
                  { title: "相关性", dataIndex: "correlation" },
                  {
                    title: "强度",
                    dataIndex: "strength",
                    width: 72,
                    render: (v: string) => (
                      <Tag color={v === "强" ? "red" : v === "中" ? "orange" : "default"}>{v}</Tag>
                    ),
                  },
                ]}
              />
            )}
          </Card>
          {correlation.analysis_suggestions.length > 0 ? (
            <Card title="分析建议" size="small" style={{ marginBottom: 16 }}>
              <ul style={{ paddingLeft: 20, margin: 0 }}>
                {correlation.analysis_suggestions.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
            </Card>
          ) : null}
          <Card title="推荐文献" size="small">
            <Table
              size="small"
              rowKey="title"
              pagination={false}
              dataSource={correlation.literature}
              columns={[
                { title: "标题", dataIndex: "title", ellipsis: true },
                { title: "期刊", dataIndex: "journal", width: 140 },
                { title: "年份", dataIndex: "year", width: 72 },
              ]}
            />
          </Card>
        </div>
      ) : null}
      <Paragraph style={{ marginTop: 24 }}>
        下一步 →{" "}
        <Link to="/outputs" className="glass-link">
          科研与转化
        </Link>
      </Paragraph>
    </div>
  );
}
