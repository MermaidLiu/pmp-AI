import { ArrowLeftOutlined, DatabaseOutlined, UploadOutlined } from "@ant-design/icons";
import { Alert, App, Button, Modal, Space, Spin, Tabs, Tag, Typography } from "antd";
import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { datasetSummary } from "../../../lib/clinicalDataset/statsCompute";
import { getClinicalDataset, saveClinicalDataset } from "../../../lib/clinicalDataset/store";
import type { ClinicalDataset } from "../../../lib/clinicalDataset/types";
import ClinicalDatasetAdvancedStatsTab from "./ClinicalDatasetAdvancedStatsTab";
import ClinicalDatasetBasicStatsTab from "./ClinicalDatasetBasicStatsTab";
import ClinicalDatasetImportPanel from "./ClinicalDatasetImportPanel";
import ClinicalDatasetMLTab from "./ClinicalDatasetMLTab";
import ClinicalDatasetProcessingTab from "./ClinicalDatasetProcessingTab";

const { Title, Paragraph, Text } = Typography;

type Props = {
  datasetId: string;
  batchCount?: number;
  defaultTab?: string;
};

export default function ClinicalAnalysisWorkbench({ datasetId, batchCount = 0, defaultTab = "advanced" }: Props) {
  const { message } = App.useApp();
  const nav = useNavigate();
  const [dataset, setDataset] = useState<ClinicalDataset | null>(() => getClinicalDataset(datasetId) ?? null);
  const [tab, setTab] = useState(defaultTab);
  const [importOpen, setImportOpen] = useState(false);

  const reload = useCallback(() => {
    setDataset(getClinicalDataset(datasetId) ?? null);
  }, [datasetId]);

  useEffect(() => {
    reload();
  }, [reload]);

  if (!dataset) {
    return (
      <div className="pmp-section" style={{ textAlign: "center", padding: 48 }}>
        <Spin tip="加载临床数据…" />
      </div>
    );
  }

  const summary = datasetSummary(dataset);

  return (
    <div className="pmp-section pmp-clinical-workbench pmp-clinical-analysis-page">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
        <Space direction="vertical" size={4}>
          <Space>
            <Link to="/knowledge/data">
              <Button type="text" icon={<ArrowLeftOutlined />} size="small">
                返回模块选择
              </Button>
            </Link>
          </Space>
          <Title level={4} style={{ margin: 0 }}>
            <DatabaseOutlined style={{ marginRight: 8, color: "#1677ff" }} />
            临床及病理数据分析
          </Title>
          <Paragraph type="secondary" style={{ margin: 0, fontSize: 13, maxWidth: 720 }}>
            面向临床、病理、随访等结构化数据，用于病理分级相关因素、生存分析、预后模型等任务。
          </Paragraph>
          <Space wrap size={[4, 4]} style={{ marginTop: 4 }}>
            <Tag color="blue">{summary.n} 例</Tag>
            <Tag>{summary.vars} 变量</Tag>
            <Tag>缺失率 {summary.missingRate}%</Tag>
            <Text type="secondary" style={{ fontSize: 12 }}>
              {dataset.name}
            </Text>
          </Space>
        </Space>
        <Button icon={<UploadOutlined />} onClick={() => setImportOpen(true)}>
          导入 Excel
        </Button>
      </div>

      {batchCount > 0 ? (
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 12 }}
          message={`已从患者库批量带入 ${batchCount} 例`}
          description="可在下方选择变量，进行病理分级相关因素、生存分析与预后建模。"
        />
      ) : null}

      <Tabs
        activeKey={tab}
        onChange={setTab}
        className="pmp-clinical-main-tabs pmp-clinical-top-nav"
        items={[
          {
            key: "processing",
            label: "数据处理",
            children: (
              <ClinicalDatasetProcessingTab
                dataset={dataset}
                onChange={setDataset}
                onReimport={() => setImportOpen(true)}
              />
            ),
          },
          {
            key: "basic",
            label: "基础统计",
            children: <ClinicalDatasetBasicStatsTab dataset={dataset} />,
          },
          {
            key: "advanced",
            label: "高级统计",
            children: <ClinicalDatasetAdvancedStatsTab dataset={dataset} />,
          },
          {
            key: "ml",
            label: "机器学习",
            children: <ClinicalDatasetMLTab dataset={dataset} />,
          },
        ]}
      />

      <Modal
        title="导入临床数据"
        open={importOpen}
        onCancel={() => setImportOpen(false)}
        footer={null}
        width={680}
        destroyOnClose
      >
        <ClinicalDatasetImportPanel
          onImported={(id) => {
            setImportOpen(false);
            const imported = getClinicalDataset(id);
            if (imported && id !== datasetId) {
              saveClinicalDataset({ ...imported, id: datasetId });
            }
            reload();
            message.success("数据已更新");
          }}
        />
      </Modal>
    </div>
  );
}
