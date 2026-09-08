import { ExperimentOutlined, FileImageOutlined } from "@ant-design/icons";
import { Button, Descriptions, Drawer, Spin, Tabs, Tag, Typography } from "antd";
import { useCallback, useEffect, useMemo, useState } from "react";
import { platformListPathology, type PlatformPathologyRecord } from "../../api/platform";
import { DatabasePageShell, DbTitle, GradeTag, StatusTag } from "../../components/platform/DatabasePageShell";
import { hasAnnotatedImage, imageSrcFromBase64 } from "../../lib/pathologyImage";
import { loadPathologyImage } from "../../lib/pathologyImagingCache";

const { Paragraph, Text } = Typography;

export default function PlatformPathologyDbPage() {
  const [detail, setDetail] = useState<PlatformPathologyRecord | null>(null);
  const [data, setData] = useState<PlatformPathologyRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [annotatedB64, setAnnotatedB64] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      setData(await platformListPathology());
    } catch {
      setData([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  useEffect(() => {
    if (!detail?.hasAnnotatedImage) {
      setAnnotatedB64(null);
      return;
    }
    const examId = detail.id.replace(/^PATH-/, "");
    void loadPathologyImage(examId).then(setAnnotatedB64);
  }, [detail]);

  const stats = useMemo(() => {
    const high = data.filter((r) => r.gradeLabel === "高级别").length;
    const low = data.filter((r) => r.gradeLabel === "低级别").length;
    return [
      { title: "病理/影像诊断", value: data.length, suffix: "份" },
      { title: "高级别", value: high, suffix: "例", color: "#cf1322" },
      { title: "低级别", value: low, suffix: "例", color: "#3f8600" },
      { title: "含标注图", value: data.filter((r) => r.hasAnnotatedImage).length, suffix: "例", color: "#1677ff" },
    ];
  }, [data]);

  if (loading) {
    return (
      <div className="pmp-section" style={{ textAlign: "center", padding: 48 }}>
        <Spin />
      </div>
    );
  }

  return (
    <>
      <DatabasePageShell<PlatformPathologyRecord>
        title={
          <DbTitle level={4} style={{ margin: 0 }}>
            <ExperimentOutlined style={{ marginRight: 8, color: "#1677ff" }} />
            病理数据库
          </DbTitle>
        }
        extra={
          <Text type="secondary" style={{ fontSize: 12 }}>
            智能分析入库后自动同步 · 含 AI 影像诊断分级与标注图
          </Text>
        }
        stats={stats}
        data={data}
        rowKey={(r) => r.id}
        filterPlaceholder="搜索患者 / 病理号 / 分级"
        filterFn={(row, kw) =>
          !kw ||
          (row.id || "").toLowerCase().includes(kw) ||
          (row.patientName || "").toLowerCase().includes(kw) ||
          (row.summary || "").toLowerCase().includes(kw) ||
          (row.gradeLabel || "").toLowerCase().includes(kw)
        }
        modalityOptions={[
          { value: "高级别", label: "高级别" },
          { value: "低级别", label: "低级别" },
        ]}
        modalityFilter={(row, m) => row.gradeLabel === m}
        columns={[
          { title: "病理号", dataIndex: "id", width: 150 },
          { title: "患者", width: 88, render: (_, r) => r.patientName },
          { title: "来源", dataIndex: "stainType", width: 110 },
          { title: "分级", width: 88, render: (_, r) => <GradeTag label={r.gradeLabel} /> },
          { title: "DICOM", dataIndex: "dicomCount", width: 72 },
          {
            title: "标注图",
            width: 72,
            render: (_, r) => (r.hasAnnotatedImage ? <Tag color="blue">有</Tag> : "—"),
          },
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

      <Drawer title="病理详情" open={!!detail} onClose={() => setDetail(null)} width={560}>
        {detail ? (
          <Tabs
            items={[
              {
                key: "annotated",
                label: "标注图",
                children: hasAnnotatedImage(annotatedB64 || undefined) ? (
                  <img
                    src={imageSrcFromBase64(annotatedB64!)}
                    alt="标注病灶图"
                    style={{ maxWidth: "100%", borderRadius: 8, border: "1px solid #e8edf5", background: "#0a0a0a" }}
                  />
                ) : (
                  <Paragraph type="secondary">暂无标注图（请先在智能分析完成入库）</Paragraph>
                ),
              },
              {
                key: "report",
                label: "诊断报告",
                children: (
                  <Descriptions column={1} size="small" bordered>
                    <Descriptions.Item label="病理号">{detail.id}</Descriptions.Item>
                    <Descriptions.Item label="患者">{detail.patientName}</Descriptions.Item>
                    <Descriptions.Item label="取材">{detail.sampleSite}</Descriptions.Item>
                    <Descriptions.Item label="病理分级">
                      <GradeTag label={detail.gradeLabel} />
                    </Descriptions.Item>
                    {detail.confidence != null ? (
                      <Descriptions.Item label="置信度">{(detail.confidence * 100).toFixed(0)}%</Descriptions.Item>
                    ) : null}
                    <Descriptions.Item label="诊断摘要">{detail.summary}</Descriptions.Item>
                    <Descriptions.Item label="签发">{detail.pathologist} · {detail.reportDate}</Descriptions.Item>
                  </Descriptions>
                ),
              },
            ]}
          />
        ) : null}
      </Drawer>
    </>
  );
}
