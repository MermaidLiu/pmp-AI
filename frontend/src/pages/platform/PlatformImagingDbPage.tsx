import { FileImageOutlined } from "@ant-design/icons";
import { Button, Descriptions, Drawer, Spin, Tabs, Tag, Typography } from "antd";
import { useCallback, useEffect, useMemo, useState } from "react";
import { platformListImaging, type PlatformImagingRecord } from "../../api/platform";
import { DatabasePageShell, DbTitle, StatusTag } from "../../components/platform/DatabasePageShell";
import ImagingViewer from "../../components/platform/ImagingViewer";
import { NiiSliceViewer } from "../../components/platform/NiiSliceViewer";
import { listFollowUpBatchImaging } from "../../lib/followUpBatchImport";
import { getFollowUpBatchCase } from "../../lib/followUpBatchStore";
import { hasAnnotatedImage, imageSrcFromBase64 } from "../../lib/pathologyImage";
import { loadPathologyImage } from "../../lib/pathologyImagingCache";

const { Text, Paragraph } = Typography;

function matchModality(row: PlatformImagingRecord, filter: string) {
  if (filter === "MR") return row.modality === "MRI" || row.modality === "MR";
  return row.modality === filter;
}

function safeLower(val: string | undefined | null) {
  return (val || "").toLowerCase();
}

export default function PlatformImagingDbPage() {
  const [detail, setDetail] = useState<PlatformImagingRecord | null>(null);
  const [data, setData] = useState<PlatformImagingRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [annotatedB64, setAnnotatedB64] = useState<string | null>(null);

  const fetchImaging = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await platformListImaging();
      const batchRows = listFollowUpBatchImaging();
      const ids = new Set(rows.map((r) => r.id));
      const merged = [...batchRows.filter((r) => !ids.has(r.id)), ...rows];
      setData(merged);
    } catch {
      setData(listFollowUpBatchImaging());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchImaging();
  }, [fetchImaging]);

  useEffect(() => {
    if (!detail?.hasAnnotatedImage) {
      setAnnotatedB64(null);
      return;
    }
    void loadPathologyImage(detail.id).then(setAnnotatedB64);
  }, [detail]);

  const stats = useMemo(() => {
    return [
      { title: "影像总数", value: data.length, suffix: "例" },
      { title: "DICOM 总量", value: data.reduce((s, r) => s + (r.dicomCount || 0), 0), suffix: "张" },
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
      <DatabasePageShell<PlatformImagingRecord>
        title={
          <DbTitle level={4} style={{ margin: 0 }}>
            <FileImageOutlined style={{ marginRight: 8, color: "#1677ff" }} />
            影像数据库
          </DbTitle>
        }
        extra={
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            智能分析确认入库后同步 · 详情可查看标注图与 DICOM
          </Typography.Text>
        }
        stats={stats}
        data={data}
        rowKey={(r) => r.id}
        filterPlaceholder="搜索患者 / 检查号 / 报告摘要"
        filterFn={(row, kw) =>
          !kw ||
          safeLower(row.id).includes(kw) ||
          safeLower(row.patientName).includes(kw) ||
          safeLower(row.patientId).includes(kw) ||
          safeLower(row.reportSummary).includes(kw) ||
          safeLower(row.examItem).includes(kw)
        }
        modalityLabel="模态"
        modalityOptions={[
          { value: "CT", label: "CT" },
          { value: "MR", label: "MR / MRI" },
          { value: "PET-CT", label: "PET-CT" },
          { value: "超声", label: "超声" },
        ]}
        modalityFilter={(row, m) => matchModality(row, m)}
        columns={[
          { title: "检查号", dataIndex: "id", width: 150 },
          { title: "患者", width: 100, render: (_, r) => r.patientName },
          { title: "模态", dataIndex: "modality", width: 88 },
          { title: "检查项目", dataIndex: "examItem", ellipsis: true },
          { title: "日期", dataIndex: "examDate", width: 100 },
          { title: "DICOM", dataIndex: "dicomCount", width: 72 },
          {
            title: "标注图",
            width: 72,
            render: (_, r) => (r.hasAnnotatedImage ? <Tag color="blue">有</Tag> : "—"),
          },
          { title: "状态", width: 88, render: (_, r) => <StatusTag status={r.status} /> },
          {
            title: "操作",
            width: 88,
            fixed: "right",
            render: (_, r) => (
              <Button type="link" size="small" onClick={() => setDetail(r)}>
                详情 / 调阅
              </Button>
            ),
          },
        ]}
      />

      <Drawer
        title={detail ? `影像调阅 · ${detail.id}` : "影像详情"}
        open={!!detail}
        onClose={() => setDetail(null)}
        width={560}
      >
        {detail ? (
          <Tabs
            items={[
              {
                key: "annotated",
                label: getFollowUpBatchCase(detail.id)?.niiVolumeId ? "预勾画 NIfTI" : "标注图",
                children: (() => {
                  const batchCase = getFollowUpBatchCase(detail.id);
                  if (batchCase?.niiVolumeId) {
                    return (
                      <NiiSliceViewer
                        volumeId={batchCase.niiVolumeId}
                        backgroundVolumeId={batchCase.ctVolumeId}
                        title={batchCase.niiFileName || ""}
                      />
                    );
                  }
                  return hasAnnotatedImage(annotatedB64 || undefined) ? (
                    <img
                      src={imageSrcFromBase64(annotatedB64!)}
                      alt="AI 标注病灶图"
                      style={{ maxWidth: "100%", borderRadius: 8, border: "1px solid #e8edf5", background: "#0a0a0a" }}
                    />
                  ) : (
                    <Paragraph type="secondary">暂无标注图</Paragraph>
                  );
                })(),
              },
              {
                key: "viewer",
                label: "DICOM 调阅",
                children: (
                  <ImagingViewer
                    modality={detail.modality}
                    bodyPart={detail.bodyPart}
                    dicomCount={detail.dicomCount}
                  />
                ),
              },
              {
                key: "report",
                label: "影像报告",
                children: (
                  <div>
                    <Descriptions column={1} size="small" bordered style={{ marginBottom: 16 }}>
                      <Descriptions.Item label="患者">
                        {detail.patientName}（{detail.patientId}）
                      </Descriptions.Item>
                      <Descriptions.Item label="模态">{detail.modality}</Descriptions.Item>
                      <Descriptions.Item label="部位">{detail.bodyPart}</Descriptions.Item>
                      <Descriptions.Item label="检查项目">{detail.examItem}</Descriptions.Item>
                      <Descriptions.Item label="检查日期">{detail.examDate}</Descriptions.Item>
                      <Descriptions.Item label="状态">
                        <StatusTag status={detail.status} />
                      </Descriptions.Item>
                    </Descriptions>
                    <Paragraph
                      style={{
                        whiteSpace: "pre-wrap",
                        fontSize: 13,
                        lineHeight: 1.85,
                        background: "#fafbfc",
                        padding: 12,
                        borderRadius: 8,
                        border: "1px solid #e8edf5",
                        margin: 0,
                      }}
                    >
                      {detail.reportText}
                    </Paragraph>
                    <Text type="secondary" style={{ display: "block", marginTop: 12, fontSize: 12 }}>
                      摘要：{detail.reportSummary}
                    </Text>
                  </div>
                ),
              },
            ]}
          />
        ) : null}
      </Drawer>
    </>
  );
}
