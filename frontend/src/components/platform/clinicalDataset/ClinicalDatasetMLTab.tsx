import { App, Button, Checkbox, Empty, Radio, Select, Space, Spin, Steps, Tag, Typography } from "antd";
import { useState } from "react";
import type { ClinicalAnalyzeResult } from "../../../api/platform";
import { runClinicalAnalysis } from "../../../lib/clinicalDataset/analyzeApi";
import { excelHeaderOptions } from "../../../lib/clinicalDataset/variableOptions";
import type { ClinicalDataset } from "../../../lib/clinicalDataset/types";

const { Text, Title } = Typography;

const ML_STEPS = [
  { title: "基础配置", desc: "自变量 · 结局" },
  { title: "特征处理", desc: "清洗 · 标准化" },
  { title: "模型配置", desc: "模型选择" },
];

const ML_MODELS = [
  { value: "random_forest", label: "随机森林" },
  { value: "xgboost", label: "XGBoost" },
  { value: "logistic", label: "Logistic 回归" },
] as const;

type MlModel = (typeof ML_MODELS)[number]["value"];

type Props = {
  dataset: ClinicalDataset;
};

export default function ClinicalDatasetMLTab({ dataset }: Props) {
  const { message } = App.useApp();
  const [step, setStep] = useState(0);
  const [selectedClinical, setSelectedClinical] = useState<string[]>([]);
  const [outcomeVar, setOutcomeVar] = useState<string>();
  const [mlModel, setMlModel] = useState<MlModel>("random_forest");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ClinicalAnalyzeResult | null>(null);

  const headerOptions = excelHeaderOptions(dataset);

  async function handleRun() {
    if (!outcomeVar) {
      message.warning("请选择结局变量（二分类）");
      setStep(0);
      return;
    }
    if (selectedClinical.length < 1) {
      message.warning("请至少选择一个自变量");
      return;
    }
    setLoading(true);
    try {
      const res = await runClinicalAnalysis(dataset, "ml", {
        feature_vars: selectedClinical.filter((v) => v !== outcomeVar),
        outcome_var: outcomeVar,
        ml_model: mlModel,
        test_size: 0.3,
      });
      setResult(res);
      message.success(res.summary || "模型训练完成");
    } catch (e) {
      message.error(e instanceof Error ? e.message : "训练失败");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="pmp-clinical-ml">
      <div className="pmp-clinical-ml-header">
        <Space>
          <Tag color="blue">数据集：{dataset.name}</Tag>
          <Tag>n = {dataset.rows.length}</Tag>
        </Space>
        <Button size="small" onClick={() => setStep(0)}>
          返回配置
        </Button>
      </div>

      <div className="pmp-clinical-ml-grid">
        <div className="pmp-card pmp-clinical-ml-sidebar">
          <Text type="secondary" style={{ fontSize: 12 }}>
            机器学习任务
          </Text>
          <Steps
            direction="vertical"
            size="small"
            current={step}
            style={{ marginTop: 12 }}
            items={ML_STEPS.map((s, i) => ({ title: s.title, description: s.desc, onClick: () => setStep(i) }))}
          />
          <Button type="primary" block style={{ marginTop: 16 }} loading={loading} onClick={handleRun}>
            运行
          </Button>
        </div>

        <div className="pmp-card pmp-clinical-ml-main">
          <Spin spinning={loading}>
            {step === 0 ? (
              <>
                <Title level={5} style={{ marginTop: 0 }}>
                  基础配置
                </Title>
                <Text type="secondary" style={{ fontSize: 12, display: "block", marginBottom: 8 }}>
                  结局变量（二分类）
                </Text>
                <Select
                  style={{ width: "100%", marginBottom: 16 }}
                  placeholder="如：性别、病理分级"
                  value={outcomeVar}
                  onChange={setOutcomeVar}
                  options={headerOptions}
                  showSearch
                  optionFilterProp="label"
                />
                <Text type="secondary" style={{ fontSize: 12, display: "block", marginBottom: 8 }}>
                  自变量（Excel 表头）
                </Text>
                <Space wrap style={{ marginBottom: 16 }}>
                  {headerOptions.map((v) => (
                    <Tag.CheckableTag
                      key={v.value}
                      checked={selectedClinical.includes(v.value)}
                      onChange={(checked) => {
                        setSelectedClinical((prev) =>
                          checked ? [...prev, v.value] : prev.filter((x) => x !== v.value),
                        );
                      }}
                    >
                      {v.label}
                    </Tag.CheckableTag>
                  ))}
                </Space>
              </>
            ) : step === 1 ? (
              <>
                <Title level={5} style={{ marginTop: 0 }}>
                  特征处理
                </Title>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  后端自动执行：缺失值填补（数值中位数 / 分类众数）+ 标准化 + 分类 One-Hot 编码
                </Text>
              </>
            ) : (
              <>
                <Title level={5} style={{ marginTop: 0 }}>
                  模型选择
                </Title>
                <Radio.Group value={mlModel} onChange={(e) => setMlModel(e.target.value as MlModel)}>
                  <Space direction="vertical">
                    {ML_MODELS.map((m) => (
                      <Radio key={m.value} value={m.value}>
                        {m.label}
                      </Radio>
                    ))}
                  </Space>
                </Radio.Group>
              </>
            )}

            {result ? (
              <div className="pmp-clinical-ml-result" style={{ marginTop: 20 }}>
                {result.extra.auc != null ? <Tag color="green">AUC {String(result.extra.auc)}</Tag> : null}
                {result.extra.accuracy != null ? <Tag color="blue">准确率 {String(result.extra.accuracy)}</Tag> : null}
                <Tag>训练 n = {String(result.extra.train_n ?? "—")}</Tag>
                <Tag>测试 n = {String(result.extra.test_n ?? "—")}</Tag>
              </div>
            ) : null}
          </Spin>
        </div>

        <div className="pmp-card pmp-clinical-ml-result-panel">
          <Text type="secondary">训练结果</Text>
          {!result ? (
            <Empty description="运行后查看结果" image={Empty.PRESENTED_IMAGE_SIMPLE} style={{ marginTop: 24 }} />
          ) : (
            <Space direction="vertical" style={{ marginTop: 12, width: "100%" }}>
              <Text>{result.summary}</Text>
              <Text type="secondary">模型：{ML_MODELS.find((m) => m.value === (result.extra.model ?? mlModel))?.label ?? String(result.extra.model ?? mlModel)}</Text>
              <Text type="secondary">特征：{(result.extra.features as string[])?.join("、") ?? selectedClinical.join("、")}</Text>
            </Space>
          )}
        </div>
      </div>
    </div>
  );
}
