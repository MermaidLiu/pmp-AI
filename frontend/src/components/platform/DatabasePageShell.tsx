import { Col, Input, Row, Select, Space, Statistic, Table, Tag, Typography } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useMemo, useState, type ReactNode } from "react";

const { Text } = Typography;

type StatItem = { title: string; value: number | string; suffix?: string; color?: string };

type Props<T> = {
  title: ReactNode;
  stats: StatItem[];
  data: T[];
  rowKey: (row: T) => string;
  columns: ColumnsType<T>;
  filterPlaceholder?: string;
  filterFn: (row: T, keyword: string) => boolean;
  modalityOptions?: { value: string; label: string }[];
  modalityFilter?: (row: T, modality: string) => boolean;
  modalityLabel?: string;
  extra?: ReactNode;
};

export function DatabasePageShell<T extends object>({
  title,
  stats,
  data,
  rowKey,
  columns,
  filterPlaceholder = "搜索患者 / ID / 摘要",
  filterFn,
  modalityOptions,
  modalityFilter,
  modalityLabel = "模态",
  extra,
}: Props<T>) {
  const [keyword, setKeyword] = useState("");
  const [modality, setModality] = useState("全部");

  const filtered = useMemo(() => {
    return data.filter((row) => {
      if (modality !== "全部" && modalityFilter && !modalityFilter(row, modality)) return false;
      return filterFn(row, keyword.trim().toLowerCase());
    });
  }, [data, keyword, modality, filterFn, modalityFilter]);

  return (
    <div className="pmp-section">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        {title}
        {extra}
      </div>

      <Row gutter={16} style={{ marginBottom: 16 }}>
        {stats.map((s) => (
          <Col xs={12} sm={6} key={s.title}>
            <div className="pmp-card" style={{ padding: 16 }}>
              <Statistic
                title={s.title}
                value={s.value}
                suffix={s.suffix}
                valueStyle={s.color ? { color: s.color } : undefined}
              />
            </div>
          </Col>
        ))}
      </Row>

      <div className="pmp-card" style={{ padding: 16 }}>
        <Space wrap style={{ marginBottom: 16 }}>
          <Input.Search
            placeholder={filterPlaceholder}
            allowClear
            style={{ width: 280 }}
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
          />
          {modalityOptions ? (
            <>
              <Text type="secondary" style={{ fontSize: 13 }}>
                {modalityLabel}
              </Text>
              <Select
                value={modality}
                style={{ width: 148 }}
                options={[{ value: "全部", label: "全部" }, ...modalityOptions]}
                onChange={setModality}
              />
            </>
          ) : null}
          <Tag>{filtered.length} 条记录</Tag>
        </Space>
        <Table
          size="small"
          rowKey={rowKey}
          dataSource={filtered}
          columns={columns}
          scroll={{ x: 1100 }}
          pagination={{ pageSize: 8, showSizeChanger: false }}
        />
      </div>
    </div>
  );
}

export function StatusTag({ status }: { status: string }) {
  const color =
    status.includes("已") ? "green" : status.includes("待") ? "orange" : status.includes("中") ? "blue" : "default";
  return <Tag color={color}>{status}</Tag>;
}

export function GradeTag({ label }: { label: string }) {
  if (label === "高级别") return <Tag color="red">{label}</Tag>;
  if (label === "低级别") return <Tag color="green">{label}</Tag>;
  return <Tag>{label || "—"}</Tag>;
}

export const DbTitle = Typography.Title;
