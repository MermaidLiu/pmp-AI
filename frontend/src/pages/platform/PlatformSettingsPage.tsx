import {
  CloudServerOutlined,
  DatabaseOutlined,
  DesktopOutlined,
  HddOutlined,
} from "@ant-design/icons";
import { Col, Progress, Row, Timeline, Typography } from "antd";
import {
  SYSTEM_ALERTS,
  SYSTEM_DAILY_STATS,
  SYSTEM_PERFORMANCE_TREND,
  SYSTEM_RESOURCE_METRICS,
} from "../../data/platformSettingsMock";

const { Title, Text, Paragraph } = Typography;

const RESOURCE_ICONS = {
  cpu: DesktopOutlined,
  memory: CloudServerOutlined,
  gpu: DatabaseOutlined,
  storage: HddOutlined,
} as const;

function PerformanceTrendChart() {
  const width = 520;
  const height = 220;
  const pad = { top: 20, right: 48, bottom: 32, left: 40 };
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;
  const data = SYSTEM_PERFORMANCE_TREND;
  const maxCases = Math.max(...data.map((d) => d.casesProcessed));
  const minAcc = 60;
  const maxAcc = 100;

  const casePoints = data.map((p, i) => {
    const x = pad.left + (i / (data.length - 1)) * innerW;
    const y = pad.top + innerH - (p.casesProcessed / maxCases) * innerH;
    return { x, y, ...p };
  });

  const accPoints = data.map((p, i) => {
    const x = pad.left + (i / (data.length - 1)) * innerW;
    const y = pad.top + innerH - ((p.accuracy - minAcc) / (maxAcc - minAcc)) * innerH;
    return { x, y, ...p };
  });

  const caseLine = casePoints.map((p) => `${p.x},${p.y}`).join(" ");
  const accLine = accPoints.map((p) => `${p.x},${p.y}`).join(" ");

  return (
    <div className="pmp-settings-trend-wrap">
      <div className="pmp-settings-trend-legend">
        <span className="pmp-settings-legend-item">
          <i className="pmp-settings-legend-dot pmp-settings-legend-dot--blue" />
          处理病例数
        </span>
        <span className="pmp-settings-legend-item">
          <i className="pmp-settings-legend-dot pmp-settings-legend-dot--green" />
          预测准确率
        </span>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} className="pmp-settings-trend-chart" aria-label="性能趋势">
        {[0, 0.25, 0.5, 0.75, 1].map((t) => {
          const y = pad.top + innerH * (1 - t);
          return (
            <line
              key={t}
              x1={pad.left}
              y1={y}
              x2={width - pad.right}
              y2={y}
              stroke="#eef2f7"
              strokeWidth="1"
            />
          );
        })}
        <polyline points={caseLine} fill="none" stroke="#1677ff" strokeWidth="2.5" strokeLinejoin="round" />
        <polyline points={accLine} fill="none" stroke="#52c41a" strokeWidth="2.5" strokeLinejoin="round" />
        {casePoints.map((p) => (
          <circle key={`c-${p.date}`} cx={p.x} cy={p.y} r="3.5" fill="#1677ff" stroke="#fff" strokeWidth="1.5" />
        ))}
        {accPoints.map((p) => (
          <circle key={`a-${p.date}`} cx={p.x} cy={p.y} r="3.5" fill="#52c41a" stroke="#fff" strokeWidth="1.5" />
        ))}
        {data.map((p, i) => {
          const x = pad.left + (i / (data.length - 1)) * innerW;
          return (
            <text key={p.date} x={x} y={height - 8} textAnchor="middle" fill="#94a3b8" fontSize="10">
              {p.date}
            </text>
          );
        })}
        <text x={width - pad.right + 6} y={pad.top + 8} fill="#1677ff" fontSize="10">
          {maxCases}
        </text>
        <text x={width - pad.right + 6} y={pad.top + innerH} fill="#52c41a" fontSize="10">
          {minAcc}%
        </text>
        <text x={width - pad.right + 6} y={pad.top + 4} fill="#52c41a" fontSize="10">
          {maxAcc}%
        </text>
      </svg>
    </div>
  );
}

function alertColor(level: "error" | "warning" | "info"): string {
  if (level === "error") return "#ff4d4f";
  if (level === "warning") return "#faad14";
  return "#1677ff";
}

export default function PlatformSettingsPage() {
  return (
    <div className="pmp-section pmp-settings-page">
      <div className="pmp-settings-page-head">
        <Title level={4} style={{ marginBottom: 4 }}>
          <span className="pmp-section-num">10</span>
          系统监控与统计分析
        </Title>
        <Paragraph type="secondary" style={{ marginBottom: 0, fontSize: 13 }}>
          系统监控与数据统计分析
        </Paragraph>
      </div>

      <section className="pmp-card pmp-settings-monitor">
        <Title level={5} className="pmp-settings-block-title">
          系统监控
        </Title>

        <Row gutter={[20, 20]}>
          <Col xs={24} lg={6}>
            <div className="pmp-settings-panel">
              <div className="pmp-panel-title">系统状态</div>
              <div className="pmp-settings-resources">
                {SYSTEM_RESOURCE_METRICS.map((item) => {
                  const Icon = RESOURCE_ICONS[item.key as keyof typeof RESOURCE_ICONS] ?? DesktopOutlined;
                  return (
                    <div key={item.key} className="pmp-settings-resource">
                      <div className="pmp-settings-resource-head">
                        <span className="pmp-settings-resource-label">
                          <Icon style={{ color: item.color, marginRight: 6 }} />
                          {item.label}
                        </span>
                        <Text strong style={{ color: item.color }}>
                          {item.percent}%
                        </Text>
                      </div>
                      <Progress
                        percent={item.percent}
                        showInfo={false}
                        strokeColor={item.color}
                        trailColor="#f1f5f9"
                        size="small"
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          </Col>

          <Col xs={24} lg={12}>
            <div className="pmp-settings-panel pmp-settings-panel--center">
              <div className="pmp-panel-title">数据统计</div>
              <Row gutter={[12, 12]} className="pmp-settings-daily-stats">
                {SYSTEM_DAILY_STATS.map((stat) => (
                  <Col xs={8} key={stat.key}>
                    <div className="pmp-settings-stat-card">
                      <Text type="secondary" className="pmp-settings-stat-label">
                        {stat.label}
                      </Text>
                      <div className="pmp-settings-stat-value">{stat.value}</div>
                    </div>
                  </Col>
                ))}
              </Row>

              <div className="pmp-panel-title" style={{ marginTop: 20 }}>
                性能趋势
              </div>
              <PerformanceTrendChart />
            </div>
          </Col>

          <Col xs={24} lg={6}>
            <div className="pmp-settings-panel pmp-settings-panel--alerts">
              <div className="pmp-panel-title">告警信息</div>
              <Timeline
                className="pmp-settings-alerts"
                items={SYSTEM_ALERTS.map((alert) => ({
                  color: alertColor(alert.level),
                  children: (
                    <div className="pmp-settings-alert-item">
                      <Text type="secondary" className="pmp-settings-alert-time">
                        {alert.time}
                      </Text>
                      <div className="pmp-settings-alert-msg">{alert.message}</div>
                    </div>
                  ),
                }))}
              />
            </div>
          </Col>
        </Row>
      </section>
    </div>
  );
}
