import { Alert, Card, Col, Progress, Row, Spin, Tag, Typography } from "antd";
import { useEffect, useState } from "react";
import { platformOmicsReadiness } from "../../api/platform";

const { Title, Paragraph } = Typography;
export default function PlatformOmicsPage() {
  const [data, setData] = useState<Awaited<ReturnType<typeof platformOmicsReadiness>> | null>(null);
  useEffect(() => { void platformOmicsReadiness().then(setData).catch(() => setData(null)); }, []);
  if (!data) return <div className="pmp-section"><Spin tip="加载组学队列状态…" /></div>;
  return <div className="pmp-section">
    <Title level={3}>组学分析中心</Title>
    <Alert type="info" showIcon style={{ marginBottom: 16 }} message="以队列质控和医生确认标签为门槛" description={`当前至少需 ${data.minimum_cases} 例完成质控后才开放训练/验证；组学结果用于研究和决策支持，不替代检验报告。`} />
    <Row gutter={[16, 16]}>{Object.entries(data.modules).map(([key, m]) => <Col xs={24} md={8} key={key}><Card title={m.label} extra={<Tag color={m.ready ? "green" : "orange"}>{m.ready ? "可分析" : "数据积累中"}</Tag>}><Progress percent={Math.min(100, Math.round(m.case_count / data.minimum_cases * 100))} /><Paragraph>{m.case_count} / {data.minimum_cases} 例</Paragraph><Paragraph type="secondary">{m.next_step}</Paragraph></Card></Col>)}</Row>
    <Card style={{ marginTop: 16 }} title="分析路径"><ul><li>临床组学：沿用并强化现有临床数据集质控、描述统计、生存/回归和机器学习。</li><li>影像组学：使用原 CT 接口输出的标注/mask，提取可复现特征并建立训练、验证和外部测试队列。</li><li>基因组学：导入变异/表达矩阵后，通过 ToolUniverse 编排基因、通路、靶点与文献工具；上传前需完成脱敏和伦理审批。</li></ul></Card>
  </div>;
}


