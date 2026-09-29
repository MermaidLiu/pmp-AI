import { App, Alert, Button, Card, Collapse, Descriptions, Progress, Space, Table, Tag, Typography } from "antd";
import { useCallback, useEffect, useState } from "react";
import {
  exportTrainingData,
  getTrainingStatus,
  runTraining,
  type FeatureImportanceItem,
  type TrainingExportResult,
  type TrainingRunResult,
  type TrainingStatus,
} from "../api/client";
import {
  platformImagingCohortExtract,
  platformImagingCohortStatus,
  platformImagingCohortTrain,
  platformImagingCohortValidate,
  type ImagingCohortStatus,
} from "../api/platform";

const { Paragraph, Text } = Typography;

export default function IngestionTrainingPanel() {
  const { message } = App.useApp();
  const [status, setStatus] = useState<TrainingStatus | null>(null);
  const [exportResult, setExportResult] = useState<TrainingExportResult | null>(null);
  const [trainResult, setTrainResult] = useState<TrainingRunResult | null>(null);
  const [loadingStatus, setLoadingStatus] = useState(false);
  const [loadingExport, setLoadingExport] = useState(false);
  const [loadingTrain, setLoadingTrain] = useState(false);
  const [cohortStatus, setCohortStatus] = useState<ImagingCohortStatus | null>(null);
  const [loadingCohort, setLoadingCohort] = useState(false);
  const [loadingExtract, setLoadingExtract] = useState(false);
  const [loadingImagingTrain, setLoadingImagingTrain] = useState(false);
  const [validateResult, setValidateResult] = useState<Record<string, unknown> | null>(null);

  const refreshStatus = useCallback(async () => {
    setLoadingStatus(true);
    try {
      const s = await getTrainingStatus();
      setStatus(s);
    } catch {
      message.error("获取训练状态失败");
    } finally {
      setLoadingStatus(false);
    }
  }, [message]);

  const refreshCohort = useCallback(async () => {
    setLoadingCohort(true);
    try {
      setCohortStatus(await platformImagingCohortStatus());
    } catch {
      message.error("获取影像队列状态失败");
    } finally {
      setLoadingCohort(false);
    }
  }, [message]);

  useEffect(() => {
    void refreshStatus();
    void refreshCohort();
  }, [refreshStatus, refreshCohort]);

  async function onExport() {
    setLoadingExport(true);
    try {
      const res = await exportTrainingData();
      setExportResult(res);
      message.success(`已导出 ${res.total_rows} 条训练样本`);
      void refreshStatus();
    } catch (e: unknown) {
      const detail =
        e && typeof e === "object" && "response" in e
          ? (e as { response?: { data?: { detail?: string } } }).response?.data?.detail
          : undefined;
      message.error(detail || "导出失败，请先入库病例");
    } finally {
      setLoadingExport(false);
    }
  }

  async function onTrain() {
    setLoadingTrain(true);
    try {
      const res = await runTraining();
      setTrainResult(res);
      message.success(`训练完成，准确率 ${(res.accuracy * 100).toFixed(1)}%`);
      void refreshStatus();
    } catch (e: unknown) {
      const detail =
        e && typeof e === "object" && "response" in e
          ? (e as { response?: { data?: { detail?: string } } }).response?.data?.detail
          : undefined;
      message.error(detail || "训练失败");
    } finally {
      setLoadingTrain(false);
    }
  }

  const featureImportance: FeatureImportanceItem[] =
    trainResult?.feature_importance ??
    status?.feature_importance ??
    (status?.last_training?.feature_importance as FeatureImportanceItem[] | undefined) ??
    [];

  const maxImportance =
    featureImportance.length > 0
      ? Math.max(...featureImportance.map((f) => f.importance), 0.0001)
      : 1;

  return (
    <div>
      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
        message="病理分级 vs 影像诊断：如何准备训练数据？"
        description={
          <div>
            <Paragraph style={{ marginBottom: 8 }}>
              当前模型训练目标是 <Text strong>病理分级（高级别 / 低级别）</Text>，标签来自入库病例的临床诊断文本、
              病理报告关键词，或 JSON 中的 <Text code>research_extensions.pathology_grade</Text> 字段。
            </Paragraph>
            <Paragraph style={{ marginBottom: 0 }}>
              <Text strong>推荐流程：</Text>
              ①「数据上传」批量导入 DICOM/JSON 并开启入库 → ② 高级别 / 低级别各约 80 例（共 ~160 例）→
              ③ 本页「导出训练数据」→ ④「开始训练」→ ⑤ 在「诊断结果」验证。
              若未上传影像，模型仅使用临床字段（年龄、性别等）；上传 DICOM 后可额外使用 SUV/MTV 等影像特征。
            </Paragraph>
          </div>
        }
      />

      <Collapse
        style={{ marginBottom: 16 }}
        items={[
          {
            key: "labels",
            label: "如何标注病理分级（训练标签）",
            children: (
              <ul style={{ paddingLeft: 20, margin: 0 }}>
                <li>
                  <Text strong>方式 A · 临床诊断文本</Text>：上传时在诊断框填写含分级信息的描述，如「卵巢
                  <Text mark>高级别</Text>浆液性癌」「<Text mark>低级别</Text>浆液性癌」「G1 内膜样癌」
                </li>
                <li>
                  <Text strong>方式 B · 结构化 JSON</Text>：在病例 JSON 中设置{" "}
                  <Text code>research_extensions.pathology_grade</Text> 为 <Text code>高级别</Text> 或{" "}
                  <Text code>低级别</Text>
                </li>
                <li>
                  <Text strong>方式 C · 影像 + 病理对照</Text>：上传含代谢/病灶信息的 DICOM 或报告，系统从
                  SUV、病灶描述辅助推断标签（建议最终以病理切片为准）
                </li>
              </ul>
            ),
          },
          {
            key: "imaging",
            label: "影像诊断训练说明",
            children: (
              <Paragraph style={{ marginBottom: 0 }}>
                本平台「影像诊断」指：上传 DICOM 后提取检查号、模态、SUV/MTV/TLG 等特征，与临床信息一起参与分级预测。
                若要做<strong>纯影像分类</strong>（如 CT 良恶性），需为每例 DICOM 提供明确诊断标签（JSON 或诊断文本），
                并保证「解析后直接入库」。当前默认使用 XGBoost 融合临床 + 影像数值特征；深度影像模型（CNN）
                可在后续接入 <Text code>ml/</Text> 目录扩展。
              </Paragraph>
            ),
          },
        ]}
      />

      <Paragraph type="secondary">
        从已入库病例导出特征与标签，训练 XGBoost 分类模型。训练完成后，第 2 步「诊断结果」将优先使用模型预测。
      </Paragraph>

      <Descriptions bordered size="small" column={2} style={{ marginBottom: 16 }}>
        <Descriptions.Item label="库内病例数">{status?.db_case_count ?? "—"}</Descriptions.Item>
        <Descriptions.Item label="训练 CSV">
          {status?.csv_exists ? <Tag color="green">已生成</Tag> : <Tag>未导出</Tag>}
        </Descriptions.Item>
        <Descriptions.Item label="模型文件">
          {status?.model_exists ? <Tag color="blue">已训练</Tag> : <Tag>未训练</Tag>}
        </Descriptions.Item>
        <Descriptions.Item label="上次准确率">
          {status?.last_training?.accuracy != null
            ? `${(Number(status.last_training.accuracy) * 100).toFixed(1)}%`
            : "—"}
        </Descriptions.Item>
      </Descriptions>

      <Space wrap style={{ marginBottom: 16 }}>
        <Button onClick={() => void refreshStatus()} loading={loadingStatus}>
          刷新状态
        </Button>
        <Button type="primary" onClick={() => void onExport()} loading={loadingExport}>
          导出训练数据
        </Button>
        <Button type="primary" onClick={() => void onTrain()} loading={loadingTrain}>
          开始训练
        </Button>
        <Button
          disabled={!status?.csv_exists}
          onClick={() => {
            window.open("/api/v1/modules/training/download-csv", "_blank");
          }}
        >
          下载 CSV
        </Button>
      </Space>

      {exportResult ? (
        <div style={{ marginBottom: 20 }}>
          <Text strong>导出摘要：</Text>
          <Paragraph style={{ marginBottom: 8 }}>
            共 {exportResult.total_rows} 条 · 高级别 {exportResult.high_grade_count} · 低级别{" "}
            {exportResult.low_grade_count}
          </Paragraph>
          <Table
            size="small"
            rowKey="exam_id"
            pagination={false}
            dataSource={exportResult.preview}
            scroll={{ x: 800 }}
            columns={[
              { title: "检查号", dataIndex: "exam_id", width: 120 },
              { title: "临床诊断", dataIndex: "clinical_diagnosis", ellipsis: true },
              { title: "年龄", dataIndex: "age", width: 60 },
              { title: "SUVmax", dataIndex: "suv_max", width: 72 },
              {
                title: "标签",
                dataIndex: "grade_label",
                width: 88,
                render: (v: string) => (
                  <Tag color={v === "高级别" ? "red" : "green"}>{v}</Tag>
                ),
              },
            ]}
          />
        </div>
      ) : null}

      {trainResult ? (
        <Descriptions bordered size="small" column={1} title="训练结果" style={{ marginBottom: 16 }}>
          <Descriptions.Item label="样本数">{trainResult.samples}</Descriptions.Item>
          <Descriptions.Item label="高级别 / 低级别">
            {trainResult.high_grade_count} / {trainResult.low_grade_count}
          </Descriptions.Item>
          <Descriptions.Item label="测试集准确率">
            {(trainResult.accuracy * 100).toFixed(1)}%
          </Descriptions.Item>
          <Descriptions.Item label="模型路径">{trainResult.model_path}</Descriptions.Item>
          <Descriptions.Item label="特征">
            {trainResult.feature_cols?.join("、")}
          </Descriptions.Item>
        </Descriptions>
      ) : null}

      {featureImportance.length > 0 ? (
        <Card title="特征重要性（训练后全局）" size="small" style={{ marginBottom: 16 }}>
          <Paragraph type="secondary" style={{ marginBottom: 12 }}>
            展示 SUVmax、年龄、MTV 等对病理分级预测的全局贡献（XGBoost 特征重要性）。
          </Paragraph>
          {featureImportance.map((item) => (
            <div key={item.feature} style={{ marginBottom: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                <Text>{item.display_name || item.feature}</Text>
                <Text strong>{(item.importance * 100).toFixed(1)}%</Text>
              </div>
              <Progress
                percent={Math.round((item.importance / maxImportance) * 100)}
                showInfo={false}
                strokeColor="#1677ff"
                size="small"
              />
            </div>
          ))}
        </Card>
      ) : null}

      <Card title="CT 自训练基模（分割 + rPCI/分级）" size="small" style={{ marginTop: 24, marginBottom: 16 }}>
        <Paragraph type="secondary" style={{ marginBottom: 8 }}>
          <Text strong>分割优先：</Text>分析时保存标注集 → 在 backend 执行{" "}
          <Text code>python3 -m ml.train_ct_segmentation</Text>，权重{" "}
          <Text code>models/ct_lesion_unet2d.pth</Text> 可继续 fine-tune。
          <Text strong>分级</Text>按 rPCI 原则（13 区 max sc，0–39）与 cohort 高/低标签：{" "}
          <Text code>python3 -m ml.train_ct_rpci_grade</Text>。详见 backend/ml/CT_TRAINING.md。
        </Paragraph>
        <Button
          onClick={() => {
            window.open("/api/v1/platform/pathology/ml/status", "_blank");
          }}
        >
          查看 ML 数据/模型状态
        </Button>
      </Card>

      <Card
        title="影像 ZIP 队列训练（20 高 + 20 低）"
        size="small"
        style={{ marginTop: 24, marginBottom: 16 }}
        extra={
          <Button size="small" onClick={() => void refreshCohort()} loading={loadingCohort}>
            刷新
          </Button>
        }
      >
        <Paragraph type="secondary" style={{ marginBottom: 12 }}>
          将 ZIP 放入服务端目录 <Text code>data/imaging_cohort/high_grade</Text> 与{" "}
          <Text code>low_grade</Text>，系统对每例跑 CT 分割 → 13 区 PCI+体积 → 病灶 ROI 特征，训练 XGBoost 病理分级。
          训练完成后，任意患者上传 DICOM 可在「诊断结果」得到轮廓、体积、PCI 与 <Text code>imaging_grade</Text>。
        </Paragraph>
        <Descriptions bordered size="small" column={2} style={{ marginBottom: 12 }}>
          <Descriptions.Item label="高级别 ZIP">{cohortStatus?.high_grade_zips ?? "—"}</Descriptions.Item>
          <Descriptions.Item label="低级别 ZIP">{cohortStatus?.low_grade_zips ?? "—"}</Descriptions.Item>
          <Descriptions.Item label="已提取特征">{cohortStatus?.features_extracted ?? "—"}</Descriptions.Item>
          <Descriptions.Item label="影像模型">
            {cohortStatus?.model_exists ? <Tag color="blue">已训练</Tag> : <Tag>未训练</Tag>}
          </Descriptions.Item>
        </Descriptions>
        <Space wrap>
          <Button
            type="primary"
            loading={loadingExtract}
            onClick={async () => {
              setLoadingExtract(true);
              try {
                const res = await platformImagingCohortExtract(0, true);
                message.success(`特征提取完成：成功 ${String(res.success)} / 失败 ${String(res.failed)}`);
                void refreshCohort();
              } catch (e: unknown) {
                const detail =
                  e && typeof e === "object" && "response" in e
                    ? (e as { response?: { data?: { detail?: string } } }).response?.data?.detail
                    : undefined;
                message.error(detail || "特征提取失败（可能 CT 服务超时，可分批 limit 参数）");
              } finally {
                setLoadingExtract(false);
              }
            }}
          >
            提取队列特征（耗时）
          </Button>
          <Button
            type="primary"
            loading={loadingImagingTrain}
            onClick={async () => {
              setLoadingImagingTrain(true);
              try {
                const res = await platformImagingCohortTrain(6);
                message.success(`影像模型准确率 ${((Number(res.accuracy) || 0) * 100).toFixed(1)}%`);
                void refreshCohort();
              } catch (e: unknown) {
                const detail =
                  e && typeof e === "object" && "response" in e
                    ? (e as { response?: { data?: { detail?: string } } }).response?.data?.detail
                    : undefined;
                message.error(detail || "训练失败，请先提取足够特征");
              } finally {
                setLoadingImagingTrain(false);
              }
            }}
          >
            训练影像分级模型
          </Button>
          <Button
            onClick={async () => {
              try {
                setValidateResult(await platformImagingCohortValidate(0.3));
                message.success("验证报告已生成");
              } catch (e: unknown) {
                const detail =
                  e && typeof e === "object" && "response" in e
                    ? (e as { response?: { data?: { detail?: string } } }).response?.data?.detail
                    : undefined;
                message.error(detail || "验证失败");
              }
            }}
          >
            外部验证（hold-out）
          </Button>
        </Space>
        {validateResult ? (
          <Paragraph style={{ marginTop: 12, marginBottom: 0 }}>
            测试 n={String(validateResult.n_test)} · 准确率{" "}
            {validateResult.accuracy != null ? `${(Number(validateResult.accuracy) * 100).toFixed(1)}%` : "—"}
            {validateResult.auc != null ? ` · AUC ${Number(validateResult.auc).toFixed(3)}` : ""}
            {validateResult.clinical_pass_hint === true ? (
              <Tag color="green" style={{ marginLeft: 8 }}>
                临床验证参考达标
              </Tag>
            ) : null}
          </Paragraph>
        ) : null}
      </Card>

      <Paragraph type="secondary" style={{ marginTop: 16, marginBottom: 0 }}>
        命令行等价操作（在 backend 目录）：
        <br />
        <Text code>python3 -m ml.train_pathology export</Text>
        {" · "}
        <Text code>python3 -m ml.train_pathology train</Text>
      </Paragraph>
    </div>
  );
}
