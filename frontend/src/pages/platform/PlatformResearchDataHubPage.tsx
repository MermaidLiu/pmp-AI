import { ExperimentOutlined, FileSearchOutlined, MergeCellsOutlined, ReadOutlined } from "@ant-design/icons";
import { Button, Space, Tag, Typography } from "antd";
import { Link } from "react-router-dom";
import WorkflowContextBanner from "../../components/platform/WorkflowContextBanner";
import { loadResearchBatchContext } from "../../lib/researchBatchContext";
import { loadFollowUpBatch } from "../../lib/followUpBatchStore";

const { Title, Paragraph, Text } = Typography;

const MODULES = [
  {
    key: "clinical",
    path: "/knowledge/data/clinical",
    title: "临床及病理数据分析",
    desc: "面向临床、病理、随访等结构化数据，用于病理分级相关因素、生存分析、预后模型等任务。",
    tags: ["结构化数据", "生存分析", "预后模型", "机器学习"],
    theme: "navy" as const,
    icon: <FileSearchOutlined style={{ fontSize: 28 }} />,
  },
  {
    key: "imaging",
    path: "/knowledge/data/imaging",
    title: "影像数据智能分析",
    desc: "面向 CT / MRI / PET / WSI 等影像数据，结合机器学习或深度学习进行特征筛选与预测建模。",
    tags: ["影像组学", "深度学习", "特征筛选", "基因分型预测"],
    theme: "cyan" as const,
    icon: <ExperimentOutlined style={{ fontSize: 28 }} />,
  },
  {
    key: "multimodal",
    path: "/knowledge/data/multimodal",
    title: "多模态联合分析",
    desc: "融合临床、病理、影像、组学与随访数据，构建联合模型并解释各模态贡献度。",
    tags: ["联合建模", "风险分层", "贡献度分析", "综合结论"],
    theme: "purple" as const,
    icon: <MergeCellsOutlined style={{ fontSize: 28 }} />,
  },
];

export default function PlatformResearchDataHubPage() {
  const ctx = loadResearchBatchContext();
  const batch = loadFollowUpBatch();
  const clinicalN = ctx?.clinical.length ?? batch?.cases.length ?? 0;
  const imagingN = ctx?.imaging.length ?? batch?.matchedCount ?? 0;

  return (
    <div className="pmp-section">
      <Space style={{ marginBottom: 8 }}>
        <Tag color="green">已连接：多模态科研数据库</Tag>
        {clinicalN > 0 ? (
          <Tag color="blue">
            当前队列 {clinicalN} 例{imagingN > 0 ? ` · ${imagingN} 例影像` : ""}
          </Tag>
        ) : null}
      </Space>
      <Title level={4} style={{ marginBottom: 4 }}>
        请选择分析模块
      </Title>
      <Paragraph type="secondary" style={{ marginBottom: 16 }}>
        {ctx || batch
          ? "以下模块将基于刚导入 / 选中的批量数据运行分析。"
          : "首页保留三个入口；也可返回科研延伸首页上传 ZIP+Excel，或从患者数据库多选进入。"}
      </Paragraph>

      <WorkflowContextBanner compact />

      <div className="pmp-module-cards">
        {MODULES.map((m) => (
          <div key={m.key} className={`pmp-module-card pmp-module-card--${m.theme}`}>
            <div className="pmp-module-card-icon">{m.icon}</div>
            <Title level={5} style={{ margin: "12px 0 8px", color: "#fff" }}>
              {m.title}
            </Title>
            <Paragraph style={{ color: "rgba(255,255,255,0.85)", fontSize: 13, minHeight: 48 }}>
              {m.desc}
            </Paragraph>
            <Space wrap size={[4, 4]} style={{ marginBottom: 16 }}>
              {m.tags.map((t) => (
                <Tag key={t} style={{ background: "rgba(255,255,255,0.15)", border: "none", color: "#fff" }}>
                  {t}
                </Tag>
              ))}
            </Space>
            <Link to={m.path}>
              <Button type="default" ghost block>
                进入模块
                {m.key === "clinical" && clinicalN > 0 ? `（${clinicalN} 例）` : ""}
                {m.key === "imaging" && imagingN > 0 ? `（${imagingN} 例）` : ""}
              </Button>
            </Link>
          </div>
        ))}
      </div>

      <Text type="secondary" style={{ fontSize: 12, display: "block", marginTop: 16 }}>
        提示：先在临床或影像模块运行分析并保存结果，多模态模块可自动关联两者输出进行联合建模。
      </Text>
    </div>
  );
}
