import { InboxOutlined } from "@ant-design/icons";
import { App, Alert, Button, Col, Divider, Form, Input, InputNumber, Row, Select, Spin, Statistic, Switch, Table, Tabs, Tag, Typography, Upload } from "antd";
import axios from "axios";
import { useState } from "react";
import { Link } from "react-router-dom";
import type { BatchIngestItem, PathologyBatchCohortResult } from "../api/client";
import { batchIngest, pathologyBatchCohort } from "../api/client";
import { getWorkflowCase, mergeIngestedCase, saveClinicalFields } from "../lib/workflowCase";
import IngestionTrainingPanel from "./IngestionTrainingPanel";

const { Paragraph, Text } = Typography;

function IngestionUploadPanel() {
  const { message } = App.useApp();
  const initial = getWorkflowCase();
  const [persist, setPersist] = useState(false);
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<BatchIngestItem[]>([]);
  const [cohort, setCohort] = useState<PathologyBatchCohortResult | null>(null);

  const [clinicalDiagnosis, setClinicalDiagnosis] = useState(
    initial.interview_info.clinical_diagnosis || "腹膜假粘液瘤（PMP），待 DPAM/PMCA 分型",
  );
  const [briefHistory, setBriefHistory] = useState(initial.interview_info.brief_medical_history || "");
  const [age, setAge] = useState<number | null>(initial.patient_base_info.age || null);
  const [gender, setGender] = useState(initial.patient_base_info.gender || "");
  const [department, setDepartment] = useState(initial.patient_base_info.department || "妇科肿瘤科");
  const [medicalRecordId, setMedicalRecordId] = useState(initial.patient_base_info.medical_record_id || "");

  function syncClinicalFields(overrides: Parameters<typeof saveClinicalFields>[0] = {}) {
    saveClinicalFields({
      clinicalDiagnosis,
      briefMedicalHistory: briefHistory,
      age: age ?? undefined,
      gender,
      department,
      medicalRecordId,
      ...overrides,
    });
  }

  return (
    <>
      <Typography.Title level={5} style={{ marginTop: 0 }}>
        临床数据 / 病历输入
      </Typography.Title>
      <Paragraph type="secondary" style={{ marginBottom: 12 }}>
        填写临床诊断与基本病历信息，将与上传的 DICOM / JSON 一并带入「诊断结果」与随访队列。
      </Paragraph>
      <Form layout="vertical" style={{ maxWidth: 720, marginBottom: 16 }}>
        <Form.Item label="临床诊断" required>
          <Input.TextArea
            rows={2}
            value={clinicalDiagnosis}
            onChange={(e) => {
              setClinicalDiagnosis(e.target.value);
              syncClinicalFields({ clinicalDiagnosis: e.target.value });
            }}
            placeholder="如：腹膜假粘液瘤 DPAM、PMCA 待排、卵巢高级别浆液性癌等"
          />
        </Form.Item>
        <Form.Item label="简要病史 / 现病史">
          <Input.TextArea
            rows={2}
            value={briefHistory}
            onChange={(e) => {
              setBriefHistory(e.target.value);
              syncClinicalFields({ briefMedicalHistory: e.target.value });
            }}
            placeholder="主诉、既往史、手术史、腹腔种植范围等"
          />
        </Form.Item>
        <Row gutter={16}>
          <Col xs={24} sm={8}>
            <Form.Item label="年龄">
              <InputNumber
                min={0}
                max={120}
                style={{ width: "100%" }}
                value={age}
                onChange={(v) => {
                  setAge(v);
                  syncClinicalFields({ age: v ?? undefined });
                }}
              />
            </Form.Item>
          </Col>
          <Col xs={24} sm={8}>
            <Form.Item label="性别">
              <Select
                allowClear
                placeholder="请选择"
                value={gender || undefined}
                onChange={(v) => {
                  setGender(v || "");
                  syncClinicalFields({ gender: v || "" });
                }}
                options={[
                  { value: "男", label: "男" },
                  { value: "女", label: "女" },
                ]}
              />
            </Form.Item>
          </Col>
          <Col xs={24} sm={8}>
            <Form.Item label="病历号">
              <Input
                value={medicalRecordId}
                onChange={(e) => {
                  setMedicalRecordId(e.target.value);
                  syncClinicalFields({ medicalRecordId: e.target.value });
                }}
                placeholder="院内病历号"
              />
            </Form.Item>
          </Col>
        </Row>
        <Form.Item label="科室">
          <Input
            value={department}
            onChange={(e) => {
              setDepartment(e.target.value);
              syncClinicalFields({ department: e.target.value });
            }}
            placeholder="如：妇科肿瘤科"
          />
        </Form.Item>
      </Form>

      <Typography.Title level={5}>DICOM / 病历文件上传</Typography.Title>
      <div style={{ marginBottom: 16, display: "flex", alignItems: "center", gap: 12 }}>
        <span>解析后直接入库（模型训练需开启）</span>
        <Switch checked={persist} onChange={setPersist} />
      </div>
      <Spin spinning={loading} tip="正在解析并请求后端…">
        <Upload.Dragger
          multiple
          disabled={loading}
          accept="image/*,.json,application/json,.pdf,application/pdf,.dcm,application/dicom,.zip,application/zip,application/x-zip-compressed"
          showUploadList
          beforeUpload={async (file, fileList) => {
            const last = fileList[fileList.length - 1];
            if (!last || last.uid !== file.uid) return false;
            setLoading(true);
            try {
              syncClinicalFields();
              const files = fileList.map((f) => (("originFileObj" in f && f.originFileObj) || f) as File);
              const [data, cohortRes] = await Promise.all([
                batchIngest(files, persist),
                pathologyBatchCohort(files).catch(() => null),
              ]);
              setRows(data);
              const okParsed = data.find((r) => r.ok && r.parsed);
              if (okParsed?.parsed) {
                mergeIngestedCase(okParsed.parsed, clinicalDiagnosis);
                syncClinicalFields();
              } else {
                syncClinicalFields();
              }
              if (cohortRes && cohortRes.total > 0) setCohort(cohortRes);
              const failed = data.filter((r) => !r.ok).length;
              if (failed) {
                message.warning(`已处理 ${data.length} 个文件，其中 ${failed} 个失败`);
              } else {
                message.success(`已处理 ${data.length} 个文件，临床数据已关联`);
              }
            } catch (e: unknown) {
              let hint = "请确认后端已启动（127.0.0.1:8000）。";
              if (axios.isAxiosError(e)) {
                if (e.code === "ECONNABORTED" || e.message.includes("timeout")) hint = "请求超时。";
                else if (e.code === "ERR_NETWORK" || e.message.includes("ETIMEDOUT")) {
                  hint = "无法连接后端，请先启动 uvicorn。";
                }
              }
              message.error(`批量解析失败：${hint}`);
            } finally {
              setLoading(false);
            }
            return false;
          }}
        >
          <p className="ant-upload-drag-icon">
            <InboxOutlined />
          </p>
          <p className="ant-upload-text">拖拽 DICOM / ZIP / JSON 到此处</p>
          <p className="ant-upload-hint">
            优先上传 .dcm 或含 .dcm 的 ZIP；约 160 例可平衡为高级别 ~80、低级别 ~80。
          </p>
        </Upload.Dragger>
      </Spin>

      {cohort && cohort.total > 0 ? (
        <div style={{ marginTop: 24 }}>
          <Divider />
          <Typography.Title level={5}>队列诊断分布</Typography.Title>
          <Row gutter={16}>
            <Col span={6}>
              <Statistic title="总计" value={cohort.total} />
            </Col>
            <Col span={6}>
              <Statistic title="高级别" value={cohort.high_grade_count} valueStyle={{ color: "#cf1322" }} />
            </Col>
            <Col span={6}>
              <Statistic title="低级别" value={cohort.low_grade_count} valueStyle={{ color: "#3f8600" }} />
            </Col>
            <Col span={6}>
              <Statistic title="未明确" value={cohort.unknown_count} />
            </Col>
          </Row>
          <Paragraph style={{ marginTop: 12 }}>{cohort.summary}</Paragraph>
          <Text type="secondary">{cohort.target_distribution_note}</Text>
        </div>
      ) : null}

      <Button type="link" disabled={loading} style={{ marginTop: 12 }} onClick={() => { setRows([]); setCohort(null); }}>
        清空结果
      </Button>
      <Table
        style={{ marginTop: 16 }}
        size="small"
        rowKey={(r) => r.filename}
        dataSource={rows}
        pagination={false}
        columns={[
          { title: "文件", dataIndex: "filename" },
          { title: "状态", dataIndex: "ok", render: (v: boolean) => (v ? <Tag color="green">成功</Tag> : <Tag color="red">失败</Tag>) },
          { title: "说明", dataIndex: "detail" },
        ]}
      />
    </>
  );
}

export default function ModuleIngestion() {
  return (
    <div>
      <Typography.Title level={4} className="glass-page-title">
        病历输入
      </Typography.Title>
      <Paragraph type="secondary">
        工作台第 1 步：录入临床数据与病历信息、批量上传 DICOM 并入库；可在「模型训练」标签导出数据并训练病理分级模型。
      </Paragraph>
      <Alert
        type="info"
        showIcon
        closable
        message="训练数据来自已入库病例"
        description="上传时请打开「解析后直接入库」。训练前需先导出 CSV，再点击「开始训练」。"
        style={{ marginBottom: 16 }}
      />

      <Tabs
        items={[
          { key: "upload", label: "数据上传", children: <IngestionUploadPanel /> },
          { key: "training", label: "模型训练", children: <IngestionTrainingPanel /> },
        ]}
      />

      <Paragraph style={{ marginTop: 24 }}>
        下一步 →{" "}
        <Link to="/pathology" className="glass-link">
          诊断结果
        </Link>
      </Paragraph>
    </div>
  );
}
