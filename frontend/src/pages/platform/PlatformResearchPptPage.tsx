import { FilePptOutlined, UploadOutlined } from "@ant-design/icons";
import { App, Button, Col, Input, List, Radio, Row, Space, Tag, Typography, Upload } from "antd";
import type { UploadFile } from "antd/es/upload/interface";
import { useState } from "react";
import { platformPptGenerate, type PptSlide } from "../../api/platform";
import WorkflowContextBanner from "../../components/platform/WorkflowContextBanner";
import { loadModuleResults } from "../../lib/researchModuleResults";
import { getWorkflowContext } from "../../lib/workflowContext";

const { Title, Paragraph, Text } = Typography;

const SCENARIOS = [
  { value: "leadership", label: "领导汇报", desc: "结论优先、资源与计划" },
  { value: "academic", label: "学术分享", desc: "Methods / Results / Discussion" },
  { value: "government", label: "政府汇报", desc: "建设成效与社会效益" },
] as const;

export default function PlatformResearchPptPage() {
  const { message } = App.useApp();
  const [title, setTitle] = useState("PMP 专病库科研汇报");
  const [scenario, setScenario] = useState<"leadership" | "academic" | "government">("leadership");
  const [templateFile, setTemplateFile] = useState<UploadFile | null>(null);
  const [slides, setSlides] = useState<PptSlide[] | null>(null);
  const [activePage, setActivePage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [templateNote, setTemplateNote] = useState("");

  async function generate() {
    setLoading(true);
    try {
      const ctx = getWorkflowContext();
      const linked = loadModuleResults();
      const res = await platformPptGenerate({
        scenario,
        title,
        pathology_grade: ctx.pathology?.grade_label,
        dicom_count: ctx.pathology?.dicom_count,
        radiomics_summary: linked.imaging?.summary,
        template_filename: templateFile?.name,
      });
      setSlides(res.slides);
      setTemplateNote(res.template_note);
      setActivePage(1);
      message.success(`已生成 ${res.slides.length} 页 ${SCENARIOS.find((s) => s.value === scenario)?.label} PPT 内容`);
    } catch (e) {
      message.error(e instanceof Error ? e.message : "生成失败");
    } finally {
      setLoading(false);
    }
  }

  const current = slides?.find((s) => s.page === activePage);

  return (
    <div className="pmp-section">
      <Title level={4} style={{ marginBottom: 8 }}>
        <FilePptOutlined style={{ marginRight: 8, color: "#1677ff" }} />
        PPT 生成
      </Title>
      <Paragraph type="secondary" style={{ marginBottom: 16 }}>
        上传 PPT 模板（可选），平台自动填充智能分析、组学建模与科研选题内容。
      </Paragraph>

      <WorkflowContextBanner compact />

      <div className="pmp-card" style={{ padding: 16, marginBottom: 16 }}>
        <Space direction="vertical" style={{ width: "100%" }} size={12}>
          <Text strong>汇报场景</Text>
          <Radio.Group
            value={scenario}
            onChange={(e) => setScenario(e.target.value)}
            optionType="button"
            buttonStyle="solid"
          >
            {SCENARIOS.map((s) => (
              <Radio.Button key={s.value} value={s.value}>
                {s.label}
              </Radio.Button>
            ))}
          </Radio.Group>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="演示文稿标题" />
          <Upload
            maxCount={1}
            accept=".ppt,.pptx"
            fileList={templateFile ? [templateFile] : []}
            beforeUpload={() => false}
            onChange={({ fileList }) => setTemplateFile(fileList[0] ?? null)}
          >
            <Button icon={<UploadOutlined />}>上传 PPT 模板（.ppt / .pptx）</Button>
          </Upload>
          <Button type="primary" loading={loading} onClick={() => void generate()}>
            生成 PPT 内容
          </Button>
          {templateNote ? <Text type="secondary" style={{ fontSize: 12 }}>{templateNote}</Text> : null}
        </Space>
      </div>

      <Row gutter={16}>
        <Col xs={24} md={8}>
          <div className="pmp-card" style={{ padding: 16 }}>
            <div className="pmp-panel-title">幻灯片列表</div>
            {slides ? (
              <List
                size="small"
                dataSource={slides}
                renderItem={(item) => (
                  <List.Item
                    style={{
                      cursor: "pointer",
                      background: item.page === activePage ? "#f0f7ff" : undefined,
                      borderRadius: 6,
                      padding: "8px 12px",
                    }}
                    onClick={() => setActivePage(item.page)}
                  >
                    <Text>
                      {item.page}. {item.title}
                    </Text>
                  </List.Item>
                )}
              />
            ) : (
              <Paragraph type="secondary">生成后将显示页纲</Paragraph>
            )}
          </div>
        </Col>
        <Col xs={24} md={16}>
          <div className="pmp-card" style={{ padding: 24, minHeight: 360 }}>
            {current ? (
              <>
                <Tag color="blue">第 {current.page} 页 · {SCENARIOS.find((s) => s.value === scenario)?.label}</Tag>
                <Title level={3} style={{ marginTop: 16, marginBottom: 24 }}>
                  {current.title}
                </Title>
                <ul style={{ fontSize: 16, lineHeight: 2, color: "#374151" }}>
                  {current.bullets.map((b) => (
                    <li key={b}>{b}</li>
                  ))}
                </ul>
              </>
            ) : (
              <Paragraph type="secondary" style={{ textAlign: "center", marginTop: 120 }}>
                幻灯片预览区
              </Paragraph>
            )}
          </div>
        </Col>
      </Row>
    </div>
  );
}
