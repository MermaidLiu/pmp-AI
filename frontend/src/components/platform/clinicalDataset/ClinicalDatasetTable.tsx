import { Table, Tag, Typography } from "antd";
import { useMemo, useState } from "react";
import type { ClinicalDataset } from "../../../lib/clinicalDataset/types";
import { VARIABLE_TYPE_LABELS } from "../../../lib/clinicalDataset/types";

const { Text } = Typography;

type Props = {
  dataset: ClinicalDataset;
  patientSearch?: string;
};

export default function ClinicalDatasetTable({ dataset, patientSearch = "" }: Props) {
  const [page, setPage] = useState(1);

  const activeVars = dataset.variables.filter((v) => !v.skipped);

  const filteredRows = useMemo(() => {
    const k = patientSearch.trim().toLowerCase();
    if (!k) return dataset.rows;
    const pid = dataset.patientIdField;
    return dataset.rows.filter((r) => (r[pid] ?? "").toLowerCase().includes(k));
  }, [dataset.rows, dataset.patientIdField, patientSearch]);

  const columns = activeVars.map((v) => ({
    title: (
      <div>
        <div>{v.name}</div>
        <Text type="secondary" style={{ fontSize: 11, fontWeight: 400 }}>
          {VARIABLE_TYPE_LABELS[v.type]}
        </Text>
      </div>
    ),
    dataIndex: v.name,
    key: v.id,
    width: v.type === "file" ? 140 : 100,
    ellipsis: true,
    render: (val: string) => {
      if (v.type === "file" && val) {
        return (
          <Tag color="purple" style={{ maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis" }}>
            {val}
          </Tag>
        );
      }
      return val || "—";
    },
  }));

  const dataSource = filteredRows.map((r, i) => ({ ...r, _rowId: i }));

  return (
    <div className="pmp-card pmp-clinical-data-table" style={{ padding: 12, flex: 1, minWidth: 0 }}>
      <Table
        size="small"
        rowKey="_rowId"
        dataSource={dataSource}
        columns={[
          { title: "行ID", dataIndex: "_rowId", width: 56, render: (v: number) => v + 1 },
          ...columns,
        ]}
        scroll={{ x: Math.max(600, activeVars.length * 110) }}
        pagination={{
          current: page,
          pageSize: 10,
          total: filteredRows.length,
          showTotal: (t) => `共 ${t} 条`,
          onChange: setPage,
        }}
      />
    </div>
  );
}
