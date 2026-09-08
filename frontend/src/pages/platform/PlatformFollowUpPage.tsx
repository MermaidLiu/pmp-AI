import { ReloadOutlined, TeamOutlined, ExperimentOutlined, ScanOutlined } from "@ant-design/icons";
import { App, Button, Card, Space, Table, Tag, Typography } from "antd";
import type { TableRowSelection } from "antd/es/table/interface";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { cohortQuery, type PetCtInterviewRecord } from "../../api/client";
import FollowUpBatchImportPanel from "../../components/platform/FollowUpBatchImportPanel";
import { FOLLOWUP_PHENOTYPE_TAG, listFollowUpQueue, type FollowUpEntry } from "../../lib/followUpQueue";
import { activateResearchFromFollowUpBatch } from "../../lib/researchBatchContext";
import { saveBatchSelection } from "../../lib/platformBatchSelection";
import {
  FOLLOWUP_BATCH_IMPORTED_EVENT,
  batchCasesToPlatformPatients,
  loadFollowUpBatch,
  type FollowUpBatchCase,
  type FollowUpBatchState,
} from "../../lib/followUpBatchStore";

const { Title, Paragraph, Text } = Typography;

export default function PlatformFollowUpPage() {
  const { message } = App.useApp();
  const nav = useNavigate();
  const [queue, setQueue] = useState<FollowUpEntry[]>([]);
  const [dbRecords, setDbRecords] = useState<PetCtInterviewRecord[]>([]);
  const [loadingDb, setLoadingDb] = useState(false);
  const [batch, setBatch] = useState<FollowUpBatchState | null>(() => loadFollowUpBatch());
  const [selectedVisitIds, setSelectedVisitIds] = useState<string[]>([]);

  const refreshQueue = useCallback(() => {
    setQueue(listFollowUpQueue());
  }, []);

  const loadDbFollowUp = useCallback(async () => {
    setLoadingDb(true);
    try {
      const data = await cohortQuery({
        phenotype_tag: FOLLOWUP_PHENOTYPE_TAG,
        limit: 100,
        skip: 0,
      });
      setDbRecords(data.records || []);
    } catch {
      message.error("数据库随访队列查询失败");
    } finally {
      setLoadingDb(false);
    }
  }, [message]);

  useEffect(() => {
    refreshQueue();
    void loadDbFollowUp();
    function onBatchImported(e: Event) {
      setBatch((e as CustomEvent<FollowUpBatchState>).detail ?? loadFollowUpBatch());
      setSelectedVisitIds([]);
    }
    window.addEventListener(FOLLOWUP_BATCH_IMPORTED_EVENT, onBatchImported);
    return () => window.removeEventListener(FOLLOWUP_BATCH_IMPORTED_EVENT, onBatchImported);
  }, [refreshQueue, loadDbFollowUp]);

  const gradeColor = (label: string) =>
    label === "高级别" ? "red" : label === "低级别" ? "green" : "default";

  const selectedCases = useMemo(() => {
    if (!batch?.cases.length || !selectedVisitIds.length) return [] as FollowUpBatchCase[];
    return batch.cases.filter((c) => selectedVisitIds.includes(c.visitId));
  }, [batch, selectedVisitIds]);

  const rowSelection: TableRowSelection<FollowUpBatchCase> = {
    selectedRowKeys: selectedVisitIds,
    onChange: (keys) => setSelectedVisitIds(keys as string[]),
    columnWidth: 48,
    fixed: "left",
  };

  function enterResearch() {
    if (!selectedVisitIds.length) {
      message.warning("请先勾选至少一例病例，再进入科研分析");
      return;
    }
    const ctx = activateResearchFromFollowUpBatch("follow_up_batch", selectedVisitIds);
    if (!ctx) {
      message.warning("请先完成导入并勾选病例");
      return;
    }
    if (ctx.clinicalSource === "none") {
      message.warning(
        "所选病例尚无可用的临床模板数据。若未走工作台录入，请在科研延伸页上传与模板一致的临床 Excel。",
      );
    } else if (ctx.clinicalSource === "workflow_mapped") {
      message.success(
        `已激活科研队列：工作台临床已映射为模板字段 · ${ctx.clinical.length} 例` +
          (ctx.imaging.length ? ` · ${ctx.imaging.length} 例影像` : ""),
      );
    } else {
      message.success(
        `已激活科研队列：${ctx.clinical.length} 例临床` +
          (ctx.imaging.length ? ` · ${ctx.imaging.length} 例影像` : ""),
      );
    }
    nav("/knowledge");
  }

  function enterImagingAnalysis() {
    if (!selectedVisitIds.length) {
      message.warning("请先勾选至少一例病例，再进行影像分析");
      return;
    }
    const withImage = selectedCases.filter((c) => c.niiVolumeId);
    if (!withImage.length) {
      message.warning("所选病例暂无关联预勾画影像，请先导入含 NIfTI 的 ZIP 并完成匹配");
      return;
    }
    // 影像分析只激活勾选且已关联影像的病例，数量与勾选可分析数一致
    const imagingVisitIds = withImage.map((c) => c.visitId);
    const ctx = activateResearchFromFollowUpBatch("follow_up_batch", imagingVisitIds);
    if (!ctx) {
      message.warning("无法激活科研影像批次");
      return;
    }
    const patients = batchCasesToPlatformPatients(withImage).map((p) => ({
      ...p,
      hasAnnotatedImage: true,
    }));
    const payload = {
      patients: withImage.map((c) => ({
        id: c.visitId,
        name: c.name || c.visitId,
        examId: c.visitId,
        gradeLabel: c.gradeLabel,
        hasAnnotatedImage: true,
        diagnosis: c.diagnosis,
        pciScore: c.pciScore,
        niiVolumeId: c.niiVolumeId ?? undefined,
        ctVolumeId: c.ctVolumeId ?? undefined,
      })),
      intent: "radiomics" as const,
      selectedAt: new Date().toISOString(),
    };
    try {
      sessionStorage.setItem("pmp_platform_batch_patients", JSON.stringify(payload));
    } catch {
      saveBatchSelection(patients, "radiomics");
    }
    message.success(`已同步 ${withImage.length} 例影像至智能分析（共勾选 ${selectedVisitIds.length} 例）`);
    nav("/knowledge/data/imaging");
  }

  return (
    <div className="pmp-section">
      <Title level={4}>
        <TeamOutlined style={{ marginRight: 8, color: "#1677ff" }} />
        随访队列
      </Title>
      <Paragraph type="secondary">
        支持三种导入：仅临床 Excel、仅预勾画 ZIP、或两者同时上传（推荐，按就诊号自动关联）。
        勾选病例后可进入科研分析或影像组学分析；未勾选时不可进入。
      </Paragraph>

      <FollowUpBatchImportPanel onImported={setBatch} />

      {batch ? (
        <Card
          title={`批量导入队列 · ${batch.matchedCount}/${batch.cases.length} 已关联影像`}
          size="small"
          style={{ marginBottom: 16 }}
          extra={
            <Space wrap>
              {selectedVisitIds.length ? (
                <Text type="secondary" style={{ fontSize: 12 }}>
                  已选 {selectedVisitIds.length} 例
                </Text>
              ) : null}
              <Button
                type="primary"
                size="small"
                icon={<ExperimentOutlined />}
                disabled={!selectedVisitIds.length}
                onClick={enterResearch}
              >
                进入科研分析
              </Button>
              <Button
                size="small"
                icon={<ScanOutlined />}
                disabled={!selectedVisitIds.length}
                onClick={enterImagingAnalysis}
              >
                进行影像分析
              </Button>
            </Space>
          }
        >
          <Table
            size="small"
            rowKey="visitId"
            rowSelection={rowSelection}
            pagination={{ pageSize: 10, showSizeChanger: true }}
            dataSource={batch.cases}
            scroll={{ x: 960 }}
            columns={[
              { title: "就诊号", dataIndex: "visitId", width: 120, fixed: "left" },
              { title: "姓名", dataIndex: "name", width: 88 },
              { title: "性别", dataIndex: "gender", width: 56 },
              { title: "年龄", dataIndex: "age", width: 72 },
              {
                title: "病理分级",
                dataIndex: "gradeLabel",
                width: 88,
                render: (v: string) => <Tag color={gradeColor(v)}>{v}</Tag>,
              },
              {
                title: "PCI",
                width: 56,
                render: (_: unknown, r: FollowUpBatchCase) => (r.pciScore != null ? r.pciScore : "—"),
              },
              {
                title: "预勾画",
                width: 88,
                render: (_: unknown, r: FollowUpBatchCase) =>
                  r.niiVolumeId ? <Tag color="cyan">已关联</Tag> : <Tag>未匹配</Tag>,
              },
              {
                title: "NIfTI",
                dataIndex: "niiFileName",
                ellipsis: true,
                render: (v: string | null) => v || "—",
              },
            ]}
          />
        </Card>
      ) : null}

      <Card
        title="本机随访队列（单例入队）"
        size="small"
        style={{ marginBottom: 16 }}
        extra={
          <Button
            size="small"
            icon={<ReloadOutlined />}
            onClick={() => {
              refreshQueue();
              void loadDbFollowUp();
            }}
          >
            刷新
          </Button>
        }
      >
        {queue.length === 0 ? (
          <Paragraph type="secondary" style={{ marginBottom: 0 }}>
            暂无单例随访病例。请先在 <Link to="/analysis">智能分析</Link> 完成分析并入队。
          </Paragraph>
        ) : (
          <Table
            size="small"
            rowKey="exam_id"
            pagination={false}
            dataSource={queue}
            scroll={{ x: 900 }}
            columns={[
              { title: "检查号", dataIndex: "exam_id", width: 140 },
              { title: "临床诊断", dataIndex: "clinical_diagnosis", ellipsis: true },
              { title: "科室", dataIndex: "department", width: 120 },
              { title: "年龄", dataIndex: "age", width: 60 },
              {
                title: "分级",
                dataIndex: "grade_label",
                width: 88,
                render: (v: string) => <Tag color={gradeColor(v)}>{v}</Tag>,
              },
              {
                title: "入队时间",
                dataIndex: "enrolled_at",
                width: 180,
                render: (v: string) => (v ? new Date(v).toLocaleString() : "—"),
              },
            ]}
          />
        )}
      </Card>

      <Card title="数据库随访队列（服务端）" size="small" loading={loadingDb}>
        {dbRecords.length === 0 ? (
          <Paragraph type="secondary" style={{ marginBottom: 0 }}>
            服务端暂无带「随访队列」标签的病例。
          </Paragraph>
        ) : (
          <Table
            size="small"
            rowKey={(r) => r.patient_base_info.exam_id}
            pagination={{ pageSize: 10 }}
            dataSource={dbRecords}
            scroll={{ x: 900 }}
            columns={[
              {
                title: "检查号",
                width: 140,
                render: (_: unknown, r: PetCtInterviewRecord) => String(r.patient_base_info.exam_id || "—"),
              },
              {
                title: "姓名",
                width: 100,
                render: (_: unknown, r: PetCtInterviewRecord) => String(r.patient_base_info.name || "—"),
              },
              {
                title: "临床诊断",
                ellipsis: true,
                render: (_: unknown, r: PetCtInterviewRecord) =>
                  String(r.interview_info.clinical_diagnosis || "—"),
              },
              {
                title: "科室",
                width: 120,
                render: (_: unknown, r: PetCtInterviewRecord) => String(r.patient_base_info.department || "—"),
              },
              {
                title: "病理分级",
                width: 88,
                render: (_: unknown, r: PetCtInterviewRecord) => {
                  const rx = r.research_extensions as { pathology_grade?: string } | undefined;
                  const g = rx?.pathology_grade || "—";
                  return <Tag color={gradeColor(g)}>{g}</Tag>;
                },
              },
            ]}
          />
        )}
      </Card>
    </div>
  );
}
