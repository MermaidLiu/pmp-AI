import { BookOutlined, BulbOutlined } from "@ant-design/icons";
import { App, Button, List, Space, Tag, Typography } from "antd";
import { useState } from "react";
import { Link } from "react-router-dom";
import { platformPublicationTopics, type PublicationTopic } from "../../api/platform";
import WorkflowContextBanner from "../../components/platform/WorkflowContextBanner";
import { loadModuleResults } from "../../lib/researchModuleResults";
import { buildResearchWorkflowPayload, getWorkflowContext } from "../../lib/workflowContext";

const { Title, Paragraph, Text } = Typography;

function TopicList({ items, color }: { items: PublicationTopic[]; color: string }) {
  return (
    <List
      size="small"
      dataSource={items}
      renderItem={(item) => (
        <List.Item>
          <div style={{ width: "100%" }}>
            <Space wrap style={{ marginBottom: 4 }}>
              <Tag color={color}>{item.status}</Tag>
              <Text type="secondary">相关度 {item.relevance}%</Text>
            </Space>
            <Text strong style={{ display: "block", marginBottom: 4 }}>
              {item.title}
            </Text>
            <Text type="secondary" style={{ fontSize: 12 }}>
              {item.note}
            </Text>
          </div>
        </List.Item>
      )}
    />
  );
}

export default function PlatformResearchPublicationPage() {
  const { message } = App.useApp();
  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState("");
  const [existing, setExisting] = useState<PublicationTopic[]>([]);
  const [novel, setNovel] = useState<PublicationTopic[]>([]);

  async function generate() {
    setLoading(true);
    try {
      const ctx = getWorkflowContext();
      const linked = loadModuleResults();
      const payload = {
        ...buildResearchWorkflowPayload(ctx),
        radiomics_summary: linked.imaging?.summary || "",
        radiomics_auc: linked.imaging?.auc,
        modality: "CT",
      };
      const res = await platformPublicationTopics(payload);
      setSummary(res.summary);
      setExisting(res.existing_topics);
      setNovel(res.novel_topics);
      message.success("已生成论文选题建议");
    } catch (e) {
      message.error(e instanceof Error ? e.message : "生成失败");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="pmp-section">
      <Title level={4} style={{ marginBottom: 8 }}>
        <BookOutlined style={{ marginRight: 8, color: "#1677ff" }} />
        科研选题 · 论文题目建议
      </Title>
      <Paragraph type="secondary" style={{ marginBottom: 16 }}>
        基于智能分析标注图、组学建模结果，列出市面已有研究与尚无人做过的创新方向。
      </Paragraph>

      <WorkflowContextBanner compact />

      <div className="pmp-card" style={{ padding: 16, marginBottom: 16 }}>
        <Button type="primary" loading={loading} onClick={() => void generate()}>
          生成论文选题
        </Button>
        <Link to="/knowledge/ppt" style={{ marginLeft: 12 }}>
          <Button>前往 PPT 生成</Button>
        </Link>
      </div>

      {summary ? (
        <AlertLike summary={summary} />
      ) : null}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <div className="pmp-card" style={{ padding: 16 }}>
          <Title level={5}>
            <BookOutlined /> 市面已有（类似研究）
          </Title>
          <TopicList items={existing} color="default" />
        </div>
        <div className="pmp-card" style={{ padding: 16 }}>
          <Title level={5}>
            <BulbOutlined style={{ color: "#faad14" }} /> 创新方向（尚少有人做）
          </Title>
          <TopicList items={novel} color="gold" />
        </div>
      </div>
    </div>
  );
}

function AlertLike({ summary }: { summary: string }) {
  return (
    <div className="pmp-card" style={{ padding: 12, marginBottom: 16, background: "#f6ffed", border: "1px solid #b7eb8f" }}>
      <Text>{summary}</Text>
    </div>
  );
}
