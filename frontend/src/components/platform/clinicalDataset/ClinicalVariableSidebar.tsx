import { DeleteOutlined, EditOutlined, PlusOutlined, SearchOutlined } from "@ant-design/icons";
import { App, Button, Input, Modal, Select, Space, Table, Tag, Typography } from "antd";
import { useMemo, useState } from "react";
import { deleteVariable, updateVariableType } from "../../../lib/clinicalDataset/store";
import type { ClinicalDataset, ClinicalVariable, VariableType } from "../../../lib/clinicalDataset/types";
import { VARIABLE_TYPE_LABELS } from "../../../lib/clinicalDataset/types";

const { Text } = Typography;

type Props = {
  dataset: ClinicalDataset;
  onChange: (ds: ClinicalDataset) => void;
};

export default function ClinicalVariableSidebar({ dataset, onChange }: Props) {
  const { message } = App.useApp();
  const [keyword, setKeyword] = useState("");
  const [editVar, setEditVar] = useState<ClinicalVariable | null>(null);
  const [editType, setEditType] = useState<VariableType>("text");

  const filtered = useMemo(() => {
    const k = keyword.trim().toLowerCase();
    if (!k) return dataset.variables;
    return dataset.variables.filter((v) => v.name.toLowerCase().includes(k));
  }, [dataset.variables, keyword]);

  function handleTypeSave() {
    if (!editVar) return;
    const updated = updateVariableType(dataset.id, editVar.id, editType);
    if (updated) {
      onChange(updated);
      message.success(`已更新「${editVar.name}」为 ${VARIABLE_TYPE_LABELS[editType]}`);
    }
    setEditVar(null);
  }

  function handleDelete(v: ClinicalVariable) {
    if (v.category === "patient_id") {
      message.warning("患者 ID 列不可删除");
      return;
    }
    Modal.confirm({
      title: `删除变量「${v.name}」？`,
      content: "将同时删除该列全部数据",
      okType: "danger",
      onOk: () => {
        const updated = deleteVariable(dataset.id, v.id);
        if (updated) {
          onChange(updated);
          message.success("已删除");
        }
      },
    });
  }

  return (
    <div className="pmp-card pmp-clinical-var-sidebar">
      <div className="pmp-panel-title" style={{ marginBottom: 8 }}>
        变量管理
      </div>
      <Input
        prefix={<SearchOutlined style={{ color: "#94a3b8" }} />}
        placeholder="搜索变量"
        size="small"
        value={keyword}
        onChange={(e) => setKeyword(e.target.value)}
        style={{ marginBottom: 10 }}
      />
      <Table
        size="small"
        pagination={false}
        rowKey="id"
        dataSource={filtered}
        scroll={{ y: 420 }}
        columns={[
          {
            title: "变量名称",
            dataIndex: "name",
            ellipsis: true,
            width: 100,
          },
          {
            title: "类型",
            dataIndex: "type",
            width: 88,
            render: (t: VariableType, r: ClinicalVariable) => (
              <Space size={2}>
                <Tag color={t === "file" ? "purple" : t === "numerical" ? "blue" : "default"} style={{ margin: 0 }}>
                  {VARIABLE_TYPE_LABELS[t]?.slice(0, 4) ?? t}
                </Tag>
                {r.typeOverridden ? <Text type="secondary" style={{ fontSize: 10 }}>改</Text> : null}
              </Space>
            ),
          },
          {
            title: "填充率",
            dataIndex: "fillRate",
            width: 64,
            render: (v: number) => `${v.toFixed(0)}%`,
          },
          {
            title: "操作",
            width: 88,
            render: (_, r) => (
              <Space size={0}>
                <Button
                  type="link"
                  size="small"
                  icon={<EditOutlined />}
                  onClick={() => {
                    setEditVar(r);
                    setEditType(r.type);
                  }}
                />
                <Button
                  type="link"
                  size="small"
                  danger
                  icon={<DeleteOutlined />}
                  disabled={r.category === "patient_id"}
                  onClick={() => handleDelete(r)}
                />
              </Space>
            ),
          },
        ]}
      />
      <Space style={{ marginTop: 10 }}>
        <Button type="link" size="small" icon={<PlusOutlined />} disabled>
          新增变量
        </Button>
        <Button type="link" size="small" disabled>
          生成变量
        </Button>
      </Space>

      <Modal
        title={`编辑变量 · ${editVar?.name ?? ""}`}
        open={!!editVar}
        onCancel={() => setEditVar(null)}
        onOk={handleTypeSave}
        okText="保存"
      >
        <Text type="secondary" style={{ fontSize: 12, display: "block", marginBottom: 8 }}>
          上传后自动识别类型，如有误可在此修改
        </Text>
        <Select
          style={{ width: "100%" }}
          value={editType}
          onChange={setEditType}
          options={Object.entries(VARIABLE_TYPE_LABELS).map(([value, label]) => ({ value, label }))}
        />
        {editVar?.fileLinkKey ? (
          <Text type="secondary" style={{ fontSize: 12, display: "block", marginTop: 8 }}>
            文件关联键：{editVar.fileLinkKey}
            {editVar.skipped ? "（当前列未启用关联）" : ""}
          </Text>
        ) : null}
      </Modal>
    </div>
  );
}
