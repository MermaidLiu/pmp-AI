import { DatabaseOutlined, DownOutlined, ExperimentOutlined, SaveOutlined, TeamOutlined } from "@ant-design/icons";
import { App, Alert, Button, Dropdown, Input, InputNumber, Select, Space, Spin, Table, Tag, Typography } from "antd";
import type { ColumnsType, TableRowSelection } from "antd/es/table/interface";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { platformUpdatePatient, type PlatformPatient } from "../../api/platform";
import PatientImagingModal, { ImagingViewButton } from "../../components/platform/PatientImagingModal";
import { saveBatchSelection, type BatchOperationIntent } from "../../lib/platformBatchSelection";
import { activateResearchFromPatients } from "../../lib/researchBatchContext";
import { fetchMergedPlatformPatients } from "../../lib/platformPatientList";
import {
  loadFollowUpBatch,
  saveFollowUpBatch,
  type FollowUpBatchCase,
} from "../../lib/followUpBatchStore";
import { loadPatients, savePatients } from "../../lib/platformPatients";

const { Title, Text, Paragraph } = Typography;

const GRADE_FILTER_OPTIONS = [
  { value: "全部", label: "全部" },
  { value: "高级别", label: "高级别" },
  { value: "低级别", label: "低级别" },
  { value: "未确定", label: "未确定" },
];

const GRADE_EDIT_OPTIONS = [
  { value: "高级别", label: "高级别" },
  { value: "低级别", label: "低级别" },
  { value: "未确定", label: "未确定" },
  { value: "—", label: "—" },
];

const CC_OPTIONS = [
  { value: "CC-0", label: "CC-0" },
  { value: "CC-1", label: "CC-1" },
  { value: "CC-2", label: "CC-2" },
  { value: "CC-3", label: "CC-3" },
  { value: "—", label: "—" },
];

type EditableField =
  | "id"
  | "name"
  | "gender"
  | "age"
  | "department"
  | "diagnosis"
  | "clinicalSummary"
  | "gradeLabel"
  | "treatmentMethod"
  | "surgeryNumber"
  | "ivChemotherapy"
  | "pciScore"
  | "ccScore"
  | "followUpStatus"
  | "enrolledAt";

type EditingCell = { id: string; field: EditableField };

function gradeTag(v: string) {
  if (v === "高级别") return <Tag color="red">{v}</Tag>;
  if (v === "低级别") return <Tag color="green">{v}</Tag>;
  if (v === "未确定") return <Tag>{v}</Tag>;
  return v || "—";
}

function cell(v?: string | null) {
  return v && v !== "—" ? v : "—";
}

function patchFollowUpBatchCase(visitId: string, patient: PlatformPatient) {
  const batch = loadFollowUpBatch();
  if (!batch?.cases.length) return;
  const nextCases: FollowUpBatchCase[] = batch.cases.map((c) => {
    if (c.visitId !== visitId && c.visitId !== patient.examId && c.visitId !== patient.id) return c;
    return {
      ...c,
      name: patient.name || c.name,
      gender: patient.gender || c.gender,
      age: patient.age ? String(patient.age) : c.age,
      gradeLabel: patient.gradeLabel || c.gradeLabel,
      pciScore: patient.pciScore ?? c.pciScore,
      diagnosis: patient.diagnosis || c.diagnosis,
      pathology: patient.pathologySummary || patient.clinicalSummary || c.pathology,
      labs: {
        ...c.labs,
        ...(patient.ccScore && patient.ccScore !== "—" ? { CC评分: patient.ccScore } : {}),
        ...(patient.treatmentMethod && patient.treatmentMethod !== "—"
          ? { 治疗方式: patient.treatmentMethod }
          : {}),
      },
    };
  });
  saveFollowUpBatch({ ...batch, cases: nextCases });
}

export default function PlatformPatientDbPage() {
  const { message } = App.useApp();
  const navigate = useNavigate();
  const [keyword, setKeyword] = useState("");
  const [gradeFilter, setGradeFilter] = useState("全部");
  const [followUpOnly, setFollowUpOnly] = useState(false);
  const [rows, setRows] = useState<PlatformPatient[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [viewPatient, setViewPatient] = useState<PlatformPatient | null>(null);
  const [selectedRowKeys, setSelectedRowKeys] = useState<string[]>([]);
  const [editing, setEditing] = useState<EditingCell | null>(null);
  const [dirtyIds, setDirtyIds] = useState<Set<string>>(() => new Set());

  const fetchPatients = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchMergedPlatformPatients({
        keyword,
        gradeLabel: gradeFilter,
        followUp: followUpOnly,
      });
      setRows(data);
      setDirtyIds(new Set());
      setEditing(null);
    } catch {
      message.error("加载患者数据库失败");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [message, keyword, gradeFilter, followUpOnly]);

  useEffect(() => {
    const t = window.setTimeout(() => void fetchPatients(), 200);
    return () => window.clearTimeout(t);
  }, [fetchPatients]);

  const stats = useMemo(
    () => ({
      total: rows.length,
      high: rows.filter((r) => r.gradeLabel === "高级别").length,
      low: rows.filter((r) => r.gradeLabel === "低级别").length,
      follow: rows.filter((r) => r.followUpStatus === "随访中").length,
    }),
    [rows],
  );

  const selectedPatients = useMemo(
    () => rows.filter((r) => selectedRowKeys.includes(r.id)),
    [rows, selectedRowKeys],
  );

  const rowSelection: TableRowSelection<PlatformPatient> = {
    selectedRowKeys,
    onChange: (keys) => setSelectedRowKeys(keys as string[]),
    columnWidth: 48,
    fixed: "left",
  };

  function markDirty(id: string) {
    setDirtyIds((prev) => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  }

  function updateRow(id: string, patch: Partial<PlatformPatient>) {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
    markDirty(id);
  }

  function startEdit(id: string, field: EditableField) {
    setEditing({ id, field });
  }

  function stopEdit() {
    setEditing(null);
  }

  function editableProps(id: string, field: EditableField) {
    return {
      onDoubleClick: () => startEdit(id, field),
      style: { cursor: "text" } as const,
      title: "双击编辑",
    };
  }

  function renderEditableText(
    record: PlatformPatient,
    field: EditableField,
    display: ReactNode,
    opts?: { type?: "text" | "number" | "select"; options?: { value: string; label: string }[] },
  ) {
    const isEditing = editing?.id === record.id && editing.field === field;
    if (!isEditing) {
      return (
        <span {...editableProps(record.id, field)}>
          {display}
        </span>
      );
    }
    if (opts?.type === "number") {
      return (
        <InputNumber
          size="small"
          autoFocus
          min={0}
          max={150}
          value={typeof record[field] === "number" ? (record[field] as number) : Number(record.age) || 0}
          onChange={(v) => updateRow(record.id, { age: Number(v) || 0 })}
          onBlur={stopEdit}
          onPressEnter={stopEdit}
          style={{ width: "100%" }}
        />
      );
    }
    if (opts?.type === "select" && opts.options) {
      const raw = record[field];
      const value = typeof raw === "string" || typeof raw === "number" ? String(raw ?? "—") : "—";
      return (
        <Select
          size="small"
          autoFocus
          open
          value={value}
          options={opts.options}
          onChange={(v) => {
            updateRow(record.id, { [field]: v } as Partial<PlatformPatient>);
            stopEdit();
          }}
          onBlur={stopEdit}
          style={{ width: "100%" }}
          popupMatchSelectWidth={false}
        />
      );
    }
    const rawVal = record[field];
    const text =
      field === "pciScore"
        ? record.pciScore != null
          ? String(record.pciScore)
          : ""
        : typeof rawVal === "string" || typeof rawVal === "number"
          ? String(rawVal ?? "")
          : "";
    return (
      <Input
        size="small"
        autoFocus
        defaultValue={text === "—" ? "" : text}
        onBlur={(e) => {
          const v = e.target.value.trim();
          if (field === "pciScore") {
            const n = v === "" ? null : Number(v);
            updateRow(record.id, { pciScore: Number.isFinite(n as number) ? (n as number) : null });
          } else if (field === "age") {
            updateRow(record.id, { age: Number(v) || 0 });
          } else {
            updateRow(record.id, { [field]: v || "—" } as Partial<PlatformPatient>);
          }
          stopEdit();
        }}
        onPressEnter={(e) => (e.target as HTMLInputElement).blur()}
      />
    );
  }

  async function saveEdits() {
    if (!dirtyIds.size) {
      message.info("没有需要保存的修改");
      return;
    }
    setSaving(true);
    const dirtyRows = rows.filter((r) => dirtyIds.has(r.id));
    let ok = 0;
    let localOnly = 0;
    try {
      for (const row of dirtyRows) {
        const examId = row.examId || row.admissionId || row.id;
        try {
          await platformUpdatePatient(row, examId);
          ok += 1;
        } catch {
          // Fall back: follow-up batch / local cache rows
          patchFollowUpBatchCase(examId, row);
          const local = loadPatients();
          const idx = local.findIndex(
            (p) => p.id === row.id || p.admissionId === examId || p.id === examId,
          );
          if (idx >= 0) {
            local[idx] = { ...local[idx], ...row };
            savePatients(local);
          } else {
            savePatients([...local, row]);
          }
          localOnly += 1;
        }
      }
      setDirtyIds(new Set());
      setEditing(null);
      if (ok && localOnly) {
        message.success(`已保存 ${ok} 例到数据库，${localOnly} 例写入本地/随访批次`);
      } else if (ok) {
        message.success(`已更新 ${ok} 例患者信息`);
      } else {
        message.success(`已保存 ${localOnly} 例到本地/随访批次`);
      }
      await fetchPatients();
    } catch (e) {
      message.error(e instanceof Error ? e.message : "保存失败");
    } finally {
      setSaving(false);
    }
  }

  function resolveBatchPatients(): PlatformPatient[] {
    if (selectedPatients.length) return selectedPatients;
    message.warning("请先勾选至少一名患者");
    return [];
  }

  function runBatchOperation(intent: BatchOperationIntent) {
    const patients = resolveBatchPatients();
    if (!patients.length) return;
    if (intent === "radiomics") {
      const withImage = patients.filter((p) => p.hasAnnotatedImage);
      if (!withImage.length) {
        message.warning("所选患者暂无 AI 分割标注图，请先在智能分析完成 DICOM 分析并入库");
        return;
      }
      saveBatchSelection(withImage, intent);
      activateResearchFromPatients(withImage, "patient_db", intent);
      navigate("/knowledge/data/imaging");
      return;
    }
    saveBatchSelection(patients, intent);
    activateResearchFromPatients(patients, "patient_db", intent);
    navigate("/knowledge/data/clinical");
  }

  function exportSelectedRows() {
    const exportRows = selectedPatients.length ? selectedPatients : rows;
    if (!exportRows.length) {
      message.info("没有可导出的记录");
      return;
    }
    const header = ["患者ID", "姓名", "性别", "年龄", "诊断", "病理分级", "PCI", "CC评分", "治疗方式", "随访"];
    const lines = exportRows.map((r) =>
      [
        r.id,
        r.name,
        r.gender,
        r.age,
        r.diagnosis,
        r.gradeLabel || "",
        r.pciScore != null ? `${r.pciScore}/36` : "",
        r.ccScore || "",
        r.treatmentMethod || "",
        r.followUpStatus || "",
      ]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(","),
    );
    const csv = `\uFEFF${header.join(",")}\n${lines.join("\n")}`;
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `患者数据库_${exportRows.length}例.csv`;
    a.click();
    URL.revokeObjectURL(url);
    message.success(`已导出 ${exportRows.length} 例${selectedPatients.length ? "（已选）" : ""}`);
  }

  const columns: ColumnsType<PlatformPatient> = [
    {
      title: "患者 ID",
      dataIndex: "id",
      width: 120,
      fixed: "left",
      render: (v: string, r) => renderEditableText(r, "id", v),
    },
    {
      title: "姓名",
      dataIndex: "name",
      width: 80,
      fixed: "left",
      render: (v: string, r) => renderEditableText(r, "name", v),
    },
    {
      title: "基本信息",
      width: 140,
      render: (_, r) => (
        <span>
          {renderEditableText(r, "gender", r.gender, {
            type: "select",
            options: [
              { value: "男", label: "男" },
              { value: "女", label: "女" },
              { value: "—", label: "—" },
            ],
          })}
          {" · "}
          {renderEditableText(r, "age", `${r.age}岁`, { type: "number" })}
          <br />
          <Text type="secondary" style={{ fontSize: 11 }}>
            {renderEditableText(r, "department", r.department)}
          </Text>
        </span>
      ),
    },
    {
      title: "临床信息",
      dataIndex: "clinicalSummary",
      width: 180,
      ellipsis: true,
      render: (v: string, r) => (
        <span>
          <div>{renderEditableText(r, "diagnosis", r.diagnosis)}</div>
          <Text type="secondary" style={{ fontSize: 11 }}>
            {renderEditableText(r, "clinicalSummary", v !== "—" ? v : r.chiefComplaint)}
          </Text>
        </span>
      ),
    },
    {
      title: (
        <div className="pmp-grade-col-head">
          <span>病理分级</span>
          <Select
            size="small"
            value={gradeFilter}
            options={GRADE_FILTER_OPTIONS}
            onChange={setGradeFilter}
            popupMatchSelectWidth={false}
            className="pmp-grade-col-select"
          />
        </div>
      ),
      dataIndex: "gradeLabel",
      width: 110,
      render: (v: string, r) =>
        renderEditableText(r, "gradeLabel", gradeTag(v), { type: "select", options: GRADE_EDIT_OPTIONS }),
    },
    {
      title: "治疗方式",
      dataIndex: "treatmentMethod",
      width: 110,
      ellipsis: true,
      render: (v: string, r) => renderEditableText(r, "treatmentMethod", cell(v)),
    },
    {
      title: "第几次手术",
      dataIndex: "surgeryNumber",
      width: 96,
      render: (v: string, r) => renderEditableText(r, "surgeryNumber", cell(v)),
    },
    {
      title: "静脉化疗",
      dataIndex: "ivChemotherapy",
      width: 96,
      render: (v: string, r) =>
        renderEditableText(
          r,
          "ivChemotherapy",
          v === "是" ? <Tag color="orange">是</Tag> : v === "否" ? <Tag>否</Tag> : "—",
          {
            type: "select",
            options: [
              { value: "是", label: "是" },
              { value: "否", label: "否" },
              { value: "—", label: "—" },
            ],
          },
        ),
    },
    {
      title: "PCI",
      dataIndex: "pciScore",
      width: 80,
      render: (v: number | null | undefined, r) =>
        renderEditableText(r, "pciScore", v != null ? `${v}/36` : "—"),
    },
    {
      title: "CC评分",
      dataIndex: "ccScore",
      width: 88,
      render: (v: string, r) =>
        renderEditableText(r, "ccScore", cell(v), { type: "select", options: CC_OPTIONS }),
    },
    {
      title: "影像",
      width: 140,
      render: (_, r) => (
        <span>
          <Text type="secondary" style={{ fontSize: 11, display: "block" }}>
            {r.imagingSummary || r.modality || "—"}
          </Text>
          <Space size={4}>
            <ImagingViewButton patient={r} onView={setViewPatient} />
            {r.hasAnnotatedImage ? (
              <Tag color="blue" style={{ fontSize: 10, margin: 0 }}>
                分割
              </Tag>
            ) : null}
          </Space>
        </span>
      ),
    },
    {
      title: "随访",
      dataIndex: "followUpStatus",
      width: 96,
      render: (v: string, r) =>
        renderEditableText(
          r,
          "followUpStatus",
          v === "随访中" ? <Tag color="blue">{v}</Tag> : v || "—",
          {
            type: "select",
            options: [
              { value: "随访中", label: "随访中" },
              { value: "—", label: "—" },
            ],
          },
        ),
    },
    {
      title: "入库",
      dataIndex: "enrolledAt",
      width: 110,
      render: (v: string, r) => renderEditableText(r, "enrolledAt", v),
    },
  ];

  return (
    <div className="pmp-section">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
        <div>
          <Title level={4} style={{ margin: 0 }}>
            <TeamOutlined style={{ marginRight: 8, color: "#1677ff" }} />
            患者数据库
          </Title>
          <Paragraph type="secondary" style={{ marginBottom: 0, marginTop: 8, maxWidth: 720 }}>
            统一病例表：双击单元格可编辑，点「保存修改」写回列表。流程：工作台录入 → 智能分析 →
            随访入队 → <Link to="/knowledge">科研延伸</Link>。
          </Paragraph>
        </div>
        <Space>
          <Link to="/workflow">
            <Button type="primary" icon={<ExperimentOutlined />}>
              新建分析
            </Button>
          </Link>
          <Button onClick={() => void fetchPatients()}>刷新</Button>
        </Space>
      </div>

      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
        message="Excel 式病例总表"
        description="双击任意单元格修改；「病理分级」列头可筛选；「影像」列可查看 DICOM 与 AI 分割图。"
      />

      <div className="pmp-card" style={{ padding: 16, marginBottom: 16 }}>
        <Space wrap size="large">
          <div className="pmp-stat-inline">
            <Text type="secondary">病例总数</Text>
            <div className="pmp-stat-inline-value">{stats.total} 例</div>
          </div>
          <div className="pmp-stat-inline">
            <Text type="secondary">高级别</Text>
            <div className="pmp-stat-inline-value" style={{ color: "#cf1322" }}>
              {stats.high} 例
            </div>
          </div>
          <div className="pmp-stat-inline">
            <Text type="secondary">低级别</Text>
            <div className="pmp-stat-inline-value" style={{ color: "#389e0d" }}>
              {stats.low} 例
            </div>
          </div>
          <div className="pmp-stat-inline">
            <Text type="secondary">随访中</Text>
            <div className="pmp-stat-inline-value">{stats.follow} 例</div>
          </div>
        </Space>
      </div>

      <div className="pmp-card" style={{ padding: 16 }}>
        <Space wrap style={{ marginBottom: 16 }}>
          <Input.Search
            placeholder="搜索 ID / 姓名 / 诊断 / 治疗方式 / PCI…"
            allowClear
            style={{ width: 320 }}
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
          />
          <Select
            value={followUpOnly ? "follow" : "all"}
            style={{ width: 140 }}
            onChange={(v) => setFollowUpOnly(v === "follow")}
            options={[
              { value: "all", label: "全部患者" },
              { value: "follow", label: "仅随访队列" },
            ]}
          />
          <Button
            type="primary"
            icon={<SaveOutlined />}
            loading={saving}
            disabled={!dirtyIds.size}
            onClick={() => void saveEdits()}
          >
            保存修改{dirtyIds.size ? `（${dirtyIds.size}）` : ""}
          </Button>
          <Button icon={<DatabaseOutlined />} onClick={exportSelectedRows}>
            批量导出
          </Button>
          <Dropdown
            menu={{
              items: [
                {
                  key: "radiomics",
                  label: (
                    <div>
                      <div>提取组学</div>
                      <div style={{ fontSize: 11, color: "#6b7280", marginTop: 2 }}>
                        跳转至影像数据智能分析，基于标注图建模
                      </div>
                    </div>
                  ),
                  onClick: () => runBatchOperation("radiomics"),
                },
                {
                  key: "clinical",
                  label: (
                    <div>
                      <div>临床及病理数据分析</div>
                      <div style={{ fontSize: 11, color: "#6b7280", marginTop: 2 }}>
                        面向临床、病理、随访等结构化数据，用于病理分级相关因素、生存分析、预后模型等任务
                      </div>
                    </div>
                  ),
                  onClick: () => runBatchOperation("clinical"),
                },
              ],
            }}
          >
            <Button>
              批量操作 <DownOutlined />
            </Button>
          </Dropdown>
          {selectedRowKeys.length ? (
            <Tag color="blue">已选 {selectedRowKeys.length} 例</Tag>
          ) : null}
        </Space>

        {loading ? (
          <div style={{ textAlign: "center", padding: 32 }}>
            <Spin />
          </div>
        ) : (
          <Table
            size="small"
            rowKey="id"
            rowSelection={rowSelection}
            dataSource={rows}
            columns={columns}
            scroll={{ x: 1500 }}
            pagination={{ pageSize: 10, showSizeChanger: true, pageSizeOptions: ["10", "20", "50"] }}
          />
        )}
      </div>

      <PatientImagingModal open={Boolean(viewPatient)} patient={viewPatient} onClose={() => setViewPatient(null)} />
    </div>
  );
}
