import {
  ArrowRightOutlined,
  CheckCircleFilled,
  CloudUploadOutlined,
  ExperimentOutlined,
  LineChartOutlined,
  MedicineBoxOutlined,
  SyncOutlined,
} from "@ant-design/icons";
import { Button, Col, Empty, Progress, Row, Spin, Table, Tag, Typography } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  HOME_MODEL_TREND,
  HOME_SYSTEM_STATUS,
  HOME_WORKFLOW_STEPS,
  type HomeOverviewStat,
  type HomePendingCase,
} from "../../data/platformHomeMock";
import { buildHomeOverviewStats, buildHomePendingCases } from "../../lib/homePendingCases";
import { FOLLOWUP_BATCH_IMPORTED_EVENT } from "../../lib/followUpBatchStore";
import { fetchMergedPlatformPatients, fetchPlatformOverviewStats } from "../../lib/platformPatientList";
import { PLATFORM_PATIENTS_UPDATED_EVENT } from "../../lib/platformPatients";
import { subscribePathologyJob } from "../../lib/pathologyAnalysisJob";

const { Title, Text } = Typography;

const WORKFLOW_ICONS = [
  CloudUploadOutlined,
  ExperimentOutlined,
  MedicineBoxOutlined,
  LineChartOutlined,
  SyncOutlined,
];

function ModelTrendChart() {
  const width = 420;
  const height = 200;
  const pad = { top: 16, right: 12, bottom: 28, left: 36 };
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;
  const minY = 50;
  const maxY = 100;
  const points = HOME_MODEL_TREND.map((p, i) => {
    const x = pad.left + (i / (HOME_MODEL_TREND.length - 1)) * innerW;
    const y = pad.top + innerH - ((p.accuracy - minY) / (maxY - minY)) * innerH;
    return { x, y, ...p };
  });
  const polyline = points.map((p) => `${p.x},${p.y}`).join(" ");
  const area = `${points[0].x},${pad.top + innerH} ${polyline} ${points[points.length - 1].x},${pad.top + innerH}`;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="pmp-home-trend-chart" aria-label="模型性能趋势">
      {[60, 70, 80, 90].map((v) => {
        const y = pad.top + innerH - ((v - minY) / (maxY - minY)) * innerH;
        return (
          <g key={v}>
            <line x1={pad.left} y1={y} x2={width - pad.right} y2={y} stroke="#eef2f7" strokeWidth="1" />
            <text x={8} y={y + 4} fill="#94a3b8" fontSize="10">
              {v}%
            </text>
          </g>
        );
      })}
      <polygon points={area} fill="url(#pmpTrendFill)" />
      <polyline points={polyline} fill="none" stroke="#1677ff" strokeWidth="2.5" strokeLinejoin="round" />
      {points.map((p) => (
        <circle key={p.date} cx={p.x} cy={p.y} r="3.5" fill="#1677ff" stroke="#fff" strokeWidth="1.5" />
      ))}
      {points.map((p) => (
        <text key={`${p.date}-label`} x={p.x} y={height - 6} textAnchor="middle" fill="#94a3b8" fontSize="10">
          {p.date}
        </text>
      ))}
      <defs>
        <linearGradient id="pmpTrendFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#1677ff" stopOpacity="0.18" />
          <stop offset="100%" stopColor="#1677ff" stopOpacity="0.02" />
        </linearGradient>
      </defs>
    </svg>
  );
}

export default function PlatformHomePage() {
  const nav = useNavigate();
  const [loading, setLoading] = useState(true);
  const [pendingCases, setPendingCases] = useState<HomePendingCase[]>([]);
  const [overviewStats, setOverviewStats] = useState<HomeOverviewStat[]>([]);

  const refreshPatients = useCallback(async () => {
    setLoading(true);
    try {
      const [patients, platformStats] = await Promise.all([
        fetchMergedPlatformPatients(),
        fetchPlatformOverviewStats(),
      ]);
      setPendingCases(buildHomePendingCases(patients));
      setOverviewStats(buildHomeOverviewStats(patients, platformStats));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshPatients();
    const onUpdate = () => void refreshPatients();
    window.addEventListener(FOLLOWUP_BATCH_IMPORTED_EVENT, onUpdate);
    window.addEventListener(PLATFORM_PATIENTS_UPDATED_EVENT, onUpdate);
    const unsubJob = subscribePathologyJob(() => void refreshPatients());
    return () => {
      window.removeEventListener(FOLLOWUP_BATCH_IMPORTED_EVENT, onUpdate);
      window.removeEventListener(PLATFORM_PATIENTS_UPDATED_EVENT, onUpdate);
      unsubJob();
    };
  }, [refreshPatients]);

  const columns: ColumnsType<HomePendingCase> = [
    { title: "患者 ID", dataIndex: "id", width: 150, ellipsis: true },
    { title: "姓名", dataIndex: "name", width: 80 },
    { title: "年龄", dataIndex: "age", width: 72, render: (v: number) => (v > 0 ? `${v}岁` : "—") },
    { title: "检查类型", dataIndex: "examType", width: 96 },
    { title: "检查时间", dataIndex: "examTime", width: 160 },
    {
      title: "状态",
      dataIndex: "status",
      width: 96,
      render: (status: HomePendingCase["status"]) => {
        const color = status === "分析中" ? "processing" : status === "已完成" ? "success" : "warning";
        return <Tag color={color}>{status}</Tag>;
      },
    },
    {
      title: "操作",
      key: "action",
      width: 80,
      render: (_, row) => (
        <Button
          type="link"
          size="small"
          style={{ padding: 0 }}
          onClick={() => {
            if (row.status === "分析中") nav("/workflow?step=diagnosis");
            else if (row.status === "已完成") nav("/workflow?step=diagnosis");
            else nav("/workflow");
          }}
        >
          查看
        </Button>
      ),
    },
  ];

  return (
    <div className="pmp-home-page">
      <section className="pmp-card pmp-home-workflow">
        <Title level={5} className="pmp-home-section-title">
          一体化智能流程
        </Title>
        <div className="pmp-home-workflow-track">
          {HOME_WORKFLOW_STEPS.map((step, i) => {
            const Icon = WORKFLOW_ICONS[i];
            return (
              <div key={step.key} className="pmp-home-workflow-step-wrap">
                {i > 0 ? <ArrowRightOutlined className="pmp-home-workflow-arrow" /> : null}
                <Link to={step.path} className="pmp-home-workflow-step">
                  <div className="pmp-home-workflow-icon">
                    <Icon />
                  </div>
                  <div className="pmp-home-workflow-text">
                    <Text strong>{step.title}</Text>
                    <Text type="secondary" className="pmp-home-workflow-sub">
                      {step.subtitle}
                    </Text>
                  </div>
                </Link>
              </div>
            );
          })}
        </div>
        <div className="pmp-home-workflow-loop">
          <svg viewBox="0 0 720 36" className="pmp-home-workflow-loop-svg" aria-hidden>
            <path
              d="M 24 8 Q 360 34 696 8"
              fill="none"
              stroke="#1677ff"
              strokeWidth="1.5"
              strokeDasharray="4 4"
              opacity="0.45"
            />
            <polygon points="696,8 688,4 688,12" fill="#1677ff" opacity="0.55" />
          </svg>
          <Text type="secondary" className="pmp-home-workflow-loop-label">
            持续迭代优化
          </Text>
        </div>
      </section>

      <Row gutter={[16, 16]} className="pmp-home-overview-row">
        <Col xs={24} xl={16}>
          <section className="pmp-card pmp-home-overview">
            <Title level={5} className="pmp-home-section-title">
              今日概览
            </Title>
            <Row gutter={[12, 12]}>
              {(overviewStats.length ? overviewStats : [
                { key: "pending", label: "待诊断病例", value: "—", delta: "加载中", deltaUp: false },
                { key: "done", label: "已诊断病例", value: "—", delta: "加载中", deltaUp: false },
                { key: "models", label: "模型数量", value: "—", delta: "加载中", deltaUp: true },
                { key: "accuracy", label: "预测准确率", value: "—", delta: "加载中", deltaUp: false },
              ]).map((stat) => (
                <Col xs={12} sm={6} key={stat.key}>
                  <div className="pmp-home-stat-card">
                    <Text type="secondary" className="pmp-home-stat-label">
                      {stat.label}
                    </Text>
                    <div className="pmp-home-stat-value">{stat.value}</div>
                    <Text className={`pmp-home-stat-delta${stat.deltaUp ? " pmp-home-stat-delta--up" : ""}`}>
                      {stat.delta}
                    </Text>
                  </div>
                </Col>
              ))}
            </Row>
          </section>
        </Col>
        <Col xs={24} xl={8}>
          <section className="pmp-card pmp-home-system">
            <Title level={5} className="pmp-home-section-title">
              系统状态
            </Title>
            {HOME_SYSTEM_STATUS.map((item) => (
              <div key={item.key} className="pmp-home-system-item">
                <div className="pmp-home-system-head">
                  <Text>{item.label}</Text>
                  <span className="pmp-home-system-ok">
                    <CheckCircleFilled /> {item.status}
                  </span>
                </div>
                <Progress percent={item.percent} strokeColor="#1677ff" showInfo={false} size="small" />
              </div>
            ))}
          </section>
        </Col>
      </Row>

      <Row gutter={[16, 16]}>
        <Col xs={24} xl={16}>
          <section className="pmp-card pmp-home-table-card">
            <div className="pmp-home-table-head">
              <Title level={5} className="pmp-home-section-title" style={{ marginBottom: 0 }}>
                待处理病例
              </Title>
              <Link to="/db/patients">
                <Button type="link" size="small">
                  查看全部
                </Button>
              </Link>
            </div>
            <Spin spinning={loading}>
              {pendingCases.length ? (
                <Table
                  size="middle"
                  rowKey="id"
                  columns={columns}
                  dataSource={pendingCases}
                  pagination={false}
                  scroll={{ x: 720 }}
                />
              ) : (
                <Empty description="患者数据库暂无病例" image={Empty.PRESENTED_IMAGE_SIMPLE}>
                  <Link to="/db/follow-up">
                    <Button type="primary">前往随访队列导入</Button>
                  </Link>
                </Empty>
              )}
            </Spin>
          </section>
        </Col>
        <Col xs={24} xl={8}>
          <section className="pmp-card pmp-home-trend-card">
            <Title level={5} className="pmp-home-section-title">
              模型性能趋势
            </Title>
            <ModelTrendChart />
            <Text type="secondary" className="pmp-home-trend-caption">
              近 7 日 PCI 分割模型验证集准确率
            </Text>
          </section>
        </Col>
      </Row>
    </div>
  );
}
