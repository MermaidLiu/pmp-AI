import { BarChartOutlined, LineChartOutlined, PieChartOutlined, RiseOutlined, SafetyCertificateOutlined } from "@ant-design/icons";
import { App, Button, Empty, Select, Space, Spin, Table, Tag, Typography } from "antd";
import { useMemo, useState } from "react";
import type { ClinicalAnalyzeResult } from "../../../api/platform";
import { runClinicalAnalysis } from "../../../lib/clinicalDataset/analyzeApi";
import { excelHeaderOptions } from "../../../lib/clinicalDataset/variableOptions";
import type { ClinicalDataset } from "../../../lib/clinicalDataset/types";

const { Text, Paragraph } = Typography;

const TOOLS = [
  { key: "desc", label: "描述性统计", icon: <PieChartOutlined /> },
  { key: "sig", label: "显著性分析", icon: <BarChartOutlined /> },
  { key: "corr", label: "相关性分析", icon: <LineChartOutlined /> },
  { key: "roc", label: "ROC 曲线", icon: <RiseOutlined /> },
  { key: "consistency", label: "一致性检验", icon: <SafetyCertificateOutlined /> },
] as const;

type Props = {
  dataset: ClinicalDataset;
};

export default function ClinicalDatasetBasicStatsTab({ dataset }: Props) {
  const { message } = App.useApp();
  const [tool, setTool] = useState<(typeof TOOLS)[number]["key"]>("desc");
  const [selectedVars, setSelectedVars] = useState<string[]>([]);
  const [splitVar, setSplitVar] = useState<string | undefined>();
  const [outcomeVar, setOutcomeVar] = useState<string | undefined>();
  const [predictor, setPredictor] = useState<string | undefined>();
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ClinicalAnalyzeResult | null>(null);

  const headerOptions = excelHeaderOptions(dataset);

  const rocCurve = useMemo(() => {
    const pts = (result?.extra?.curve as { fpr: number; tpr: number }[]) ?? [];
    return pts;
  }, [result]);

  async function handleRun() {
    if (tool === "desc" && !selectedVars.length) {
      message.warning("请至少选择一个变量");
      return;
    }
    if (tool === "sig" && !splitVar) {
      message.warning("显著性分析需选择拆分维度");
      return;
    }
    if (tool === "corr" && selectedVars.length < 2) {
      message.warning("相关性分析请至少选择 2 个数值变量");
      return;
    }
    if (tool === "roc" && (!outcomeVar || !predictor)) {
      message.warning("ROC 需选择结局变量（分类型）和预测变量（数值型）");
      return;
    }
    if (tool === "consistency" && selectedVars.length < 2) {
      message.warning("一致性检验需选择 2 个分类型变量");
      return;
    }

    setLoading(true);
    try {
      const res = await runClinicalAnalysis(dataset, tool, {
        selected_vars: tool === "roc" ? [predictor!] : selectedVars,
        split_var: splitVar,
        outcome_var: outcomeVar,
        predictor,
      });
      setResult(res);
      message.success(res.offline ? `${res.summary}（后端不可用，已本地计算）` : res.summary || "分析完成");
    } catch (e) {
      message.error(e instanceof Error ? e.message : "分析失败，请确认后端已启动");
      setResult(null);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="pmp-clinical-stats-layout">
      <div className="pmp-clinical-stats-tools">
        {TOOLS.map((t) => (
          <button
            key={t.key}
            type="button"
            className={`pmp-clinical-tool-card${tool === t.key ? " pmp-clinical-tool-card--active" : ""}`}
            onClick={() => {
              setTool(t.key);
              setResult(null);
            }}
          >
            <span className="pmp-clinical-tool-icon">{t.icon}</span>
            <span>{t.label}</span>
          </button>
        ))}
      </div>

      <div className="pmp-clinical-stats-body">
        <div className="pmp-card pmp-clinical-stats-sidebar">
          <div className="pmp-panel-title" style={{ fontSize: 13 }}>
            变量选择
          </div>
          <div style={{ marginBottom: 12 }}>
            <Text type="secondary" style={{ fontSize: 12 }}>
              变量
            </Text>
            <Select
              mode="multiple"
              allowClear
              style={{ width: "100%", marginTop: 4 }}
              placeholder="请选择"
              value={selectedVars}
              onChange={setSelectedVars}
              options={headerOptions}
            />
          </div>
          {(tool === "sig" || tool === "desc") && (
            <div style={{ marginBottom: 12 }}>
              <Text type="secondary" style={{ fontSize: 12 }}>
                拆分维度
              </Text>
              <Text type="secondary" style={{ fontSize: 11, display: "block" }}>
                只可选择一个分类型变量
              </Text>
              <Select
                allowClear
                style={{ width: "100%", marginTop: 4 }}
                placeholder="请选择"
                value={splitVar}
                onChange={setSplitVar}
                options={headerOptions}
              />
            </div>
          )}
          {tool === "roc" && (
            <>
              <div style={{ marginBottom: 12 }}>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  结局变量（二分类）
                </Text>
                <Select
                  style={{ width: "100%", marginTop: 4 }}
                  placeholder="请选择"
                  value={outcomeVar}
                  onChange={setOutcomeVar}
                  options={headerOptions}
                />
              </div>
              <div style={{ marginBottom: 12 }}>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  预测变量（数值型）
                </Text>
                <Select
                  style={{ width: "100%", marginTop: 4 }}
                  placeholder="请选择"
                  value={predictor}
                  onChange={setPredictor}
                  options={headerOptions}
                />
              </div>
            </>
          )}
          <Button type="primary" block loading={loading} onClick={handleRun}>
            开始分析
          </Button>
        </div>

        <div className="pmp-card pmp-clinical-stats-main">
          <Spin spinning={loading}>
            {!result ? (
              <Empty description="请添加变量后点击「开始分析」" image={Empty.PRESENTED_IMAGE_SIMPLE} />
            ) : tool === "desc" ? (
              <>
                <Paragraph type="secondary" style={{ fontSize: 12, marginBottom: 8 }}>
                  {result.summary}
                </Paragraph>
                <Table
                  size="small"
                  pagination={false}
                  rowKey="variable"
                  dataSource={result.rows as Record<string, unknown>[]}
                  columns={[
                    { title: "变量", dataIndex: "variable" },
                    { title: "类型", dataIndex: "type", width: 80 },
                    { title: "均值", dataIndex: "mean", width: 72 },
                    { title: "标准差", dataIndex: "sd", width: 72 },
                    { title: "中位数", dataIndex: "median", width: 72 },
                    { title: "分类分布", dataIndex: "categories", ellipsis: true },
                    { title: "n", dataIndex: "n", width: 48 },
                  ]}
                />
              </>
            ) : tool === "sig" ? (
              <Table
                size="small"
                pagination={false}
                rowKey="variable"
                dataSource={result.rows as Record<string, unknown>[]}
                columns={[
                  { title: "变量", dataIndex: "variable" },
                  { title: "检验", dataIndex: "test", width: 100 },
                  { title: "组1", dataIndex: "group1", ellipsis: true },
                  { title: "组2", dataIndex: "group2", ellipsis: true },
                  { title: "统计量", dataIndex: "stat", width: 72 },
                  { title: "P 值", dataIndex: "pValue", width: 72 },
                  { title: "显著性", dataIndex: "sig", width: 64 },
                ]}
              />
            ) : tool === "corr" ? (
              <Table
                size="small"
                pagination={false}
                rowKey={(r) => `${r.var1}-${r.var2}`}
                dataSource={result.rows as Record<string, unknown>[]}
                columns={[
                  { title: "变量1", dataIndex: "var1" },
                  { title: "变量2", dataIndex: "var2" },
                  { title: "Pearson r", dataIndex: "pearson_r" },
                  { title: "P", dataIndex: "pearson_p" },
                  { title: "Spearman ρ", dataIndex: "spearman_rho" },
                  { title: "n", dataIndex: "n", width: 48 },
                ]}
              />
            ) : tool === "roc" ? (
              <Space direction="vertical" style={{ width: "100%" }}>
                <Tag color="blue">AUC = {String(result.extra.auc ?? "—")}</Tag>
                <Paragraph style={{ fontSize: 12 }}>{result.summary}</Paragraph>
                <div className="pmp-roc-chart">
                  {rocCurve.map((p, i) => (
                    <div
                      key={i}
                      className="pmp-roc-dot"
                      style={{ left: `${p.fpr * 100}%`, bottom: `${p.tpr * 100}%` }}
                      title={`FPR=${p.fpr}, TPR=${p.tpr}`}
                    />
                  ))}
                </div>
              </Space>
            ) : tool === "consistency" ? (
              <Space direction="vertical">
                <Tag color="purple">κ = {String(result.extra.kappa ?? "—")}</Tag>
                <Text>{String(result.extra.interpretation ?? "")}</Text>
                <Text type="secondary">n = {String(result.extra.n ?? "")}</Text>
              </Space>
            ) : null}
          </Spin>
        </div>
      </div>
    </div>
  );
}
