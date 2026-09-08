import { MedicineBoxOutlined } from "@ant-design/icons";
import { App, Button, Card, Tag, Typography } from "antd";
import { useState } from "react";
import { Link } from "react-router-dom";
import { analyzePathology, type PathologyAnalysisResult } from "../api/client";
import { demoRecord } from "../data/demoRecord";

const { Paragraph, Title, Text } = Typography;

export default function ModuleTreatment() {
  const { message } = App.useApp();
  const [analysis, setAnalysis] = useState<PathologyAnalysisResult | null>(null);
  const [loading, setLoading] = useState(false);

  async function runTreatment() {
    setLoading(true);
    try {
      const res = await analyzePathology(demoRecord);
      setAnalysis(res);
      message.success("治疗推荐已生成");
    } catch {
      message.error("生成失败，请确认后端已启动");
    } finally {
      setLoading(false);
    }
  }

  const t = analysis?.treatment;

  return (
    <div>
      <Title level={4} className="glass-page-title">
        治疗推荐
      </Title>
      <Paragraph type="secondary">
        工作台第 3 步：依据第 2 步诊断结果，给出个体化治疗建议、MDT 会诊提示及指南参考。
      </Paragraph>
      <Button type="primary" icon={<MedicineBoxOutlined />} loading={loading} onClick={runTreatment}>
        生成治疗推荐
      </Button>
      {t ? (
        <div style={{ marginTop: 24 }}>
          <Card title={`治疗方案 · ${t.grade_label}`} size="small">
            {t.mdt_recommended ? (
              <Tag color="orange" style={{ marginBottom: 12 }}>
                建议多学科会诊（MDT）
              </Tag>
            ) : null}
            <ul style={{ paddingLeft: 20, margin: 0 }}>
              {t.recommendations.map((r, i) => (
                <li key={i} style={{ marginBottom: 8 }}>
                  {r}
                </li>
              ))}
            </ul>
            <Text type="secondary" style={{ display: "block", marginTop: 12 }}>
              指南参考：{t.guideline_refs.join("、")}
            </Text>
          </Card>
        </div>
      ) : null}
      <Paragraph style={{ marginTop: 24 }}>
        下一步 →{" "}
        <Link to="/cohort" className="glass-link">
          随访队列
        </Link>
      </Paragraph>
    </div>
  );
}
