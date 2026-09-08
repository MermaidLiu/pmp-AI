import { ArrowLeftOutlined, DatabaseOutlined } from "@ant-design/icons";
import { App, Button, Modal, Space, Tabs, Tag, Typography } from "antd";
import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { datasetSummary } from "../../../lib/clinicalDataset/statsCompute";
import { getClinicalDataset } from "../../../lib/clinicalDataset/store";
import type { ClinicalDataset } from "../../../lib/clinicalDataset/types";
import ClinicalDatasetAdvancedStatsTab from "./ClinicalDatasetAdvancedStatsTab";
import ClinicalDatasetBasicStatsTab from "./ClinicalDatasetBasicStatsTab";
import ClinicalDatasetImportPanel from "./ClinicalDatasetImportPanel";
import ClinicalDatasetMLTab from "./ClinicalDatasetMLTab";
import ClinicalDatasetProcessingTab from "./ClinicalDatasetProcessingTab";

const { Title, Text } = Typography;

type Props = {
  datasetId: string;
  onBack?: () => void;
};

export default function ClinicalDatasetWorkbench({ datasetId, onBack }: Props) {
  const { message } = App.useApp();
  const nav = useNavigate();
  const [dataset, setDataset] = useState<ClinicalDataset | null>(() => getClinicalDataset(datasetId) ?? null);
  const [tab, setTab] = useState("processing");
  const [reimportOpen, setReimportOpen] = useState(false);

  const reload = useCallback(() => {
    setDataset(getClinicalDataset(datasetId) ?? null);
  }, [datasetId]);

  useEffect(() => {
    reload();
  }, [reload]);

  if (!dataset) {
    return (
      <div className="pmp-section">
        <Text type="secondary">数据集不存在或已删除</Text>
        <Button type="link" onClick={onBack ?? (() => nav("/db/clinical"))}>
          返回列表
        </Button>
      </div>
    );
  }

  const summary = datasetSummary(dataset);

  return (
    <div className="pmp-section pmp-clinical-workbench">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
        <Space direction="vertical" size={4}>
          <Space>
            <Button type="text" icon={<ArrowLeftOutlined />} onClick={onBack ?? (() => nav("/db/clinical"))} />
            <Title level={4} style={{ margin: 0 }}>
              <DatabaseOutlined style={{ marginRight: 8, color: "#1677ff" }} />
              {dataset.name}
            </Title>
          </Space>
          <Space wrap size={[4, 4]}>
            <Tag color="blue">{summary.n} 例</Tag>
            <Tag>{summary.vars} 变量</Tag>
            <Tag>缺失率 {summary.missingRate}%</Tag>
            <Text type="secondary" style={{ fontSize: 12 }}>
              更新于 {new Date(dataset.updatedAt).toLocaleString()}
            </Text>
          </Space>
        </Space>
        <Button
          type="primary"
          ghost
          onClick={() => nav(`/knowledge/data/clinical?dataset=${dataset.id}`)}
        >
          进入科研分析工作台
        </Button>
      </div>

      <Tabs
        activeKey={tab}
        onChange={setTab}
        className="pmp-clinical-main-tabs"
        items={[
          {
            key: "processing",
            label: "数据处理",
            children: (
              <ClinicalDatasetProcessingTab
                dataset={dataset}
                onChange={setDataset}
                onReimport={() => setReimportOpen(true)}
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
        title="重新导入数据"
        open={reimportOpen}
        onCancel={() => setReimportOpen(false)}
        footer={null}
        width={640}
        destroyOnClose
      >
        <ClinicalDatasetImportPanel
          onImported={(id) => {
            setReimportOpen(false);
            if (id === datasetId) reload();
            else nav(`/db/clinical/${id}`);
            message.success("数据已更新");
          }}
        />
      </Modal>
    </div>
  );
}
