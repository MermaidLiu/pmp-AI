import { ReloadOutlined } from "@ant-design/icons";
import { App, Button, Card, Form, Input, InputNumber, Space, Switch, Table, Tag, Typography } from "antd";
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { cohortQuery, followupCompare, type PetCtInterviewRecord } from "../api/client";
import { FOLLOWUP_PHENOTYPE_TAG, listFollowUpQueue, type FollowUpEntry } from "../lib/followUpQueue";
import { getWorkflowCase } from "../lib/workflowCase";

export default function ModuleCohort() {
  const { message } = App.useApp();
  const [queue, setQueue] = useState<FollowUpEntry[]>([]);
  const [dbRecords, setDbRecords] = useState<PetCtInterviewRecord[]>([]);
  const [compareResult, setCompareResult] = useState<unknown>(null);
  const [loadingDb, setLoadingDb] = useState(false);

  const refreshQueue = useCallback(() => {
    setQueue(listFollowUpQueue());
  }, []);

  const loadDbFollowUp = useCallback(async () => {
    setLoadingDb(true);
    try {
      const wf = getWorkflowCase();
      const data = await cohortQuery({
        phenotype_tag: FOLLOWUP_PHENOTYPE_TAG,
        department_contains: wf.patient_base_info.department || undefined,
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
  }, [refreshQueue, loadDbFollowUp]);

  const gradeColor = (label: string) =>
    label === "高级别" ? "red" : label === "低级别" ? "green" : "default";

  return (
    <div>
      <Typography.Title level={4} className="glass-page-title">
        随访队列
      </Typography.Title>
      <Typography.Paragraph type="secondary">
        工作台第 4 步：查看从「诊断结果」加入的随访病例，按科室筛选并对比多次检查记录。
      </Typography.Paragraph>

      <Card
        title="本工作台随访队列"
        size="small"
        style={{ marginBottom: 16 }}
        extra={
          <Button size="small" icon={<ReloadOutlined />} onClick={() => { refreshQueue(); void loadDbFollowUp(); }}>
            刷新
          </Button>
        }
      >
        {queue.length === 0 ? (
          <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>
            暂无随访病例。请先在「诊断结果」生成诊断后，点击「加入随访队列」。
          </Typography.Paragraph>
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
              { title: "性别", dataIndex: "gender", width: 60 },
              {
                title: "病理分级",
                dataIndex: "grade_label",
                width: 96,
                render: (v: string) => <Tag color={gradeColor(v)}>{v}</Tag>,
              },
              { title: "WHO", dataIndex: "who_grade", width: 56 },
              { title: "综合评分", dataIndex: "composite_score", width: 88 },
              {
                title: "入队时间",
                dataIndex: "enrolled_at",
                width: 168,
                render: (v: string) => (v ? new Date(v).toLocaleString() : "—"),
              },
            ]}
          />
        )}
      </Card>

      <Card title="数据库随访病例（已入库）" size="small" style={{ marginBottom: 16 }} loading={loadingDb}>
        {dbRecords.length === 0 ? (
          <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>
            数据库中暂无带「随访队列」标签的病例。加入随访时会自动写入数据库。
          </Typography.Paragraph>
        ) : (
          <Table
            size="small"
            rowKey={(r) => r.patient_base_info.exam_id}
            pagination={false}
            dataSource={dbRecords}
            scroll={{ x: 900 }}
            columns={[
              { title: "检查号", render: (_: unknown, r: PetCtInterviewRecord) => r.patient_base_info.exam_id, width: 140 },
              {
                title: "临床诊断",
                render: (_: unknown, r: PetCtInterviewRecord) => r.interview_info.clinical_diagnosis,
                ellipsis: true,
              },
              { title: "科室", render: (_: unknown, r: PetCtInterviewRecord) => r.patient_base_info.department, width: 120 },
              {
                title: "病理分级",
                render: (_: unknown, r: PetCtInterviewRecord) => (
                  <Tag color={gradeColor(r.research_extensions?.pathology_grade || "")}>
                    {r.research_extensions?.pathology_grade || "—"}
                  </Tag>
                ),
                width: 96,
              },
            ]}
          />
        )}
      </Card>

      <Typography.Title level={5}>高级筛选</Typography.Title>
      <Form
        layout="vertical"
        initialValues={{ phenotype_tag: FOLLOWUP_PHENOTYPE_TAG, limit: 50 }}
        onFinish={async (v) => {
          try {
            const data = await cohortQuery({
              disease_code: v.disease_code || undefined,
              department_contains: v.department_contains || undefined,
              min_age: v.min_age ?? undefined,
              max_age: v.max_age ?? undefined,
              gender: v.gender || undefined,
              phenotype_tag: v.phenotype_tag || undefined,
              has_pet_lesion_suv: v.has_pet_lesion_suv || undefined,
              limit: v.limit ?? 50,
              skip: 0,
            });
            setDbRecords(data.records || []);
            message.success(`查询到 ${data.n ?? data.records?.length ?? 0} 例`);
          } catch {
            message.error("队列查询失败");
          }
        }}
        style={{ maxWidth: 480, marginBottom: 24 }}
      >
        <Form.Item label="代谢/表型标签" name="phenotype_tag">
          <Input placeholder="随访队列" />
        </Form.Item>
        <Form.Item label="病种编码（可选）" name="disease_code">
          <Input placeholder="如 PATH" />
        </Form.Item>
        <Form.Item label="科室包含" name="department_contains">
          <Input placeholder="如 妇科肿瘤" />
        </Form.Item>
        <Form.Item label="最小年龄" name="min_age">
          <InputNumber style={{ width: "100%" }} />
        </Form.Item>
        <Form.Item label="最大年龄" name="max_age">
          <InputNumber style={{ width: "100%" }} />
        </Form.Item>
        <Form.Item label="性别" name="gender">
          <Input placeholder="男 / 女" />
        </Form.Item>
        <Form.Item label="仅病灶含 SUV" name="has_pet_lesion_suv" valuePropName="checked">
          <Switch />
        </Form.Item>
        <Form.Item label="条数上限" name="limit">
          <InputNumber min={1} max={500} style={{ width: "100%" }} />
        </Form.Item>
        <Button type="primary" htmlType="submit">
          查询数据库队列
        </Button>
      </Form>

      <Typography.Title level={5}>多次 PET-CT 对比</Typography.Title>
      <Form
        layout="inline"
        onFinish={async (v) => {
          try {
            const data = await followupCompare(v.baseline, v.followup);
            setCompareResult(data);
            message.success("对比完成");
          } catch {
            message.error("对比失败");
          }
        }}
      >
        <Form.Item name="baseline" rules={[{ required: true }]} initialValue={getWorkflowCase().patient_base_info.exam_id}>
          <Input placeholder="基线 exam_id" style={{ width: 200 }} />
        </Form.Item>
        <Form.Item name="followup" rules={[{ required: true }]}>
          <Input placeholder="随访 exam_id" style={{ width: 200 }} />
        </Form.Item>
        <Form.Item>
          <Button type="primary" htmlType="submit">
            对比
          </Button>
        </Form.Item>
      </Form>
      {compareResult ? (
        <pre className="glass-codeblock" style={{ marginTop: 16, padding: 12, fontSize: 12, maxHeight: 400, overflow: "auto" }}>
          {JSON.stringify(compareResult, null, 2)}
        </pre>
      ) : null}
      <Typography.Paragraph style={{ marginTop: 24 }}>
        下一步 →{" "}
        <Link to="/knowledge" className="glass-link">
          知识积累
        </Link>
      </Typography.Paragraph>
    </div>
  );
}
