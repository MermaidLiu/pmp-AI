import {
  App,
  Alert,
  Button,
  Checkbox,
  Divider,
  Input,
  Space,
  Table,
  Tabs,
  Typography,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import { useCallback, useEffect, useMemo, useState } from "react";
import { outputCaseReview, outputPpt, outputReport, runAgentExtended } from "../api/client";
import { demoRecord } from "../data/demoRecord";
import { readLastDisease } from "../lib/lastDisease";

const DIRECTION_OPTIONS = [
  "PET 代谢定量与炎症/免疫标志物",
  "随访时间轴与病理确诊衔接",
  "亚组分型与预后模型",
  "多中心队列与外部验证",
  "诊疗路径与卫生经济学",
];

type TopicRow = {
  key: string;
  title: string;
  landscape: string;
  gap: "已有多篇报道" | "领域内空白 / 可做";
};

function buildTopicRows(diseaseCode: string, diseaseName: string): TopicRow[] {
  const label = diseaseName || diseaseCode || "目标病种";
  return [
    {
      key: "done1",
      title: `${label} 相关 18F-FDG PET/CT 代谢参数与常规炎症指标的相关性`,
      landscape: "国内外回顾性队列与荟萃分析均有报道",
      gap: "已有多篇报道",
    },
    {
      key: "done2",
      title: `${label} 患者 SUVmax/MTV/TLG 与治疗反应的关系`,
      landscape: "肿瘤与炎症场景均有类似研究",
      gap: "已有多篇报道",
    },
    {
      key: "gap1",
      title: `本院 ${label} 专病库：PET 表型 + 病理时间轴 + 激素/免疫调节用药的多模态结局`,
      landscape: "公开文献中同质数据链较少",
      gap: "领域内空白 / 可做",
    },
    {
      key: "gap2",
      title: `${label} 亚组：肌酐/尿素氮分层下的肾脏摄取与假阳性控制`,
      landscape: "多为个案或方法学讨论",
      gap: "领域内空白 / 可做",
    },
    {
      key: "gap3",
      title: `发热待查路径中 PET-CT 检查时机与卫生经济学评价（单中心真实世界）`,
      landscape: "卫生经济学证据零散",
      gap: "领域内空白 / 可做",
    },
  ];
}

function buildPaperOutline(selectedTitle: string, directions: string[], diseaseLabel: string): string {
  const dir = directions.length ? directions.join("；") : "（未勾选，可在上方选择）";
  return [
    `# 研究题目：${selectedTitle}`,
    "",
    "## 摘要",
    "- 目的 · 方法 · 结果 · 结论（占位）",
    "",
    "## 1 引言",
    `- 疾病负担与 ${diseaseLabel} 临床痛点`,
    "- PET-CT 在该路径中的定位与证据缺口",
    "",
    "## 2 材料与方法",
    `- 数据来源：PMP Agent 专病库 / 诊断结果模块沉淀字段`,
    `- 暴露：PET 定量（SUV/MTV/TLG）与影像表型`,
    `- 结局：病理确诊、转归、再入院等（按方向调整）`,
    `- 统计：描述 + 回归 / 生存分析（占位）`,
    "",
    "## 3 结果",
    "- 表 1 基线特征",
    "- 图 1–2 主要效应与敏感性分析",
    "",
    "## 4 讨论",
    `- 与已定科研方向对齐：${dir}`,
    "- 局限性：单中心、回顾性、选择偏倚",
    "",
    "## 5 结论与转化",
    "- 论文 / 指南证据 / 专利或软件著作权占位",
  ].join("\n");
}

export default function ModuleOutputs() {
  const { message } = App.useApp();
  const [mainTab, setMainTab] = useState("agent");
  const [tab, setTab] = useState("flow");
  const [topic, setTopic] = useState("诊断结果与 PET 代谢指标的相关性研究");
  const [agentOut, setAgentOut] = useState<Record<string, string> | null>(null);
  const [agentLoading, setAgentLoading] = useState(false);
  const [report, setReport] = useState("");
  const [ppt, setPpt] = useState<string>("");
  const [review, setReview] = useState("");
  const [lastDis, setLastDis] = useState(() => readLastDisease());
  const [directions, setDirections] = useState<string[]>([DIRECTION_OPTIONS[0]!]);
  const [selectedTopicKey, setSelectedTopicKey] = useState<string>("gap1");
  const [outline, setOutline] = useState("");
  const record = demoRecord;

  useEffect(() => {
    setLastDis(readLastDisease());
  }, []);

  const diseaseLabel = useMemo(() => {
    const code = record.research_extensions?.primary_disease_code?.trim() || "";
    const name = record.research_extensions?.primary_disease_name?.trim() || "";
    if (lastDis && (lastDis.code !== "—" || lastDis.name !== "—")) {
      return `${lastDis.name}（${lastDis.code}）`;
    }
    if (name || code) return `${name || "—"}（${code || "—"}）`;
    return "尚未在「分病种」定型（使用演示病例字段）";
  }, [lastDis, record.research_extensions]);

  const topicRows = useMemo(() => {
    const code = lastDis?.code && lastDis.code !== "—" ? lastDis.code : record.research_extensions?.primary_disease_code || "FUO";
    const name = lastDis?.name && lastDis.name !== "—" ? lastDis.name : record.research_extensions?.primary_disease_name || "";
    return buildTopicRows(code, name);
  }, [lastDis, record.research_extensions]);

  const selectedTopicTitle = useMemo(
    () => topicRows.find((r) => r.key === selectedTopicKey)?.title ?? topicRows[0]?.title ?? "",
    [topicRows, selectedTopicKey],
  );

  const topicColumns: ColumnsType<TopicRow> = [
    { title: "科研题目", dataIndex: "title", key: "title", ellipsis: true },
    { title: "文献与全网概况（示意）", dataIndex: "landscape", key: "landscape", width: 220, ellipsis: true },
    { title: "空白度", dataIndex: "gap", key: "gap", width: 140 },
  ];

  const loadMaterials = useCallback(async () => {
    try {
      const r = await outputReport(record, {
        cohort_hint: "可纳入专病库做 SUV 分层与随访终点",
        distill: "见「科研分析」模块输出",
        research_directions: directions.join("；"),
        generate_review: false,
      });
      setReport(r.content);
      message.success("申报材料骨架已生成");
    } catch {
      message.error("报告失败");
    }
  }, [directions, message, record]);

  const loadReview = useCallback(async () => {
    try {
      const r = await outputReport(record, {
        cohort_hint: "综述需衔接队列与病理时间轴",
        distill: "—",
        research_directions: directions.join("；"),
        generate_review: true,
        review_topic: selectedTopicTitle,
      });
      setReport(r.content);
      message.success("综述草稿段落已写入同一 Markdown（可再拆分）");
    } catch {
      message.error("综述失败");
    }
  }, [directions, message, record, selectedTopicTitle]);

  const loadPptForTopic = useCallback(async () => {
    try {
      const r = await outputPpt(record, selectedTopicTitle);
      setPpt(JSON.stringify(r.slides, null, 2));
      message.success("已按选定题目生成 PPT 提纲");
    } catch {
      message.error("PPT 失败");
    }
  }, [message, record, selectedTopicTitle]);

  const loadCaseReview = useCallback(async () => {
    try {
      const r = await outputCaseReview(record);
      setReview(JSON.stringify(r, null, 2));
      message.success("复盘结构已生成");
    } catch {
      message.error("复盘失败");
    }
  }, [message, record]);

  const generateOutlineLocal = useCallback(() => {
    const code = record.research_extensions?.primary_disease_code || "FUO";
    const name = record.research_extensions?.primary_disease_name || "";
    const label = lastDis?.name ? `${lastDis.name}（${lastDis.code}）` : `${name || code}（${code}）`;
    setOutline(buildPaperOutline(selectedTopicTitle, directions, label));
    message.success("已生成本页大纲（可再接 LLM 扩写）");
  }, [directions, lastDis, message, record.research_extensions, selectedTopicTitle]);

  async function runAgent() {
    setAgentLoading(true);
    try {
      const res = await runAgentExtended({
        record: demoRecord,
        research_topic: topic,
        tasks: ["topic", "distill", "stats", "cohort_hint", "paper", "pathology", "treatment"],
      });
      setAgentOut(res.parts);
      message.success("科研分析完成，可切换至成果转化继续输出");
    } catch {
      message.error("科研分析失败");
    } finally {
      setAgentLoading(false);
    }
  }

  useEffect(() => {
    if (mainTab === "outputs" && tab === "report" && !report) void loadMaterials();
    if (mainTab === "outputs" && tab === "ppt" && !ppt) void loadPptForTopic();
    if (mainTab === "outputs" && tab === "review" && !review) void loadCaseReview();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 按 tab 懒加载
  }, [mainTab, tab]);

  return (
    <div>
      <Typography.Title level={4} className="glass-page-title">
        科研与转化
      </Typography.Title>
      <Typography.Paragraph type="secondary" style={{ maxWidth: 900 }}>
        工作台第 6 步：先运行科研智能体完成选题、蒸馏、统计与论文骨架，再勾选方向生成申报材料、综述、大纲与 PPT，完成成果转化。
      </Typography.Paragraph>

      <Tabs
        activeKey={mainTab}
        onChange={setMainTab}
        items={[
          {
            key: "agent",
            label: "科研分析",
            children: (
              <div>
                <Input.TextArea
                  rows={2}
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  style={{ maxWidth: 720 }}
                  placeholder="输入研究主题"
                />
                <Button type="primary" style={{ marginTop: 12 }} loading={agentLoading} onClick={runAgent}>
                  运行科研智能体
                </Button>
                {agentOut ? (
                  <div style={{ marginTop: 20 }}>
                    {Object.entries(agentOut).map(([k, v]) => (
                      <div key={k} style={{ marginBottom: 16 }}>
                        <Typography.Text strong>{k}</Typography.Text>
                        <pre
                          className="glass-codeblock"
                          style={{
                            whiteSpace: "pre-wrap",
                            padding: 12,
                            fontSize: 12,
                            maxHeight: 320,
                            overflow: "auto",
                          }}
                        >
                          {v}
                        </pre>
                      </div>
                    ))}
                  </div>
                ) : null}
                <Typography.Paragraph type="secondary" style={{ marginTop: 16 }}>
                  完成分析后，切换至「成果转化」标签生成材料与 PPT。
                </Typography.Paragraph>
              </div>
            ),
          },
          {
            key: "outputs",
            label: "成果转化",
            children: (
              <Tabs
                activeKey={tab}
                onChange={setTab}
                items={[
                  {
                    key: "flow",
                    label: "转化流程",
                    children: (
                      <Space direction="vertical" size="large" style={{ width: "100%" }}>
                        <div>
                          <Typography.Title level={5} style={{ marginTop: 0 }}>
                            1. 选定科研方向
                          </Typography.Title>
                          <Alert
                            type="info"
                            showIcon
                            message={`当前关联病种：${diseaseLabel}`}
                            description="关联演示病例及本地记录的病种字段。"
                            style={{ marginBottom: 12 }}
                          />
                          <Checkbox.Group
                            options={DIRECTION_OPTIONS}
                            value={directions}
                            onChange={(v) => setDirections(v as string[])}
                          />
                          <div style={{ marginTop: 12 }}>
                            <Space wrap>
                              <Button type="primary" onClick={loadMaterials}>
                                生成申报材料（Markdown）
                              </Button>
                              <Button onClick={loadReview}>
                                生成综述草稿（写入报告附录）
                              </Button>
                            </Space>
                          </div>
                        </div>

                        <Divider />

                        <div>
                          <Typography.Title level={5}>2. 课题地图（示意）</Typography.Title>
                          <Typography.Paragraph type="secondary" style={{ marginBottom: 8 }}>
                            列出「已报道」与「仍缺证据」的方向，选题后生成大纲与 PPT。
                          </Typography.Paragraph>
                          <Table<TopicRow>
                            size="small"
                            pagination={false}
                            rowKey="key"
                            columns={topicColumns}
                            dataSource={topicRows}
                            rowSelection={{
                              type: "radio",
                              selectedRowKeys: [selectedTopicKey],
                              onChange: (keys) => {
                                const k = keys[0];
                                if (k != null) setSelectedTopicKey(String(k));
                              },
                            }}
                          />
                          <Space wrap style={{ marginTop: 16 }}>
                            <Button type="primary" onClick={generateOutlineLocal}>
                              生成论文 / 项目大纲
                            </Button>
                            <Button onClick={loadPptForTopic}>
                              生成 PPT 提纲（JSON）
                            </Button>
                          </Space>
                          {outline ? (
                            <pre
                              className="glass-codeblock"
                              style={{ whiteSpace: "pre-wrap", padding: 16, marginTop: 12, minHeight: 200 }}
                            >
                              {outline}
                            </pre>
                          ) : null}
                        </div>

                        <Divider />

                        <div>
                          <Typography.Title level={5}>3. 预览已生成内容</Typography.Title>
                          <Space wrap>
                            <Button onClick={() => setTab("report")}>打开 Markdown 报告</Button>
                            <Button onClick={() => setTab("ppt")}>打开 PPT JSON</Button>
                            <Button onClick={() => setTab("review")}>疑难病例复盘</Button>
                          </Space>
                        </div>
                      </Space>
                    ),
                  },
                  {
                    key: "report",
                    label: "科研报告（Markdown）",
                    children: (
                      <pre className="glass-codeblock" style={{ whiteSpace: "pre-wrap", padding: 16, minHeight: 360 }}>
                        {report || "请先在「转化流程」生成申报材料或综述…"}
                      </pre>
                    ),
                  },
                  {
                    key: "ppt",
                    label: "PPT 提纲（JSON）",
                    children: (
                      <pre className="glass-codeblock" style={{ padding: 16, minHeight: 360 }}>
                        {ppt || "请先在「转化流程」选题并生成 PPT 提纲…"}
                      </pre>
                    ),
                  },
                  {
                    key: "review",
                    label: "疑难病例复盘",
                    children: (
                      <pre className="glass-codeblock" style={{ padding: 16, minHeight: 360 }}>
                        {review || "切换到本页自动生成…"}
                      </pre>
                    ),
                  },
                ]}
              />
            ),
          },
        ]}
      />
    </div>
  );
}
