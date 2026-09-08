import {
  ApartmentOutlined,
  DownloadOutlined,
  FundOutlined,
  LineChartOutlined,
  NodeIndexOutlined,
  RiseOutlined,
  StockOutlined,
} from "@ant-design/icons";
import { App, Button, Divider, Empty, Select, Space, Spin, Switch, Table, Tag, Typography } from "antd";
import { useMemo, useState, type ReactNode } from "react";
import type { ClinicalAnalyzeResult } from "../../../api/platform";
import { excelHeaderOptions } from "../../../lib/clinicalDataset/variableOptions";
import { runClinicalAnalysis, type AnalyzeKind } from "../../../lib/clinicalDataset/analyzeApi";
import type { ClinicalDataset } from "../../../lib/clinicalDataset/types";

const { Text, Paragraph } = Typography;

type MethodKey = "multi_reg" | "logistic" | "survival" | "cox" | "markov" | "arimax";

const METHODS: { key: MethodKey; label: string; icon: ReactNode; analysis?: AnalyzeKind }[] = [
  { key: "multi_reg", label: "多元回归分析", icon: <FundOutlined />, analysis: "multi_reg" },
  { key: "logistic", label: "逻辑回归", icon: <RiseOutlined />, analysis: "logistic" },
  { key: "survival", label: "生存率分析", icon: <LineChartOutlined />, analysis: "survival" },
  { key: "cox", label: "Cox 比例风险回归", icon: <StockOutlined />, analysis: "cox" },
  { key: "markov", label: "马尔可夫链 CTMC", icon: <NodeIndexOutlined />, analysis: "markov" },
  { key: "arimax", label: "ARIMAX 时间序列分析", icon: <ApartmentOutlined />, analysis: "arimax" },
];

type SavedResult = {
  id: string;
  method: string;
  summary: string;
  at: string;
};

type Props = {
  dataset: ClinicalDataset;
};

export default function ClinicalDatasetAdvancedStatsTab({ dataset }: Props) {
  const { message } = App.useApp();
  const [method, setMethod] = useState<MethodKey>("multi_reg");
  const [dependent, setDependent] = useState<string>();
  const [independents, setIndependents] = useState<string[]>([]);
  const [timeVar, setTimeVar] = useState<string>();
  const [eventVar, setEventVar] = useState<string>();
  const [splitVar, setSplitVar] = useState<string>();
  const [filterVars, setFilterVars] = useState<string[]>([]);
  const [filterCriteria, setFilterCriteria] = useState<Record<string, string[]>>({});
  const [univariate, setUnivariate] = useState(true);
  const [pThreshold, setPThreshold] = useState("0.10");
  const [selectionMethod, setSelectionMethod] = useState("stepwise");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ClinicalAnalyzeResult | null>(null);
  const [savedResults, setSavedResults] = useState<SavedResult[]>([]);
  const [showSaved, setShowSaved] = useState(false);

  const current = METHODS.find((m) => m.key === method)!;

  const headerOptions = useMemo(() => excelHeaderOptions(dataset), [dataset]);

  const filterValueOptions = useMemo(() => {
    const map: Record<string, { value: string; label: string }[]> = {};
    for (const varName of filterVars) {
      const values = [...new Set(dataset.rows.map((r) => r[varName]?.trim()).filter(Boolean))] as string[];
      map[varName] = values.map((v) => ({ value: v, label: v }));
    }
    return map;
  }, [dataset.rows, filterVars]);

  function buildFilterCriteria(): Record<string, string[]> {
    const out: Record<string, string[]> = {};
    for (const v of filterVars) {
      const vals = filterCriteria[v]?.filter(Boolean);
      if (vals?.length) out[v] = vals;
    }
    return out;
  }

  function statsParams() {
    return {
      p_threshold: parseFloat(pThreshold),
      selection_method: selectionMethod,
      univariate_screen: univariate,
      filter_criteria: buildFilterCriteria(),
      patient_id_field: dataset.patientIdField,
    };
  }

  async function handleRun() {
    if (method === "multi_reg" && !dependent) {
      message.warning("请选择因变量");
      return;
    }
    if (method === "logistic" && (!dependent || !independents.length)) {
      message.warning("逻辑回归需选择结局变量和自变量");
      return;
    }
    if ((method === "survival" || method === "cox") && (!timeVar || !eventVar)) {
      message.warning("生存分析需选择时间变量和事件变量");
      return;
    }
    if (method === "cox" && !independents.length) {
      message.warning("Cox 回归需选择协变量");
      return;
    }
    if (method === "markov" && independents.length < 1) {
      message.warning("马尔可夫链请至少选择 1 个状态变量（2 个时为起始→结束状态）");
      return;
    }
    if (method === "arimax" && !dependent) {
      message.warning("ARIMAX 请选择数值型因变量（时间序列）");
      return;
    }

    setLoading(true);
    setShowSaved(false);
    try {
      const vars =
        univariate && independents.length === 0
          ? headerOptions.map((o) => o.value).filter((v) => v !== dependent)
          : independents;
      const base = statsParams();

      if (method === "markov") {
        const res = await runClinicalAnalysis(dataset, "markov", {
          ...base,
          from_state_var: independents.length >= 2 ? independents[0] : undefined,
          state_var: independents.length >= 2 ? independents[independents.length - 1] : independents[0],
          time_var: timeVar,
        });
        setResult(res);
        message.success(res.summary || "马尔可夫链分析完成");
        return;
      }

      if (method === "arimax") {
        const res = await runClinicalAnalysis(dataset, "arimax", {
          ...base,
          dependent,
          independents: vars.filter((v) => v !== dependent),
          time_var: timeVar,
          arima_order: dataset.rows.length < 8 ? [1, 0, 0] : [1, 1, 1],
        });
        setResult(res);
        message.success(res.summary || "ARIMAX 分析完成");
        return;
      }

      const res = await runClinicalAnalysis(dataset, current.analysis!, {
        ...base,
        dependent,
        independents: vars.filter((v) => v !== dependent),
        outcome_var: method === "logistic" ? dependent : eventVar,
        time_var: timeVar,
        event_var: eventVar,
        split_var: splitVar,
      });
      setResult(res);
      message.success(res.summary || "分析完成");
    } catch (e) {
      message.error(e instanceof Error ? e.message : "分析失败");
      setResult(null);
    } finally {
      setLoading(false);
    }
  }

  function saveCurrentResult() {
    if (!result) {
      message.warning("暂无结果可保存");
      return;
    }
    const item: SavedResult = {
      id: `sr_${Date.now()}`,
      method: current.label,
      summary: result.summary || "分析结果",
      at: new Date().toLocaleString(),
    };
    setSavedResults((prev) => [item, ...prev]);
    message.success("已加入保存列表");
  }

  const kmCurves = (result?.extra?.curves as { group: string; points: { time: number; survival: number }[] }[]) ?? [];

  return (
    <div className="pmp-clinical-stats-layout">
      <div className="pmp-clinical-stats-tools">
        {METHODS.map((m) => (
          <button
            key={m.key}
            type="button"
            className={`pmp-clinical-tool-card${method === m.key && !showSaved ? " pmp-clinical-tool-card--active" : ""}`}
            onClick={() => {
              setMethod(m.key);
              setShowSaved(false);
              setResult(null);
            }}
          >
            <span className="pmp-clinical-tool-icon">{m.icon}</span>
            <span>{m.label}</span>
          </button>
        ))}
        <button
          type="button"
          className={`pmp-clinical-tool-card pmp-clinical-tool-card--save${showSaved ? " pmp-clinical-tool-card--active" : ""}`}
          onClick={() => setShowSaved(true)}
        >
          <DownloadOutlined className="pmp-clinical-tool-icon" />
          <span>保存结果({savedResults.length})</span>
        </button>
      </div>

      {showSaved ? (
        <div className="pmp-card pmp-clinical-stats-main pmp-clinical-stats-main--filled">
          {savedResults.length ? (
            <Table
              size="small"
              rowKey="id"
              pagination={false}
              dataSource={savedResults}
              columns={[
                { title: "方法", dataIndex: "method", width: 180 },
                { title: "摘要", dataIndex: "summary", ellipsis: true },
                { title: "时间", dataIndex: "at", width: 160 },
              ]}
            />
          ) : (
            <Empty description="暂无已保存结果" image={Empty.PRESENTED_IMAGE_SIMPLE} />
          )}
        </div>
      ) : (
        <div className="pmp-clinical-stats-body">
          <div className="pmp-card pmp-clinical-stats-sidebar">
            <div className="pmp-panel-title" style={{ fontSize: 13, marginBottom: 12 }}>
              变量选择
            </div>

            {(method === "multi_reg" || method === "logistic") && (
              <>
                <div className="pmp-clinical-var-block">
                  <Text className="pmp-clinical-var-label">因变量</Text>
                  <Select
                    style={{ width: "100%" }}
                    placeholder="+ 请选择"
                    value={dependent}
                    onChange={setDependent}
                    options={headerOptions}
                    showSearch
                    optionFilterProp="label"
                  />
                </div>
                <div className="pmp-clinical-var-block">
                  <Text className="pmp-clinical-var-label">自变量</Text>
                  <Select
                    mode="multiple"
                    style={{ width: "100%" }}
                    placeholder="+ 请选择"
                    value={independents}
                    onChange={setIndependents}
                    options={headerOptions.filter((o) => o.value !== dependent)}
                    showSearch
                    optionFilterProp="label"
                  />
                </div>
              </>
            )}

            {(method === "survival" || method === "cox") && (
              <>
                <div className="pmp-clinical-var-block">
                  <Text className="pmp-clinical-var-label">时间变量</Text>
                  <Select style={{ width: "100%" }} placeholder="+ 请选择" value={timeVar} onChange={setTimeVar} options={headerOptions} showSearch optionFilterProp="label" />
                </div>
                <div className="pmp-clinical-var-block">
                  <Text className="pmp-clinical-var-label">事件变量</Text>
                  <Select style={{ width: "100%" }} placeholder="+ 请选择" value={eventVar} onChange={setEventVar} options={headerOptions} showSearch optionFilterProp="label" />
                </div>
                {method === "survival" && (
                  <div className="pmp-clinical-var-block">
                    <Text className="pmp-clinical-var-label">分组（可选）</Text>
                    <Select allowClear style={{ width: "100%" }} placeholder="+ 请选择" value={splitVar} onChange={setSplitVar} options={headerOptions} showSearch optionFilterProp="label" />
                  </div>
                )}
                {method === "cox" && (
                  <div className="pmp-clinical-var-block">
                    <Text className="pmp-clinical-var-label">协变量</Text>
                    <Select mode="multiple" style={{ width: "100%" }} placeholder="+ 请选择" value={independents} onChange={setIndependents} options={headerOptions} showSearch optionFilterProp="label" />
                  </div>
                )}
              </>
            )}

            {method === "markov" && (
              <>
                <div className="pmp-clinical-var-block">
                  <Text className="pmp-clinical-var-label">状态变量</Text>
                  <Text type="secondary" className="pmp-clinical-var-hint">
                    选 1 个：同一患者多次观测；选 2 个：起始状态 → 结束状态
                  </Text>
                  <Select
                    mode="multiple"
                    style={{ width: "100%" }}
                    placeholder="+ 请选择"
                    value={independents}
                    onChange={setIndependents}
                    options={headerOptions}
                    showSearch
                    optionFilterProp="label"
                  />
                </div>
                <div className="pmp-clinical-var-block">
                  <Text className="pmp-clinical-var-label">排序时间（可选）</Text>
                  <Select allowClear style={{ width: "100%" }} placeholder="+ 请选择" value={timeVar} onChange={setTimeVar} options={headerOptions} showSearch optionFilterProp="label" />
                </div>
              </>
            )}

            {method === "arimax" && (
              <>
                <div className="pmp-clinical-var-block">
                  <Text className="pmp-clinical-var-label">因变量（时间序列）</Text>
                  <Select style={{ width: "100%" }} placeholder="+ 请选择" value={dependent} onChange={setDependent} options={headerOptions} showSearch optionFilterProp="label" />
                </div>
                <div className="pmp-clinical-var-block">
                  <Text className="pmp-clinical-var-label">外生变量（可选）</Text>
                  <Select mode="multiple" style={{ width: "100%" }} placeholder="+ 请选择" value={independents} onChange={setIndependents} options={headerOptions.filter((o) => o.value !== dependent)} showSearch optionFilterProp="label" />
                </div>
                <div className="pmp-clinical-var-block">
                  <Text className="pmp-clinical-var-label">时间排序变量（可选）</Text>
                  <Select allowClear style={{ width: "100%" }} placeholder="+ 请选择" value={timeVar} onChange={setTimeVar} options={headerOptions} showSearch optionFilterProp="label" />
                </div>
              </>
            )}

            <Divider style={{ margin: "12px 0" }} />
            <Text className="pmp-clinical-var-label">更多设置</Text>
            {(method === "multi_reg" || method === "logistic") && (
              <Space style={{ marginTop: 8, marginBottom: 8, width: "100%", justifyContent: "space-between" }}>
                <Text style={{ fontSize: 12 }}>单因素分析</Text>
                <Switch size="small" checked={univariate} onChange={setUnivariate} />
              </Space>
            )}
            {(method === "multi_reg" || method === "logistic") && (
              <>
                <div className="pmp-clinical-var-block">
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    P 值设置 &lt;
                  </Text>
                  <Select
                    style={{ width: "100%", marginTop: 4 }}
                    value={pThreshold}
                    onChange={setPThreshold}
                    options={[
                      { value: "0.05", label: "0.05" },
                      { value: "0.10", label: "0.10" },
                      { value: "0.20", label: "0.20" },
                    ]}
                  />
                </div>
                <div className="pmp-clinical-var-block">
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    筛选方法
                  </Text>
                  <Select
                    style={{ width: "100%", marginTop: 4 }}
                    value={selectionMethod}
                    onChange={setSelectionMethod}
                    options={[
                      { value: "stepwise", label: "逐步回归法" },
                      { value: "lasso", label: "LASSO" },
                      { value: "forward", label: "向前选择" },
                      { value: "none", label: "不筛选（全变量）" },
                    ]}
                  />
                </div>
              </>
            )}

            <Divider style={{ margin: "12px 0" }} />
            <div className="pmp-clinical-var-block">
              <Text className="pmp-clinical-var-label">筛选</Text>
              <Select
                mode="multiple"
                allowClear
                style={{ width: "100%" }}
                placeholder="+ 请选择变量"
                value={filterVars}
                onChange={(vals) => {
                  setFilterVars(vals);
                  setFilterCriteria((prev) => {
                    const next: Record<string, string[]> = {};
                    for (const v of vals) next[v] = prev[v] ?? [];
                    return next;
                  });
                }}
                options={headerOptions}
                showSearch
                optionFilterProp="label"
              />
              {filterVars.map((v) => (
                <div key={v} style={{ marginTop: 8 }}>
                  <Text type="secondary" style={{ fontSize: 11 }}>
                    {v} 取值
                  </Text>
                  <Select
                    mode="multiple"
                    allowClear
                    style={{ width: "100%", marginTop: 4 }}
                    placeholder="+ 请选择"
                    value={filterCriteria[v] ?? []}
                    onChange={(vals) => setFilterCriteria((prev) => ({ ...prev, [v]: vals }))}
                    options={filterValueOptions[v] ?? []}
                  />
                </div>
              ))}
            </div>

            <Button type="primary" block loading={loading} onClick={handleRun} style={{ marginTop: 16 }}>
              开始分析
            </Button>
          </div>

          <div className={`pmp-card pmp-clinical-stats-main${result ? " pmp-clinical-stats-main--filled" : ""}`}>
            <Spin spinning={loading}>
              {!result ? (
                <Empty description="请添加变量进行分析" image={Empty.PRESENTED_IMAGE_SIMPLE} />
              ) : method === "survival" ? (
                <Space direction="vertical" style={{ width: "100%" }}>
                  <Space style={{ width: "100%", justifyContent: "space-between" }}>
                    <Paragraph style={{ fontSize: 12, margin: 0 }}>{result.summary}</Paragraph>
                    <Button size="small" onClick={saveCurrentResult}>
                      保存结果
                    </Button>
                  </Space>
                  {result.extra.logrank_p ? <Tag>Log-rank P = {String(result.extra.logrank_p)}</Tag> : null}
                  {kmCurves.map((c) => (
                    <div key={c.group}>
                      <Text strong>{c.group}</Text>
                      <div className="pmp-km-chart">
                        {c.points.map((p, i) => (
                          <div key={i} className="pmp-km-dot" style={{ left: `${Math.min(p.time, 120)}%`, bottom: `${p.survival * 100}%` }} />
                        ))}
                      </div>
                    </div>
                  ))}
                </Space>
              ) : (
                <>
                  <Space style={{ width: "100%", justifyContent: "space-between", marginBottom: 8 }}>
                    <Paragraph type="secondary" style={{ fontSize: 12, margin: 0 }}>
                      {result.summary}
                      {result.extra.r_squared != null ? ` · R²=${result.extra.r_squared}` : ""}
                      {result.extra.concordance != null ? ` · C-index=${result.extra.concordance}` : ""}
                      {result.extra.accuracy != null ? ` · 准确率=${result.extra.accuracy}` : ""}
                      {result.extra.steady_state ? ` · 稳态 ${result.extra.steady_state}` : ""}
                      {result.extra.forecast ? ` · ${result.extra.forecast}` : ""}
                      {result.extra.aic != null ? ` · AIC=${result.extra.aic}` : ""}
                      {result.extra.selected_predictors
                        ? ` · 入选变量：${(result.extra.selected_predictors as string[]).join("、")}`
                        : ""}
                    </Paragraph>
                    <Button size="small" onClick={saveCurrentResult}>
                      保存结果
                    </Button>
                  </Space>
                  <Table
                    size="small"
                    pagination={false}
                    rowKey="factor"
                    dataSource={result.rows as Record<string, unknown>[]}
                    columns={[
                      { title: "因素", dataIndex: "factor" },
                      { title: "系数/HR", render: (_, r) => r.coef ?? r.hr ?? r.odds_ratio ?? r.metric ?? "—" },
                      { title: "标准误", dataIndex: "se" },
                      { title: "P 值", dataIndex: "pValue" },
                      { title: "显著性", dataIndex: "sig" },
                      { title: "备注", dataIndex: "note", ellipsis: true },
                    ]}
                  />
                </>
              )}
            </Spin>
          </div>
        </div>
      )}
    </div>
  );
}
