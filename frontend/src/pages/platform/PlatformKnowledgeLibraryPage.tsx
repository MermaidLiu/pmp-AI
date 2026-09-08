import {
  ArrowLeftOutlined,
  BookOutlined,
  ExportOutlined,
  FilePptOutlined,
  FileTextOutlined,
  FundOutlined,
  PlusOutlined,
  ReadOutlined,
  RobotOutlined,
  SearchOutlined,
} from "@ant-design/icons";
import { App, Button, Input, Modal, Space, Table, Tag, Typography } from "antd";
import type { ReactNode } from "react";
import { useState } from "react";
import { Link } from "react-router-dom";
import {
  DEFAULT_KNOWLEDGE_QUERY,
  GENERATION_MODULES,
  KNOWLEDGE_SOURCES,
  type KnowledgeLiterature,
} from "../../data/knowledgeLibraryMock";
import {
  platformKnowledgeGenerate,
  platformKnowledgeSearch,
  type AnswerPoint,
} from "../../api/platform";

const { Title, Text, Paragraph } = Typography;

const GEN_ICONS: Record<string, ReactNode> = {
  review: <BookOutlined />,
  paper: <FileTextOutlined />,
  grant: <FundOutlined />,
  ppt: <FilePptOutlined />,
};

function sourceColor(source: KnowledgeLiterature["source"]) {
  const map: Record<string, string> = {
    PubMed: "blue",
    综述: "purple",
    "指南/共识": "green",
    内部文献: "orange",
    专病库: "cyan",
  };
  return map[source] ?? "default";
}

export default function PlatformKnowledgeLibraryPage() {
  const { message } = App.useApp();
  const [query, setQuery] = useState(DEFAULT_KNOWLEDGE_QUERY);
  const [searched, setSearched] = useState(false);
  const [loading, setLoading] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [genModal, setGenModal] = useState<{ key: string; title: string } | null>(null);
  const [genContent, setGenContent] = useState("");
  const [highlightRef, setHighlightRef] = useState<number | null>(null);
  const [literature, setLiterature] = useState<KnowledgeLiterature[]>([]);
  const [answerPoints, setAnswerPoints] = useState<AnswerPoint[]>([]);
  const [stats, setStats] = useState({ hit: 0, reviews: 0, guidelines: 0, selected: 0, verifiable: 0 });
  const [searchMeta, setSearchMeta] = useState<{
    mode: string;
    searched_at: string;
    demo_mixed: boolean;
    source_errors: string[];
  }>({ mode: "formal", searched_at: "", demo_mixed: false, source_errors: [] });

  async function startSearch() {
    if (!query.trim()) {
      message.warning("请输入科研问题");
      return;
    }
    setLoading(true);
    setSearched(false);
    setSelectedIds([]);
    setHighlightRef(null);
    try {
      const res = await platformKnowledgeSearch(query.trim(), KNOWLEDGE_SOURCES, false);
      setLiterature(res.literature as KnowledgeLiterature[]);
      setAnswerPoints(res.answer_points);
      setStats({
        hit: res.stats.hit,
        reviews: res.stats.reviews,
        guidelines: res.stats.guidelines,
        selected: 0,
        verifiable: res.stats.verifiable ?? res.literature.filter((l) => l.verifiable).length,
      });
      setSearchMeta({
        mode: res.search_mode || "formal",
        searched_at: res.searched_at || "",
        demo_mixed: Boolean(res.demo_mixed),
        source_errors: res.source_errors || [],
      });
      setSearched(true);
      const verifiableIds = res.literature.filter((l) => l.verifiable && !l.is_demo).slice(0, 5).map((l) => l.id);
      setSelectedIds(verifiableIds);
      message.success(
        res.search_mode === "demo_isolated"
          ? "演示隔离模式：结果不可用于正式引用"
          : `正式检索完成：${res.literature.length} 篇可核查文献`,
      );
    } catch (e) {
      message.error(e instanceof Error ? e.message : "检索失败");
    } finally {
      setLoading(false);
    }
  }

  function resetSession() {
    setSearched(false);
    setSelectedIds([]);
    setQuery(DEFAULT_KNOWLEDGE_QUERY);
    setGenModal(null);
    setHighlightRef(null);
    setLiterature([]);
    setAnswerPoints([]);
    setStats({ hit: 0, reviews: 0, guidelines: 0, selected: 0, verifiable: 0 });
    setSearchMeta({ mode: "formal", searched_at: "", demo_mixed: false, source_errors: [] });
  }

  function scrollToRef(refNum: number) {
    setHighlightRef(refNum);
    const row = document.getElementById(`lit-row-${refNum}`);
    row?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  async function openGenerate(key: string, title: string) {
    if (!searched) {
      message.info("请先完成检索");
      return;
    }
    if (selectedIds.length === 0) {
      message.warning("请至少选择一篇可核查文献作为证据");
      return;
    }
    const demoSelected = literature.filter((l) => selectedIds.includes(l.id) && l.is_demo);
    if (demoSelected.length) {
      message.error("已选文献含演示数据，无法生成正式论文/综述引用");
      return;
    }
    const unverifiable = literature.filter((l) => selectedIds.includes(l.id) && !l.verifiable);
    if (unverifiable.length) {
      message.error("存在未校验 DOI/PMID 的文献，请仅选择可核查条目");
      return;
    }
    try {
      const res = await platformKnowledgeGenerate(key, query, selectedIds);
      setGenContent(res.content);
      setGenModal({ key, title: res.title || title });
      const stamp = res.generated_at || new Date().toISOString();
      setLiterature((prev) =>
        prev.map((l) =>
          selectedIds.includes(l.id)
            ? {
                ...l,
                cited_at: stamp,
                doi_validation: l.doi_validation
                  ? { ...l.doi_validation, checked_at: l.doi_validation.checked_at || stamp }
                  : l.doi_validation,
                pmid_validation: l.pmid_validation
                  ? { ...l.pmid_validation, checked_at: l.pmid_validation.checked_at || stamp }
                  : l.pmid_validation,
              }
            : l,
        ),
      );
      message.success(`已基于 ${selectedIds.length} 篇可核查文献生成（引用时间 ${stamp}）`);
    } catch (e) {
      message.error(e instanceof Error ? e.message : "生成失败");
    }
  }

  return (
    <div className="pmp-kb-page">
      {/* 顶栏 */}
      <div className="pmp-kb-topbar">
        <Link to="/knowledge">
          <Button type="text" icon={<ArrowLeftOutlined />} size="small" className="pmp-kb-back">
            返回科研延伸
          </Button>
        </Link>
        <Space>
          <Button icon={<PlusOutlined />} onClick={resetSession}>
            新建问答
          </Button>
          <Button type="primary" ghost icon={<ExportOutlined />} onClick={() => message.info("导出记录（演示）")}>
            导出记录
          </Button>
        </Space>
      </div>

      {/* Hero */}
      <div className="pmp-kb-hero">
        <div className="pmp-kb-hero-icon">
          <RobotOutlined />
        </div>
        <div className="pmp-kb-hero-text">
          <Title level={3} style={{ margin: 0, color: "#fff" }}>
            科研知识库智能体
          </Title>
          <Paragraph style={{ margin: "6px 0 10px", color: "rgba(255,255,255,0.88)", fontSize: 14 }}>
            科研问答 · 文献检索 · 一键生成综述 / 论文 / 基金 / PPT
          </Paragraph>
          <Space wrap size={[6, 6]}>
            <Tag color="success" style={{ margin: 0 }}>
              正式模式：PubMed / 指南库 / 院内文献
            </Tag>
            <Tag color="processing" style={{ margin: 0 }}>
              演示数据已隔离
            </Tag>
            {KNOWLEDGE_SOURCES.map((s) => (
              <Tag key={s} style={{ margin: 0, background: "rgba(255,255,255,0.15)", border: "none", color: "#fff" }}>
                {s}
              </Tag>
            ))}
          </Space>
        </div>
      </div>

      {/* 检索区 */}
      <div className="pmp-kb-search-card">
        <Text strong style={{ fontSize: 14 }}>
          直接输入科研问题
        </Text>
        <Paragraph type="secondary" style={{ margin: "4px 0 12px", fontSize: 12 }}>
          正式检索对接 PubMed、本地版本化指南库与院内文献库；保存 DOI/PMID 校验结果与引用生成时间。演示种子永不混入正式结果。
        </Paragraph>
        <div className="pmp-kb-search-row">
          <Input
            size="large"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="PMP 最新研究热点是什么？"
            onPressEnter={startSearch}
            className="pmp-kb-search-input"
          />
          <Button type="primary" size="large" icon={<SearchOutlined />} loading={loading} onClick={startSearch}>
            开始检索
          </Button>
        </div>
      </div>

      <div className="pmp-kb-grid">
        <div className="pmp-kb-main">
          {searched ? (
            <>
              <div className="pmp-card pmp-kb-summary">
                <div className="pmp-kb-section-head">
                  <ReadOutlined style={{ color: "#7c3aed" }} />
                  <span>回答摘要</span>
                  <Tag color="purple">{searchMeta.mode === "formal" ? "正式可核查" : "演示隔离"}</Tag>
                  {searchMeta.searched_at ? (
                    <Text type="secondary" style={{ fontSize: 11, marginLeft: "auto" }}>
                      检索时间 {searchMeta.searched_at}
                    </Text>
                  ) : null}
                </div>
                <div className="pmp-kb-answer-list">
                  {answerPoints.map((p, i) => (
                    <div key={i} className="pmp-kb-answer-item">
                      <div className="pmp-kb-answer-text">
                        <Text strong style={{ color: "#7c3aed", marginRight: 6 }}>
                          研究热点{["一", "二", "三", "四"][i]}：
                        </Text>
                        {p.text.replace(/^研究热点[一二三四]：/, "")}
                      </div>
                      <Space size={4} wrap className="pmp-kb-answer-refs">
                        {p.refs.map((r) => (
                          <Button key={r} size="small" type={highlightRef === r ? "primary" : "default"} onClick={() => scrollToRef(r)}>
                            依据 [{r}]
                          </Button>
                        ))}
                      </Space>
                    </div>
                  ))}
                </div>
                <div className="pmp-kb-trust-note">
                  可信度说明：仅 verifiable=true 且非演示的文献可纳入正式结论；生成综述/论文时会写入 DOI/PMID
                  校验状态与引用生成时间。无校验通过的引用不会写入正式文稿。
                  {searchMeta.source_errors.length ? (
                    <div style={{ marginTop: 6 }}>源提示：{searchMeta.source_errors.join("；")}</div>
                  ) : null}
                </div>
              </div>

              <div className="pmp-card pmp-kb-lit-table">
                <div className="pmp-kb-section-head">
                  <FileTextOutlined style={{ color: "#1677ff" }} />
                  <span>可查实文献列表</span>
                  <Text type="secondary" style={{ fontSize: 12, marginLeft: "auto" }}>
                    展示 Top {literature.length} · 全库命中 {stats.hit} · 已选 {selectedIds.length}
                  </Text>
                </div>
                <Table
                  size="middle"
                  rowKey="id"
                  pagination={{ pageSize: 8, showSizeChanger: false }}
                  dataSource={literature}
                  rowClassName={(_, index) => (highlightRef === index + 1 ? "pmp-kb-row-highlight" : "")}
                  onRow={(_, index) => ({ id: `lit-row-${(index ?? 0) + 1}` })}
                  rowSelection={{
                    selectedRowKeys: selectedIds,
                    onChange: (keys) => setSelectedIds(keys as string[]),
                    columnTitle: "选择",
                  }}
                  scroll={{ x: 900 }}
                  columns={[
                    {
                      title: "文献标题",
                      dataIndex: "title",
                      ellipsis: true,
                      render: (t: string, _, i) => (
                        <span>
                          <Text type="secondary">[{i + 1}] </Text>
                          {t}
                        </span>
                      ),
                    },
                    {
                      title: "来源",
                      dataIndex: "source",
                      width: 100,
                      render: (s: KnowledgeLiterature["source"]) => <Tag color={sourceColor(s)}>{s}</Tag>,
                    },
                    { title: "年份", dataIndex: "year", width: 64, align: "center" },
                    {
                      title: "DOI / PMID",
                      width: 160,
                      render: (_, r) => (
                        <Space direction="vertical" size={0}>
                          <Text type="secondary" style={{ fontSize: 11 }}>
                            {r.pmid && r.pmid !== "—" ? `PMID ${r.pmid}` : r.doi ? `DOI ${r.doi.slice(0, 18)}` : "—"}
                          </Text>
                          <Space size={4} wrap>
                            {r.pmid_validation?.status ? (
                              <Tag
                                color={
                                  r.pmid_validation.status === "valid"
                                    ? "success"
                                    : r.pmid_validation.status === "invalid"
                                      ? "error"
                                      : "default"
                                }
                                style={{ margin: 0, fontSize: 10 }}
                              >
                                PMID {r.pmid_validation.status}
                              </Tag>
                            ) : null}
                            {r.doi && r.doi_validation?.status ? (
                              <Tag
                                color={r.doi_validation.status === "valid" ? "success" : "default"}
                                style={{ margin: 0, fontSize: 10 }}
                              >
                                DOI {r.doi_validation.status}
                              </Tag>
                            ) : null}
                          </Space>
                        </Space>
                      ),
                    },
                    {
                      title: "可核查",
                      width: 88,
                      align: "center",
                      render: (_, r) =>
                        r.is_demo ? (
                          <Tag color="error">演示</Tag>
                        ) : r.verifiable ? (
                          <Tag color="success">是</Tag>
                        ) : (
                          <Tag>否</Tag>
                        ),
                    },
                    {
                      title: "引用时间",
                      width: 120,
                      render: (_, r) => (
                        <Text type="secondary" style={{ fontSize: 10 }}>
                          {r.cited_at || "—"}
                        </Text>
                      ),
                    },
                    {
                      title: "相关度",
                      dataIndex: "relevance",
                      width: 80,
                      align: "center",
                      render: (v: number) => (
                        <span className={`pmp-kb-relevance${v >= 90 ? " pmp-kb-relevance--high" : ""}`}>{v}%</span>
                      ),
                    },
                    {
                      title: "操作",
                      width: 200,
                      fixed: "right",
                      render: (_, r, i) => (
                        <Space size={0} wrap>
                          <Button
                            type="link"
                            size="small"
                            disabled={Boolean(r.is_demo)}
                            onClick={() => {
                              if (r.pmid && r.pmid !== "—") {
                                window.open(`https://pubmed.ncbi.nlm.nih.gov/${r.pmid}/`, "_blank");
                              } else if (r.doi && r.doi !== "—") {
                                window.open(`https://doi.org/${r.doi}`, "_blank");
                              } else {
                                message.info(r.excerpt || r.title);
                              }
                            }}
                          >
                            查看原文
                          </Button>
                          <Button
                            type="link"
                            size="small"
                            disabled={Boolean(r.is_demo) || !r.verifiable}
                            onClick={() => {
                              setSelectedIds((prev) => (prev.includes(r.id) ? prev : [...prev, r.id]));
                              message.success("已加入可核查证据");
                            }}
                          >
                            加入证据
                          </Button>
                          <Button
                            type="link"
                            size="small"
                            disabled={Boolean(r.is_demo) || !r.verifiable}
                            onClick={() => {
                              const cite = [
                                `[${i + 1}] ${r.title}`,
                                r.pmid ? `PMID:${r.pmid}` : "",
                                r.doi ? `DOI:${r.doi}` : "",
                                r.pmid_validation?.status
                                  ? `PMID校验:${r.pmid_validation.status}@${r.pmid_validation.checked_at}`
                                  : "",
                                r.doi_validation?.status && r.doi
                                  ? `DOI校验:${r.doi_validation.status}@${r.doi_validation.checked_at}`
                                  : "",
                                `cited_at:${r.cited_at || ""}`,
                              ]
                                .filter(Boolean)
                                .join(" | ");
                              void navigator.clipboard?.writeText(cite);
                              message.success("已复制含校验元数据的引用");
                            }}
                          >
                            引用
                          </Button>
                        </Space>
                      ),
                    },
                  ]}
                />
              </div>
            </>
          ) : (
            <div className="pmp-card pmp-kb-empty">
              <div className="pmp-kb-empty-icon">
                <SearchOutlined />
              </div>
              <Title level={4} style={{ marginBottom: 8 }}>
                输入科研问题，开始正式检索
              </Title>
              <Paragraph type="secondary" style={{ maxWidth: 420, textAlign: "center" }}>
                结果仅来自 PubMed / 指南库 / 院内文献；演示种子严格隔离。生成论文时会保存 DOI/PMID 校验与引用时间。
              </Paragraph>
            </div>
          )}
        </div>

        <div className="pmp-kb-side">
          <div className="pmp-card pmp-kb-stats-card">
            <div className="pmp-kb-section-head" style={{ marginBottom: 12 }}>
              <span>检索统计</span>
            </div>
            <div className="pmp-kb-stats-grid">
              {[
                { label: "命中文献", value: stats.hit, color: "#1677ff" },
                { label: "可核查", value: stats.verifiable, color: "#3f8600" },
                { label: "指南/共识", value: stats.guidelines, color: "#7c3aed" },
                { label: "已选证据", value: selectedIds.length, color: "#d48806" },
              ].map((s) => (
                <div key={s.label} className="pmp-kb-stat-box">
                  <div className="pmp-kb-stat-num" style={{ color: s.color }}>
                    {searched ? s.value : "—"}
                  </div>
                  <div className="pmp-kb-stat-lbl">{s.label}</div>
                </div>
              ))}
            </div>
          </div>

          <Text type="secondary" style={{ fontSize: 12, display: "block", margin: "4px 0 10px", paddingLeft: 2 }}>
            基于可核查文献继续生成
          </Text>

          {GENERATION_MODULES.map((m) => (
            <button
              key={m.key}
              type="button"
              className="pmp-kb-gen-module"
              style={{ borderLeftColor: m.color }}
              onClick={() => openGenerate(m.key, m.title)}
              disabled={!searched}
            >
              <div className="pmp-kb-gen-module-head">
                <span className="pmp-kb-gen-icon" style={{ color: m.color, background: `${m.color}14` }}>
                  {GEN_ICONS[m.icon]}
                </span>
                <Text strong>{m.title}</Text>
              </div>
              <Paragraph type="secondary" style={{ fontSize: 12, margin: "8px 0" }}>
                {m.desc}
              </Paragraph>
              <Space wrap size={[4, 4]}>
                {m.outputs.map((o) => (
                  <Tag key={o} style={{ margin: 0, fontSize: 11 }}>
                    {o}
                  </Tag>
                ))}
              </Space>
            </button>
          ))}

          <Paragraph type="secondary" className="pmp-kb-side-tip">
            提示：可手动勾选文献，或由智能体自动选取高相关度证据后再生成。
          </Paragraph>
        </div>
      </div>

      <Modal
        title={genModal?.title}
        open={!!genModal}
        onCancel={() => setGenModal(null)}
        width={760}
        footer={[
          <Button key="export" onClick={() => message.success("已导出 Word（演示）")}>
            导出 Word
          </Button>,
          <Button key="ok" type="primary" onClick={() => setGenModal(null)}>
            完成
          </Button>,
        ]}
      >
        <pre className="pmp-kb-modal-pre">{genContent}</pre>
      </Modal>
    </div>
  );
}
