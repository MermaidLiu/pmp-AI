import { TeamOutlined } from "@ant-design/icons";
import { Button, Space, Tag } from "antd";
import { useMemo, useState } from "react";
import { DatabasePageShell, DbTitle, GradeTag } from "../../components/platform/DatabasePageShell";
import { MOCK_COHORT } from "../../data/analysisMock";

export default function PlatformCohortAnalysisPage() {
  const [gradeFilter, setGradeFilter] = useState<string>("全部");

  const stats = useMemo(() => {
    const high = MOCK_COHORT.filter((c) => c.gradeLabel === "高级别").length;
    const low = MOCK_COHORT.filter((c) => c.gradeLabel === "低级别").length;
    const active = MOCK_COHORT.filter((c) => c.followUpStatus === "随访中").length;
    const pmp = MOCK_COHORT.filter((c) => c.pmpSubtype && c.pmpSubtype !== "—").length;
    return [
      { title: "队列总数", value: MOCK_COHORT.length, suffix: "例" },
      { title: "高级别", value: high, suffix: "例", color: "#cf1322" },
      { title: "低级别", value: low, suffix: "例", color: "#3f8600" },
      { title: "随访中", value: active, suffix: "例", color: "#1677ff" },
      { title: "PMP 分型", value: pmp, suffix: "例" },
    ];
  }, []);

  const data = useMemo(() => {
    if (gradeFilter === "全部") return MOCK_COHORT;
    return MOCK_COHORT.filter((c) => c.gradeLabel === gradeFilter);
  }, [gradeFilter]);

  return (
    <DatabasePageShell
      title={
        <DbTitle level={4} style={{ margin: 0 }}>
          <TeamOutlined style={{ marginRight: 8, color: "#1677ff" }} />
          队列分析
        </DbTitle>
      }
      extra={
        <Space>
          <Button type={gradeFilter === "全部" ? "primary" : "default"} onClick={() => setGradeFilter("全部")}>
            全部
          </Button>
          <Button type={gradeFilter === "高级别" ? "primary" : "default"} danger onClick={() => setGradeFilter("高级别")}>
            高级别
          </Button>
          <Button type={gradeFilter === "低级别" ? "primary" : "default"} onClick={() => setGradeFilter("低级别")}>
            低级别
          </Button>
        </Space>
      }
      stats={stats}
      data={data}
      rowKey={(r) => r.id}
      filterPlaceholder="搜索患者 / 诊断 / 科室 / DPAM·PMCA"
      filterFn={(row, kw) =>
        !kw ||
        row.patientName.toLowerCase().includes(kw) ||
        row.patientId.toLowerCase().includes(kw) ||
        row.diagnosis.toLowerCase().includes(kw) ||
        row.department.toLowerCase().includes(kw) ||
        row.pmpSubtype.toLowerCase().includes(kw)
      }
      modalityOptions={[
        { value: "随访中", label: "随访中" },
        { value: "已完成", label: "已完成" },
        { value: "失访", label: "失访" },
      ]}
      modalityFilter={(row, m) => row.followUpStatus === m}
      columns={[
        { title: "队列 ID", dataIndex: "id", width: 88 },
        { title: "患者 ID", dataIndex: "patientId", width: 130 },
        { title: "姓名", dataIndex: "patientName", width: 88 },
        { title: "性别", dataIndex: "gender", width: 56 },
        { title: "年龄", dataIndex: "age", width: 56 },
        { title: "临床诊断", dataIndex: "diagnosis", ellipsis: true },
        { title: "分级", width: 88, render: (_, r) => <GradeTag label={r.gradeLabel} /> },
        {
          title: "PMP",
          width: 72,
          render: (_, r) =>
            r.pmpSubtype && r.pmpSubtype !== "—" ? (
              <Tag color={r.pmpSubtype === "PMCA" ? "red" : "green"}>{r.pmpSubtype}</Tag>
            ) : (
              "—"
            ),
        },
        { title: "科室", dataIndex: "department", width: 100 },
        {
          title: "SUVmax",
          width: 72,
          render: (_, r) => (r.suvMax != null ? r.suvMax.toFixed(1) : "—"),
        },
        { title: "入队日期", dataIndex: "enrolledAt", width: 100 },
        { title: "下次随访", dataIndex: "nextVisit", width: 100 },
        {
          title: "状态",
          width: 88,
          render: (_, r) => {
            const color =
              r.followUpStatus === "随访中" ? "blue" : r.followUpStatus === "失访" ? "red" : "green";
            return <Tag color={color}>{r.followUpStatus}</Tag>;
          },
        },
      ]}
    />
  );
}
