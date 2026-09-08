import { Alert, App, Button, Card, Col, Descriptions, Form, Input, Rate, Row, Select, Space, Spin, Tag, Typography } from "antd";
import { useState } from "react";
import { Link } from "react-router-dom";
import { platformAssistedDiagnosis, platformSubmitPhysicianFeedback, type AssistedDiagnosis } from "../../api/platform";
import { buildRecordForCarePathway } from "../../lib/platformCarePathway";
import { getPathologyImagingOrNull, loadPlatformSession } from "../../lib/platformSession";

const { Paragraph, Text, Title } = Typography;

export default function PlatformAssistedDiagnosisPage() {
  const { message } = App.useApp();
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [draft, setDraft] = useState<AssistedDiagnosis | null>(null);
  const [form] = Form.useForm();
  const imaging = getPathologyImagingOrNull();
  const session = loadPlatformSession();
  const examId = imaging?.exam_id || session.savedExamId || "";

  async function generate() {
    if (!imaging) {
      message.warning("请先在工作台完成 DICOM/ZIP 影像分析，再生成辅助诊断草案");
      return;
    }
    setLoading(true);
    try {
      setDraft(await platformAssistedDiagnosis(buildRecordForCarePathway(imaging, examId), imaging));
    } catch {
      message.error("辅助诊断生成失败，请检查后端与 PMP 模型配置");
    } finally {
      setLoading(false);
    }
  }

  async function submitFeedback() {
    if (!examId) {
      message.warning("请先将本例写入患者数据库，才能保存医生反馈");
      return;
    }
    try {
      const values = await form.validateFields();
      setSubmitting(true);
      const result = await platformSubmitPhysicianFeedback({ exam_id: examId, ...values });
      message.success(`反馈已入库；本例累计 ${result.feedback_count} 条可审计反馈`);
      form.resetFields();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="pmp-section">
      <Title level={3}>AI 辅助诊断与医生反馈</Title>
      <Alert type="warning" showIcon style={{ marginBottom: 16 }} message="临床决策支持草案，不是最终诊断或医嘱" description="保留原 DICOM 标注、PCI 评分与本地版本化指南证据；ToolUniverse 仅处理去标识化科研检索词。" />
      <Space style={{ marginBottom: 16 }} wrap>
        <Button type="primary" loading={loading} onClick={() => void generate()}>生成 PMP 辅助诊断草案</Button>
        <Link to="/workflow?step=diagnosis"><Button>返回影像分析</Button></Link>
      </Space>
      {loading ? <Spin tip="正在汇总临床、生化、影像与指南证据…" /> : null}
      {draft ? <Row gutter={[16, 16]}>
        <Col xs={24} lg={15}>
          <Card title="AI 辅助诊断草案" extra={<Tag color={draft.tooluniverse_used ? "blue" : "default"}>{draft.model_name} · {draft.tooluniverse_used ? "ToolUniverse 已编排" : "本地证据模式"}</Tag>}>
            <Descriptions column={1} size="small">
              <Descriptions.Item label="主要印象"><Text strong>{draft.primary_impression}</Text></Descriptions.Item>
              <Descriptions.Item label="依据"><ul>{draft.rationale.map((x) => <li key={x}>{x}</li>)}</ul></Descriptions.Item>
              <Descriptions.Item label="鉴别诊断"><Space wrap>{draft.differential.map((x) => <Tag key={x.label}>{x.label} {x.pct}%</Tag>)}</Space></Descriptions.Item>
            </Descriptions>
            <Title level={5}>版本化指南证据</Title>
            {draft.guideline_refs.map((x) => <Card key={x.fragment_id} size="small" style={{ marginBottom: 8 }} title={`${x.title} · ${x.version}`}><Text type="secondary">{x.section}</Text><Paragraph style={{ margin: "6px 0 0" }}>{x.excerpt}</Paragraph></Card>)}
            {draft.research_context.length ? <><Title level={5}>AI4S 工具编排记录</Title><ul>{draft.research_context.map((x) => <li key={x}>{x}</li>)}</ul></> : null}
          </Card>
        </Col>
        <Col xs={24} lg={9}>
          <Card title="医生确认与模型评分">
            <Form form={form} layout="vertical" initialValues={{ agreement_score: 3, diagnosis: draft.primary_impression }}>
              <Form.Item name="diagnosis" label="医生诊断" rules={[{ required: true, message: "请填写医生诊断" }]}><Input.TextArea rows={3} /></Form.Item>
              <Form.Item name="agreement_score" label="与 AI 草案一致度（1–5）" rules={[{ required: true }]}><Rate count={5} /></Form.Item>
              <Form.Item name="final_grade" label="最终分级"><Select allowClear options={[{ value: "低级别" }, { value: "高级别" }, { value: "未确定" }]} /></Form.Item>
              <Form.Item name="physician_name" label="医生姓名/代号"><Input /></Form.Item>
              <Form.Item name="comments" label="反馈说明"><Input.TextArea rows={3} /></Form.Item>
              <Button type="primary" block loading={submitting} onClick={() => void submitFeedback()}>保存反馈（用于质控与后续训练）</Button>
            </Form>
          </Card>
        </Col>
      </Row> : null}
    </div>
  );
}


