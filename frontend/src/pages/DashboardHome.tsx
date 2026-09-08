import {
  ApartmentOutlined,
  DatabaseOutlined,
  FileSearchOutlined,
  FundProjectionScreenOutlined,
  MedicineBoxOutlined,
  SolutionOutlined,
  UploadOutlined,
} from "@ant-design/icons";
import { Card, Col, Row, Typography } from "antd";
import { Link, useNavigate } from "react-router-dom";

const { Title, Paragraph } = Typography;

type CardDef = {
  key: string;
  path: string;
  title: string;
  subtitle: string;
  icon: React.ReactNode;
};

const cards: CardDef[] = [
  {
    key: "ingestion",
    path: "/ingestion",
    title: "病历输入",
    subtitle: "第 1 步 · DICOM 批量上传 · 临床诊断录入 · OCR · 结构化入库",
    icon: <UploadOutlined style={{ fontSize: 28 }} />,
  },
  {
    key: "pathology",
    path: "/pathology",
    title: "诊断结果",
    subtitle: "第 2 步 · 临床诊断 · 病理分级 · WHO 分级 · 综合评分 0–100",
    icon: <MedicineBoxOutlined style={{ fontSize: 28 }} />,
  },
  {
    key: "treatment",
    path: "/treatment",
    title: "治疗推荐",
    subtitle: "第 3 步 · 基于诊断结果 · 个体化治疗方案 · MDT 建议 · 指南参考",
    icon: <SolutionOutlined style={{ fontSize: 28 }} />,
  },
  {
    key: "cohort",
    path: "/cohort",
    title: "随访队列",
    subtitle: "第 4 步 · 队列筛选 · 随访时间轴 · 多次检查对比 · 病理衔接",
    icon: <ApartmentOutlined style={{ fontSize: 28 }} />,
  },
  {
    key: "knowledge",
    path: "/knowledge",
    title: "知识积累",
    subtitle: "第 5 步 · 医生输入指标 · 相关因素分析 · 文献推荐 · 持续学习",
    icon: <DatabaseOutlined style={{ fontSize: 28 }} />,
  },
  {
    key: "research",
    path: "/outputs",
    title: "科研与转化",
    subtitle: "第 6 步 · 科研分析 · 选题蒸馏 · 论文骨架 · 材料综述 · 大纲与 PPT",
    icon: <FundProjectionScreenOutlined style={{ fontSize: 28 }} />,
  },
];

export default function DashboardHome() {
  const nav = useNavigate();

  return (
    <div>
      <div style={{ marginBottom: 28, padding: "4px 4px 0" }}>
        <Title level={3} style={{ marginBottom: 8, color: "#0f3d52", fontWeight: 600 }}>
          PMP Agent 工作台
        </Title>
        <Paragraph style={{ marginBottom: 0, maxWidth: 780, color: "rgba(22, 74, 99, 0.78)" }}>
          推荐路径：病历输入 → 诊断结果 → 治疗推荐 → 随访队列 → 知识积累 → 科研与转化。
          从 DICOM 与临床诊断出发，完成诊断判定、治疗与队列管理，积累指标相关性后一站式完成科研分析与成果转化。
        </Paragraph>
      </div>
      <Typography.Paragraph style={{ marginBottom: 20, color: "rgba(22, 74, 99, 0.65)" }}>
        进阶入口：
        <Link to="/interview" className="glass-link">
          原始 JSON 工作台
        </Link>
        {" · "}
        <Link to="/research" className="glass-link">
          科研智能体（经典单页）
        </Link>
      </Typography.Paragraph>
      <Row gutter={[20, 20]}>
        {cards.map((c) => (
          <Col xs={24} sm={12} lg={8} key={c.key}>
            <Card
              className="glass-card"
              hoverable
              onClick={() => nav(c.path)}
              styles={{
                body: { minHeight: 148, display: "flex", flexDirection: "column", justifyContent: "space-between" },
              }}
            >
              <div style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
                <div
                  style={{
                    width: 52,
                    height: 52,
                    borderRadius: 14,
                    background: "linear-gradient(145deg, rgba(42, 149, 199, 0.88), rgba(26, 122, 158, 0.92))",
                    color: "#fff",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                    boxShadow: "0 6px 16px rgba(42, 149, 199, 0.25), inset 0 1px 0 rgba(255,255,255,0.35)",
                    border: "1px solid rgba(255,255,255,0.35)",
                  }}
                >
                  {c.icon}
                </div>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 600, color: "#0f3d52", marginBottom: 6 }}>{c.title}</div>
                  <div style={{ fontSize: 13, color: "rgba(22, 74, 99, 0.72)", lineHeight: 1.55 }}>{c.subtitle}</div>
                </div>
              </div>
              <div style={{ marginTop: 12, fontSize: 12, color: "#1a7a9e", fontWeight: 500 }}>
                <FileSearchOutlined /> 点击进入模块
              </div>
            </Card>
          </Col>
        ))}
      </Row>
    </div>
  );
}
