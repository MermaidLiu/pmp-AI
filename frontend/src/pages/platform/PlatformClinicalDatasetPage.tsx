import { DatabaseOutlined, DeleteOutlined, PlusOutlined, RightOutlined } from "@ant-design/icons";
import { App, Button, Empty, Modal, Space, Table, Tag, Typography } from "antd";
import { useCallback, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import ClinicalDatasetImportPanel from "../../components/platform/clinicalDataset/ClinicalDatasetImportPanel";
import ClinicalDatasetWorkbench from "../../components/platform/clinicalDataset/ClinicalDatasetWorkbench";
import { deleteClinicalDataset, listClinicalDatasets } from "../../lib/clinicalDataset/store";
import type { ClinicalDataset } from "../../lib/clinicalDataset/types";

const { Title, Paragraph, Text } = Typography;

export default function PlatformClinicalDatasetPage() {
  const { id } = useParams<{ id?: string }>();
  const nav = useNavigate();
  const { message } = App.useApp();
  const [datasets, setDatasets] = useState<ClinicalDataset[]>(() => listClinicalDatasets());
  const [importOpen, setImportOpen] = useState(false);

  const refresh = useCallback(() => setDatasets(listClinicalDatasets()), []);

  if (id) {
    return (
      <ClinicalDatasetWorkbench
        datasetId={id}
        onBack={() => {
          refresh();
          nav("/db/clinical");
        }}
      />
    );
  }

  return (
    <div className="pmp-section">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <Title level={4} style={{ margin: 0 }}>
          <DatabaseOutlined style={{ marginRight: 8, color: "#1677ff" }} />
          临床数据集
        </Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setImportOpen(true)}>
          导入 Excel
        </Button>
      </div>

      <Paragraph type="secondary" style={{ marginBottom: 16, fontSize: 13 }}>
        对标临床数据导入规范：两行表头 Excel → 变量管理 → 数据处理 → 基础/高级统计 → 机器学习。UI 沿用本平台风格。
      </Paragraph>

      {datasets.length === 0 ? (
        <>
          <ClinicalDatasetImportPanel
            onImported={(dsId) => {
              refresh();
              nav(`/db/clinical/${dsId}`);
            }}
          />
        </>
      ) : (
        <div className="pmp-card" style={{ padding: 16 }}>
          <Table
            size="small"
            rowKey="id"
            dataSource={datasets}
            pagination={{ pageSize: 8 }}
            columns={[
              { title: "数据集名称", dataIndex: "name", ellipsis: true },
              {
                title: "病例数",
                width: 88,
                render: (_, r) => `${r.rows.length} 例`,
              },
              {
                title: "变量数",
                width: 88,
                render: (_, r) => r.variables.filter((v) => !v.skipped).length,
              },
              {
                title: "创建时间",
                width: 160,
                render: (_, r) => new Date(r.createdAt).toLocaleString(),
              },
              {
                title: "状态",
                width: 88,
                render: () => <Tag color="green">已导入</Tag>,
              },
              {
                title: "操作",
                width: 160,
                render: (_, r) => (
                  <Space>
                    <Link to={`/db/clinical/${r.id}`}>
                      <Button type="link" size="small" icon={<RightOutlined />}>
                        进入
                      </Button>
                    </Link>
                    <Button
                      type="link"
                      size="small"
                      danger
                      icon={<DeleteOutlined />}
                      onClick={() => {
                        Modal.confirm({
                          title: `删除「${r.name}」？`,
                          okType: "danger",
                          onOk: () => {
                            deleteClinicalDataset(r.id);
                            refresh();
                            message.success("已删除");
                          },
                        });
                      }}
                    />
                  </Space>
                ),
              },
            ]}
          />
        </div>
      )}

      <Modal
        title="导入临床数据"
        open={importOpen}
        onCancel={() => setImportOpen(false)}
        footer={null}
        width={680}
        destroyOnClose
      >
        <ClinicalDatasetImportPanel
          onImported={(dsId) => {
            setImportOpen(false);
            refresh();
            nav(`/db/clinical/${dsId}`);
          }}
        />
      </Modal>
    </div>
  );
}
