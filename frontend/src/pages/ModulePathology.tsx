import { ExperimentOutlined, TeamOutlined } from "@ant-design/icons";
import { App, Button, Card, Col, Descriptions, Progress, Row, Space, Statistic, Table, Tag, Typography } from "antd";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { analyzePathology, saveCase, type PathologyAnalysisResult } from "../api/client";
import { addToFollowUpQueue, isInFollowUpQueue } from "../lib/followUpQueue";
import { getWorkflowCase } from "../lib/workflowCase";

const { Paragraph, Title, Text } = Typography;

function pct(n: number | undefined) {
  if (n == null || Number.isNaN(n)) return "—";
  return `${(n * 100).toFixed(0)}%`;
}

export default function ModulePathology() {
  const { message } = App.useApp();
  const [analysis, setAnalysis] = useState<PathologyAnalysisResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [followUpLoading, setFollowUpLoading] = useState(false);
  const [inFollowUp, setInFollowUp] = useState(false);

  useEffect(() => {
    const examId = getWorkflowCase().patient_base_info.exam_id;
    setInFollowUp(isInFollowUpQueue(examId));
  }, [analysis]);

  async function runAnalyze() {
    setLoading(true);
    try {
      const res = await analyzePathology(getWorkflowCase());
      setAnalysis(res);
      message.success("诊断结果已生成");
    } catch {
      message.error("分析失败，请确认后端已启动");
    } finally {
      setLoading(false);
    }
  }

  async function handleAddToFollowUp() {
    if (!analysis) return;
    setFollowUpLoading(true);
    try {
      const record = getWorkflowCase();
      await addToFollowUpQueue(record, analysis, saveCase);
      setInFollowUp(true);
      message.success("已加入随访队列，可在「随访队列」模块查看");
    } catch {
      message.error("加入随访队列失败，请确认后端已启动");
    } finally {
      setFollowUpLoading(false);
    }
  }

  const g = analysis?.grading;
  const exp = analysis?.explainability;
  const highProb = exp?.probabilities?.["高级别"] ?? 0;
  const lowProb = exp?.probabilities?.["低级别"] ?? 0;

  const gradeColor = (label: string) =>
    label === "高级别" ? "red" : label === "低级别" ? "green" : "default";
  const scoreColor = (level: string) =>
    level === "高危" ? "#cf1322" : level === "中危" ? "#d48806" : "#3f8600";

  const maxContrib =
    exp?.feature_contributions?.length
      ? Math.max(...exp.feature_contributions.map((c) => Math.abs(c.contribution)), 0.0001)
      : 1;

  return (
    <div>
      <Title level={4} className="glass-page-title">
        诊断结果
      </Title>
      <Paragraph type="secondary">
        工作台第 2 步：读取第 1 步录入的临床诊断与 DICOM 数据，输出病理分级、WHO 分级与综合评分。
        若未上传含 PET 的 DICOM，则不会显示 SUV 等代谢指标，仅基于临床诊断分析。
      </Paragraph>
      <Button type="primary" icon={<ExperimentOutlined />} loading={loading} onClick={runAnalyze}>
        生成诊断结果
      </Button>
      {analysis && g ? (
        <div style={{ marginTop: 24 }}>
          <Card title="临床诊断" size="small" style={{ marginBottom: 16 }}>
            <Paragraph style={{ marginBottom: 8 }}>
              <Text strong>推断诊断：</Text>
              {analysis.inferred_diagnosis}
            </Paragraph>
            <Paragraph style={{ marginBottom: 0 }}>{analysis.diagnosis_summary}</Paragraph>
          </Card>

          <Row gutter={16} style={{ marginBottom: 16 }}>
            <Col xs={24} md={8}>
              <Card title="病理分级" size="small">
                <Tag color={gradeColor(g.pathology_grade || g.grade_label)} style={{ fontSize: 14, padding: "4px 12px" }}>
                  {g.pathology_grade || g.grade_label}
                </Tag>
                <div style={{ marginTop: 12 }}>
                  <Text type="secondary">WHO 分级：</Text>
                  <Text strong> {g.who_grade || "—"}</Text>
                </div>
                <div style={{ marginTop: 8 }}>
                  <Text type="secondary">分级体系：</Text>
                  <Text> {g.grade_system}</Text>
                </div>
                <div style={{ marginTop: 8 }}>
                  <Text type="secondary">置信度：</Text>
                  <Text> {(g.confidence * 100).toFixed(0)}%</Text>
                </div>
              </Card>
            </Col>
            <Col xs={24} md={8}>
              <Card title="分级概率" size="small">
                <div style={{ marginBottom: 12 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                    <Text>高级别</Text>
                    <Text strong style={{ color: "#cf1322" }}>
                      {pct(highProb)}
                    </Text>
                  </div>
                  <Progress percent={Math.round(highProb * 100)} showInfo={false} strokeColor="#cf1322" size="small" />
                </div>
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                    <Text>低级别</Text>
                    <Text strong style={{ color: "#3f8600" }}>
                      {pct(lowProb)}
                    </Text>
                  </div>
                  <Progress percent={Math.round(lowProb * 100)} showInfo={false} strokeColor="#3f8600" size="small" />
                </div>
                {exp?.prediction_source ? (
                  <Paragraph type="secondary" style={{ marginTop: 12, marginBottom: 0, fontSize: 12 }}>
                    来源：{exp.prediction_source === "trained_model" ? "训练模型" : "规则引擎"}
                    {exp.explanation_method
                      ? ` · 解释方法：${exp.explanation_method === "shap_tree" ? "SHAP" : "偏差×重要性"}`
                      : null}
                  </Paragraph>
                ) : null}
              </Card>
            </Col>
            <Col xs={24} md={8}>
              <Card title="综合评分" size="small">
                <Statistic
                  value={g.composite_score ?? 0}
                  suffix="/ 100"
                  valueStyle={{ color: scoreColor(g.score_level), fontSize: 36 }}
                />
                <Tag color={gradeColor(g.score_level === "高危" ? "高级别" : g.score_level === "低危" ? "低级别" : "未确定")}>
                  {g.score_level || "—"}
                </Tag>
                <Paragraph type="secondary" style={{ marginTop: 12, marginBottom: 0, fontSize: 12 }}>
                  {g.score_interpretation}
                </Paragraph>
              </Card>
            </Col>
          </Row>

          <Row gutter={16} style={{ marginBottom: 16 }}>
            <Col xs={24} md={12}>
              <Card title="评分明细" size="small">
                {Object.entries(g.score_breakdown || {}).map(([k, v]) => (
                  <div key={k} style={{ marginBottom: 10 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                      <Text>{k}</Text>
                      <Text strong>{v}</Text>
                    </div>
                    <Progress percent={v} showInfo={false} strokeColor={scoreColor(g.score_level)} size="small" />
                  </div>
                ))}
              </Card>
            </Col>
            <Col xs={24} md={12}>
              <Card title="本例特征贡献（单例解释）" size="small">
                {exp?.feature_contributions?.length ? (
                  <Table
                    size="small"
                    pagination={false}
                    rowKey="feature"
                    dataSource={exp.feature_contributions}
                    columns={[
                      { title: "特征", dataIndex: "display_name", width: 100 },
                      { title: "取值", dataIndex: "value", width: 72, render: (v: number) => v.toFixed(2) },
                      {
                        title: "贡献",
                        dataIndex: "contribution",
                        width: 72,
                        render: (v: number) => (
                          <Text style={{ color: v > 0 ? "#cf1322" : "#3f8600" }}>
                            {v > 0 ? "+" : ""}
                            {v.toFixed(3)}
                          </Text>
                        ),
                      },
                      {
                        title: "方向",
                        dataIndex: "direction",
                        ellipsis: true,
                        render: (v: string) => (
                          <Tag color={v.includes("高级别") ? "red" : "green"}>{v}</Tag>
                        ),
                      },
                      {
                        title: "",
                        key: "bar",
                        width: 120,
                        render: (_: unknown, row: { contribution: number }) => (
                          <Progress
                            percent={Math.round((Math.abs(row.contribution) / maxContrib) * 100)}
                            showInfo={false}
                            strokeColor={row.contribution > 0 ? "#cf1322" : "#3f8600"}
                            size="small"
                          />
                        ),
                      },
                    ]}
                  />
                ) : (
                  <Paragraph type="secondary" style={{ marginBottom: 0 }}>
                    暂无单例特征贡献。请先在「病历输入 → 模型训练」完成训练，或上传含 SUV/MTV 的影像数据。
                  </Paragraph>
                )}
              </Card>
            </Col>
          </Row>

          {exp?.pmp_evidence?.length ? (
            <Card title="腹腔粘液瘤专用依据（DPAM / PMCA）" size="small" style={{ marginBottom: 16 }}>
              <ul style={{ paddingLeft: 20, margin: 0 }}>
                {exp.pmp_evidence.map((e, i) => (
                  <li key={i}>
                    {e.startsWith("[高级别]") ? (
                      <Tag color="red" style={{ marginRight: 8 }}>
                        高级别
                      </Tag>
                    ) : e.startsWith("[低级别]") ? (
                      <Tag color="green" style={{ marginRight: 8 }}>
                        低级别
                      </Tag>
                    ) : null}
                    {e.replace(/^\[(高级别|低级别)\]\s*/, "")}
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}

          <Card title="诊断依据" size="small" style={{ marginBottom: 16 }}>
            <ul style={{ paddingLeft: 20, margin: 0 }}>
              {g.evidence.map((e, i) => (
                <li key={i}>{e}</li>
              ))}
            </ul>
            {g.biomarkers_suggested.length > 0 ? (
              <Paragraph style={{ marginTop: 12, marginBottom: 0 }}>
                建议补充标志物：{g.biomarkers_suggested.join("、")}
              </Paragraph>
            ) : null}
          </Card>

          {analysis.multimodal_notes.length > 0 ? (
            <Descriptions bordered size="small" column={2} title="多模态摘要" style={{ marginBottom: 16 }}>
              {analysis.multimodal_notes.map((n, i) => (
                <Descriptions.Item key={i} label={`项 ${i + 1}`}>
                  {n}
                </Descriptions.Item>
              ))}
            </Descriptions>
          ) : null}

          <Card title="随访队列" size="small" style={{ marginBottom: 16 }}>
            <Paragraph type="secondary" style={{ marginBottom: 12 }}>
              若本例需要长期随访，可一键加入随访队列；系统将保存病理分级并同步至数据库。
            </Paragraph>
            <Space wrap>
              <Button
                type={inFollowUp ? "default" : "primary"}
                icon={<TeamOutlined />}
                loading={followUpLoading}
                disabled={inFollowUp}
                onClick={() => void handleAddToFollowUp()}
              >
                {inFollowUp ? "已在随访队列" : "加入随访队列"}
              </Button>
              {inFollowUp ? (
                <Link to="/cohort" className="glass-link">
                  前往随访队列查看 →
                </Link>
              ) : null}
            </Space>
          </Card>
        </div>
      ) : null}
      <Paragraph style={{ marginTop: 24 }}>
        下一步 →{" "}
        <Link to="/treatment" className="glass-link">
          治疗推荐
        </Link>
      </Paragraph>
    </div>
  );
}
