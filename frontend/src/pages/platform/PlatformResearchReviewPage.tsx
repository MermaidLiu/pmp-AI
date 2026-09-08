import { CheckCircleOutlined, ReadOutlined, SearchOutlined } from "@ant-design/icons";
import { Alert, App, Button, Col, Input, List, Progress, Row, Space, Tag, Typography } from "antd";
import { useState } from "react";
import { Link } from "react-router-dom";
import {
  platformKnowledgeGenerate,
  platformKnowledgeSearch,
  type KnowledgeLiterature,
} from "../../api/platform";
import { KNOWLEDGE_SOURCES } from "../../data/knowledgeLibraryMock";

const { Title, Paragraph, Text } = Typography;

const TOPIC_SUGGESTIONS = [
  "PMP 影像代谢参数与病理分级相关性",
  "DPAM vs PMCA 预后因素比较",
  "CRS+HIPEC 后 PET 随访时机",
  "腹膜假粘液瘤治疗指南共识",
];

export default function PlatformResearchReviewPage() {
  const { message } = App.useApp();
  const [topic, setTopic] = useState(TOPIC_SUGGESTIONS[0]);
  const [outline, setOutline] = useState("");
  const [literature, setLiterature] = useState<KnowledgeLiterature[]>([]);
  const [searchMeta, setSearchMeta] = useState<{ searched_at: string; mode: string }>({
    searched_at: "",
    mode: "",
  });
  const [loadingSearch, setLoadingSearch] = useState(false);
  const [loadingGen, setLoadingGen] = useState(false);

  async function searchLiterature() {
    if (!topic.trim()) {
      message.warning("请输入综述主题");
      return;
    }
    setLoadingSearch(true);
    setOutline("");
    try {
      const res = await platformKnowledgeSearch(topic.trim(), KNOWLEDGE_SOURCES, false);
      const formal = res.literature.filter((l) => !l.is_demo);
      setLiterature(formal);
      setSearchMeta({ searched_at: res.searched_at || "", mode: res.search_mode || "formal" });
      if (res.demo_mixed) {
        message.warning("检测到演示混入风险，已过滤演示条目");
      }
      message.success(`正式检索完成：${formal.length} 篇（演示数据已隔离）`);
    } catch (e) {
      message.error(e instanceof Error ? e.message : "文献检索失败");
    } finally {
      setLoadingSearch(false);
    }
  }

  async function generate() {
    if (!topic.trim()) {
      message.warning("请输入综述主题");
      return;
    }
    const verifiable = literature.filter((l) => l.verifiable && !l.is_demo);
    if (!verifiable.length) {
      message.warning("请先检索并获得可核查文献（含 DOI/PMID 校验）后再生成综述");
      return;
    }
    setLoadingGen(true);
    try {
      const res = await platformKnowledgeGenerate(
        "review",
        topic.trim(),
        verifiable.map((l) => l.id),
      );
      setOutline(res.content);
      const stamp = res.generated_at || new Date().toISOString();
      setLiterature((prev) =>
        prev.map((l) => (l.verifiable && !l.is_demo ? { ...l, cited_at: stamp } : l)),
      );
      message.success(`已基于 ${verifiable.length} 篇可核查文献生成综述（引用时间 ${stamp}）`);
    } catch (e) {
      message.error(e instanceof Error ? e.message : "综述生成失败");
    } finally {
      setLoadingGen(false);
    }
  }

  return (
    <div className="pmp-section">
      <Title level={4} style={{ marginBottom: 16 }}>
        <ReadOutlined style={{ marginRight: 8, color: "#1677ff" }} />
        综述生成
      </Title>

      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
        message="正式文献模式：与演示数据严格隔离"
        description={
          <span>
            对接 PubMed、本地版本化指南库与院内文献库；仅展示 DOI/PMID 校验通过的条目，并记录引用生成时间。更完整的问答与论文生成请使用{" "}
            <Link to="/knowledge/library">知识库工作台</Link>。
          </span>
        }
      />

      <div className="pmp-card" style={{ padding: 16, marginBottom: 16 }}>
        <Paragraph type="secondary" style={{ marginBottom: 12 }}>
          输入综述主题后先正式检索文献，再基于可核查引用生成大纲（不含不可核查 PMID）。
        </Paragraph>
        <Space.Compact style={{ width: "100%", maxWidth: 720 }}>
          <Input
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="如：PMP 影像代谢与病理分级"
          />
          <Button icon={<SearchOutlined />} loading={loadingSearch} onClick={searchLiterature}>
            正式检索
          </Button>
          <Button type="primary" loading={loadingGen} onClick={generate}>
            生成综述
          </Button>
        </Space.Compact>
        <Space wrap style={{ marginTop: 12 }}>
          {TOPIC_SUGGESTIONS.map((t) => (
            <Tag key={t} style={{ cursor: "pointer" }} onClick={() => setTopic(t)}>
              {t}
            </Tag>
          ))}
        </Space>
        {searchMeta.searched_at ? (
          <Paragraph type="secondary" style={{ marginTop: 8, marginBottom: 0, fontSize: 12 }}>
            检索模式：{searchMeta.mode} · 检索时间：{searchMeta.searched_at}
          </Paragraph>
        ) : null}
      </div>

      <Row gutter={16}>
        <Col xs={24} lg={12}>
          <div className="pmp-card" style={{ padding: 16, marginBottom: 16 }}>
            <div className="pmp-panel-title">综述大纲</div>
            {outline ? (
              <pre
                style={{
                  whiteSpace: "pre-wrap",
                  fontSize: 12,
                  lineHeight: 1.7,
                  margin: 0,
                  maxHeight: 420,
                  overflow: "auto",
                }}
              >
                {outline}
              </pre>
            ) : (
              <Paragraph type="secondary">检索可核查文献后点击「生成综述」显示大纲</Paragraph>
            )}
          </div>
        </Col>
        <Col xs={24} lg={12}>
          <div className="pmp-card" style={{ padding: 16, marginBottom: 16 }}>
            <div className="pmp-panel-title">文献助手 · 可核查引用</div>
            <List
              size="small"
              locale={{ emptyText: "尚未检索；演示文献不会出现在此列表" }}
              dataSource={literature}
              renderItem={(item) => (
                <List.Item>
                  <List.Item.Meta
                    title={
                      <Space wrap size={4}>
                        <Text style={{ fontSize: 13 }} ellipsis>
                          {item.title}
                        </Text>
                        {item.verifiable ? (
                          <Tag color="success" icon={<CheckCircleOutlined />}>
                            可核查
                          </Tag>
                        ) : (
                          <Tag color="warning">待校验</Tag>
                        )}
                      </Space>
                    }
                    description={
                      <Space direction="vertical" size={4}>
                        <Text type="secondary" style={{ fontSize: 11 }}>
                          {item.source}
                          {item.journal ? ` · ${item.journal}` : ""}
                          {item.year ? ` · ${item.year}` : ""}
                          {item.pmid && item.pmid !== "—" ? ` · PMID ${item.pmid}` : ""}
                          {item.doi ? ` · DOI ${item.doi}` : ""}
                        </Text>
                        <Space wrap size={4}>
                          {item.pmid_validation ? (
                            <Tag style={{ fontSize: 11 }}>PMID {item.pmid_validation.status}</Tag>
                          ) : null}
                          {item.doi_validation ? (
                            <Tag style={{ fontSize: 11 }}>DOI {item.doi_validation.status}</Tag>
                          ) : null}
                          {item.cited_at ? (
                            <Text type="secondary" style={{ fontSize: 11 }}>
                              引用生成：{item.cited_at}
                            </Text>
                          ) : null}
                        </Space>
                        <Progress
                          percent={item.relevance}
                          size="small"
                          strokeColor="#1677ff"
                          format={(p) => `相关度 ${p}%`}
                        />
                      </Space>
                    }
                  />
                </List.Item>
              )}
            />
          </div>
        </Col>
      </Row>
    </div>
  );
}
