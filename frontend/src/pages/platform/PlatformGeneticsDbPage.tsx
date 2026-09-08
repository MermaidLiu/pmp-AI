import { CloudUploadOutlined, DeploymentUnitOutlined } from "@ant-design/icons";
import { App, Button, Descriptions, Drawer, Space, Tag, Typography } from "antd";
import { useMemo, useState } from "react";
import { DatabasePageShell, DbTitle, StatusTag } from "../../components/platform/DatabasePageShell";
import { MOCK_GENETICS_DB, type GeneticsRecord } from "../../data/databaseMock";

const { Text } = Typography;

function tierColor(tier: string) {
  if (tier.startsWith("I")) return "red";
  if (tier.startsWith("II")) return "orange";
  return "default";
}

export default function PlatformGeneticsDbPage() {
  const { message } = App.useApp();
  const [detail, setDetail] = useState<GeneticsRecord | null>(null);

  const stats = useMemo(() => {
    const egfr = MOCK_GENETICS_DB.filter((r) => r.egfr.includes("阳性")).length;
    const kras = MOCK_GENETICS_DB.filter((r) => r.kras.includes("突变")).length;
    return [
      { title: "基因检测", value: MOCK_GENETICS_DB.length, suffix: "份" },
      { title: "EGFR 阳性", value: egfr, suffix: "例", color: "#1677ff" },
      { title: "KRAS 突变", value: kras, suffix: "例", color: "#d48806" },
      { title: "I 类 actionable", value: MOCK_GENETICS_DB.filter((r) => r.tier.startsWith("I")).length, suffix: "例" },
    ];
  }, []);

  return (
    <>
      <DatabasePageShell<GeneticsRecord>
        title={
          <DbTitle level={4} style={{ margin: 0 }}>
            <DeploymentUnitOutlined style={{ marginRight: 8, color: "#1677ff" }} />
            基因数据库
          </DbTitle>
        }
        extra={
          <Button type="primary" icon={<CloudUploadOutlined />} onClick={() => message.info("导入基因检测报告（演示）")}>
            导入报告
          </Button>
        }
        stats={stats}
        data={MOCK_GENETICS_DB}
        rowKey={(r) => r.id}
        filterPlaceholder="搜索患者 / 基因 / panel"
        filterFn={(row, kw) =>
          !kw ||
          row.id.toLowerCase().includes(kw) ||
          row.patientName.toLowerCase().includes(kw) ||
          row.panel.toLowerCase().includes(kw) ||
          row.egfr.toLowerCase().includes(kw) ||
          row.kras.toLowerCase().includes(kw)
        }
        modalityOptions={[
          { value: "I 类", label: "I 类变异" },
          { value: "II 类", label: "II 类变异" },
        ]}
        modalityFilter={(row, m) => row.tier === m}
        columns={[
          { title: "报告号", dataIndex: "id", width: 150 },
          { title: "患者", width: 88, render: (_, r) => r.patientName },
          { title: "检测 panel", dataIndex: "panel", ellipsis: true },
          { title: "样本", dataIndex: "sampleType", width: 100 },
          { title: "EGFR", dataIndex: "egfr", width: 100, ellipsis: true },
          { title: "KRAS", dataIndex: "kras", width: 100, ellipsis: true },
          { title: "MSI", dataIndex: "msi", width: 72 },
          { title: "PD-L1", dataIndex: "pdl1", width: 88 },
          { title: "分级", width: 72, render: (_, r) => <Tag color={tierColor(r.tier)}>{r.tier}</Tag> },
          { title: "日期", dataIndex: "reportDate", width: 100 },
          { title: "状态", width: 88, render: (_, r) => <StatusTag status={r.status} /> },
          {
            title: "操作",
            width: 72,
            fixed: "right",
            render: (_, r) => (
              <Button type="link" size="small" onClick={() => setDetail(r)}>
                详情
              </Button>
            ),
          },
        ]}
      />

      <Drawer title="基因检测详情" open={!!detail} onClose={() => setDetail(null)} width={520}>
        {detail ? (
          <>
            <Descriptions column={1} size="small" bordered>
              <Descriptions.Item label="报告号">{detail.id}</Descriptions.Item>
              <Descriptions.Item label="患者">{detail.patientName}（{detail.patientId}）</Descriptions.Item>
              <Descriptions.Item label="Panel">{detail.panel}</Descriptions.Item>
              <Descriptions.Item label="样本类型">{detail.sampleType}</Descriptions.Item>
              <Descriptions.Item label="EGFR">{detail.egfr}</Descriptions.Item>
              <Descriptions.Item label="KRAS">{detail.kras}</Descriptions.Item>
              <Descriptions.Item label="BRAF">{detail.braf}</Descriptions.Item>
              <Descriptions.Item label="MSI">{detail.msi}</Descriptions.Item>
              <Descriptions.Item label="PD-L1">{detail.pdl1}</Descriptions.Item>
              <Descriptions.Item label="BRCA">{detail.brca}</Descriptions.Item>
              <Descriptions.Item label="临床意义">
                <Tag color={tierColor(detail.tier)}>{detail.tier}</Tag>
              </Descriptions.Item>
            </Descriptions>
            <Text strong style={{ display: "block", marginTop: 16, marginBottom: 8 }}>
              可行动建议
            </Text>
            <Space wrap>
              {detail.actionable.map((a) => (
                <Tag key={a} color="blue">
                  {a}
                </Tag>
              ))}
            </Space>
            <Text type="secondary" style={{ display: "block", marginTop: 16, fontSize: 12 }}>
              报告日期：{detail.reportDate} · 状态：{detail.status}
            </Text>
          </>
        ) : null}
      </Drawer>
    </>
  );
}
