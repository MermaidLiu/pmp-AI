import { ExperimentOutlined, FileImageOutlined, LeftOutlined, PlusOutlined, RightOutlined } from "@ant-design/icons";
import { App, Button, Col, DatePicker, Form, Input, InputNumber, Row, Select, Space, Tag, Typography, Upload } from "antd";
import type { UploadFile } from "antd/es/upload/interface";
import { useCallback, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { MOCK_PATIENTS, WORKFLOW_STEPS } from "../../data/platformMock";
import {
  getPendingCaseFileNames,
  hasPendingImagingFiles,
  setPendingCaseFiles,
  toNativeFiles,
} from "../../lib/platformCaseUpload";
import { getWorkflowCase, saveClinicalFields } from "../../lib/workflowCase";
import { mapWorkflowRecordToTemplateRow, saveWorkflowClinicalBridgeEntry } from "../../lib/clinicalDataset/template";
import PlatformDiagnosisPage from "./PlatformDiagnosisPage";

const { Title, Paragraph, Text } = Typography;

const ACCEPT = ".dcm,.dicom,.zip,.pdf,.doc,.docx,.json";

function stepIndexFromQuery(step: string | null): number | null {
  if (!step) return null;
  if (step === "input" || step === "0") return 0;
  if (step === "diagnosis" || step === "1" || step === "analysis") return 1;
  if (step === "database" || step === "2") return 2;
  if (step === "research" || step === "3") return 3;
  const n = Number(step);
  if (Number.isFinite(n) && n >= 0 && n < WORKFLOW_STEPS.length) return n;
  return null;
}

export default function PlatformWorkflowPage() {
  const { message } = App.useApp();
  const [searchParams, setSearchParams] = useSearchParams();
  const [stepIndex, setStepIndex] = useState(() => stepIndexFromQuery(searchParams.get("step")) ?? 0);
  const [uploadFiles, setUploadFiles] = useState<UploadFile[]>([]);
  const [clinicalForm] = Form.useForm();
  const patient = MOCK_PATIENTS[0];

  useEffect(() => {
    const wf = getWorkflowCase();
    const lab = wf.research_extensions?.lab_snapshot || {};
    clinicalForm.setFieldsValue({
      patientName: wf.patient_base_info.name,
      age: wf.patient_base_info.age || undefined,
      gender: wf.patient_base_info.gender || undefined,
      department: wf.patient_base_info.department,
      medicalRecordId: wf.patient_base_info.medical_record_id,
      examType: "腹盆 CT",
      clinicalDiagnosis: wf.interview_info.clinical_diagnosis,
      briefMedicalHistory: wf.interview_info.brief_medical_history,
      tnmStage: lab["TNM分期"] || "",
      cea: lab.CEA || "",
      ca125: lab.CA125 || "",
      ca19_9: lab["CA19-9"] || lab.CA199 || "",
      rbc: lab.RBC || lab.rbc || "",
      treatmentMethod: lab["治疗方式"] || "",
      surgeryNumber: lab["第几次手术"] || "",
      ivChemotherapy: lab["是否静脉化疗"] || "",
      ccScore: lab["CC评分"] || "",
    });
  }, [clinicalForm]);

  const activeStep = WORKFLOW_STEPS[stepIndex];
  const isFirst = stepIndex === 0;
  const isLast = stepIndex === WORKFLOW_STEPS.length - 1;

  const goToStep = useCallback(
    (index: number) => {
      const next = Math.max(0, Math.min(WORKFLOW_STEPS.length - 1, index));
      setStepIndex(next);
      const key = WORKFLOW_STEPS[next]?.key || "input";
      setSearchParams(key === "input" ? {} : { step: key }, { replace: true });
      window.scrollTo({ top: 0, behavior: "smooth" });
    },
    [setSearchParams],
  );

  useEffect(() => {
    const fromQuery = stepIndexFromQuery(searchParams.get("step"));
    if (fromQuery != null && fromQuery !== stepIndex) {
      setStepIndex(fromQuery);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  function syncPendingFiles() {
    const files = toNativeFiles(uploadFiles);
    setPendingCaseFiles(files);
    return files;
  }

  useEffect(() => {
    setPendingCaseFiles(uploadFiles);
  }, [uploadFiles]);

  function persistClinicalFields() {
    const v = clinicalForm.getFieldsValue();
    saveClinicalFields({
      patientName: v.patientName,
      age: v.age,
      gender: v.gender,
      department: v.department,
      medicalRecordId: v.medicalRecordId,
      clinicalDiagnosis: v.clinicalDiagnosis,
      briefMedicalHistory: v.briefMedicalHistory,
      tnmStage: v.tnmStage,
      treatmentMethod: v.treatmentMethod,
      surgeryNumber: v.surgeryNumber,
      ivChemotherapy: v.ivChemotherapy,
      ccScore: v.ccScore,
      labSnapshot: {
        CEA: v.cea,
        CA125: v.ca125,
        "CA19-9": v.ca19_9,
        RBC: v.rbc,
      },
    });
    const rec = getWorkflowCase();
    const tpl = mapWorkflowRecordToTemplateRow(rec);
    const id = tpl.患者ID || rec.patient_base_info.exam_id;
    if (id) saveWorkflowClinicalBridgeEntry(id, tpl);
  }

  /** 工作台主路径：保存临床 → 缓存影像 → 切到「② 智能分析」并自动调 CT 接口 */
  function goToAnalysis() {
    persistClinicalFields();
    const files = syncPendingFiles();
    if (!files.length) {
      message.warning("请先上传本例 DICOM、ZIP 或预勾画 NIfTI");
      return;
    }
    if (!hasPendingImagingFiles()) {
      message.warning("请上传 DICOM / ZIP / .nii.gz 影像文件");
      return;
    }
    message.success(`已加载 ${files.length} 个文件，正在进入智能分析（CT 分割 + PCI）…`);
    goToStep(1);
  }

  return (
    <div className="pmp-workflow-page">
      <div className="pmp-step-bar pmp-step-bar--sticky">
        {WORKFLOW_STEPS.map((s, i) => (
          <div
            key={s.key}
            className={`pmp-step-item${stepIndex === i ? " pmp-step-item--active" : ""}${i < stepIndex ? " pmp-step-item--done" : ""}`}
            onClick={() => goToStep(i)}
            onKeyDown={(e) => e.key === "Enter" && goToStep(i)}
            role="button"
            tabIndex={0}
          >
            {s.label}
          </div>
        ))}
      </div>

      <div className="pmp-workflow-body">
        {activeStep.key === "input" ? (
          <section className="pmp-section pmp-imaging-intake">
            <div className="pmp-imaging-intake-head">
              <Title level={4} style={{ margin: 0 }}>
                <span className="pmp-section-num">1</span>
                影像输入与患者信息
              </Title>
              <Text type="secondary" style={{ fontSize: 12 }}>
                填写临床资料并上传本例 DICOM / ZIP，进入智能分析后由 CT 接口返回分割与 PCI 评分
              </Text>
            </div>

            <div className="pmp-card pmp-imaging-intake-card">
              <Row gutter={[24, 24]}>
                <Col xs={24} lg={14}>
                  <div className="pmp-panel-title">患者与临床信息</div>
                  <Form form={clinicalForm} layout="vertical" size="middle" onValuesChange={() => persistClinicalFields()}>
                    <Row gutter={12}>
                      <Col xs={24} sm={12}>
                        <Form.Item name="medicalRecordId" label="患者 ID / 病历号">
                          <Input placeholder="院内 ID" />
                        </Form.Item>
                      </Col>
                      <Col xs={24} sm={12}>
                        <Form.Item name="patientName" label="姓名">
                          <Input placeholder="患者姓名" />
                        </Form.Item>
                      </Col>
                      <Col xs={12} sm={6}>
                        <Form.Item name="age" label="年龄">
                          <InputNumber min={0} max={120} style={{ width: "100%" }} />
                        </Form.Item>
                      </Col>
                      <Col xs={12} sm={6}>
                        <Form.Item name="gender" label="性别">
                          <Select allowClear options={[{ value: "男" }, { value: "女" }]} />
                        </Form.Item>
                      </Col>
                      <Col xs={12} sm={6}>
                        <Form.Item name="examDate" label="检查日期">
                          <DatePicker style={{ width: "100%" }} placeholder="选择日期" />
                        </Form.Item>
                      </Col>
                      <Col xs={12} sm={6}>
                        <Form.Item name="examType" label="检查类型">
                          <Select
                            allowClear
                            options={[
                              { value: "腹盆 CT" },
                              { value: "胸部 CT" },
                              { value: "PET-CT" },
                              { value: "MRI" },
                            ]}
                          />
                        </Form.Item>
                      </Col>
                      <Col xs={24} sm={12}>
                        <Form.Item name="department" label="科室">
                          <Input placeholder="如 妇科肿瘤科" />
                        </Form.Item>
                      </Col>
                      <Col xs={24}>
                        <Form.Item name="clinicalDiagnosis" label="临床诊断" rules={[{ required: true, message: "请填写临床诊断" }]}>
                          <Input placeholder="如 腹膜假粘液瘤（PMP）" />
                        </Form.Item>
                      </Col>
                      <Col xs={24}>
                        <Form.Item name="briefMedicalHistory" label="病史摘要">
                          <Input.TextArea rows={2} placeholder="主诉、既往史、手术史等" />
                        </Form.Item>
                      </Col>
                      <Col xs={24} sm={8}>
                        <Form.Item name="tnmStage" label="TNM 分期">
                          <Input placeholder="cT2N1M0" />
                        </Form.Item>
                      </Col>
                      <Col xs={8} sm={5}>
                        <Form.Item name="cea" label="CEA">
                          <Input placeholder="ng/mL" />
                        </Form.Item>
                      </Col>
                      <Col xs={8} sm={5}>
                        <Form.Item name="ca125" label="CA125">
                          <Input placeholder="U/mL" />
                        </Form.Item>
                      </Col>
                      <Col xs={8} sm={6}>
                        <Form.Item name="ca19_9" label="CA19-9">
                          <Input placeholder="U/mL" />
                        </Form.Item>
                      </Col>
                      <Col xs={8} sm={6}>
                        <Form.Item name="rbc" label="RBC">
                          <Input placeholder="×10¹²/L" />
                        </Form.Item>
                      </Col>
                      <Col xs={24} sm={8}>
                        <Form.Item name="treatmentMethod" label="治疗方式">
                          <Select
                            allowClear
                            options={[
                              { value: "CRS+HIPEC" },
                              { value: "单纯CRS" },
                              { value: "新辅助化疗+手术" },
                              { value: "姑息化疗" },
                              { value: "观察随访" },
                            ]}
                          />
                        </Form.Item>
                      </Col>
                      <Col xs={12} sm={4}>
                        <Form.Item name="surgeryNumber" label="第几次手术">
                          <Select allowClear options={[{ value: "第1次" }, { value: "第2次" }, { value: "第3次" }]} />
                        </Form.Item>
                      </Col>
                      <Col xs={12} sm={4}>
                        <Form.Item name="ivChemotherapy" label="静脉化疗">
                          <Select allowClear options={[{ value: "是" }, { value: "否" }]} />
                        </Form.Item>
                      </Col>
                      <Col xs={12} sm={4}>
                        <Form.Item name="ccScore" label="CC 评分">
                          <Select
                            allowClear
                            options={[
                              { value: "CC-0", label: "CC-0（无肉眼残留）" },
                              { value: "CC-1", label: "CC-1（残留 < 2.5 mm）" },
                              { value: "CC-2", label: "CC-2（残留 2.5 mm–2.5 cm）" },
                              { value: "CC-3", label: "CC-3（残留 > 2.5 cm 或融合）" },
                            ]}
                          />
                        </Form.Item>
                      </Col>
                    </Row>
                  </Form>
                </Col>

                <Col xs={24} lg={10}>
                  <div className="pmp-panel-title">影像文件</div>
                  <div className="pmp-imaging-files-row">
                    {uploadFiles.map((f) => (
                      <div key={f.uid} className="pmp-imaging-file-thumb" title={f.name}>
                        <FileImageOutlined style={{ fontSize: 22, color: "#1677ff" }} />
                        <span className="pmp-imaging-file-thumb-name">{f.name}</span>
                        <Tag color="blue" style={{ margin: 0, fontSize: 10 }}>
                          {/\.zip$/i.test(f.name) ? "ZIP" : "DICOM"}
                        </Tag>
                      </div>
                    ))}
                    <Upload
                      multiple
                      accept={ACCEPT}
                      showUploadList={false}
                      beforeUpload={() => false}
                      onChange={({ fileList }) => setUploadFiles(fileList)}
                    >
                      <button type="button" className="pmp-imaging-file-add">
                        <PlusOutlined />
                        <span>上传影像</span>
                      </button>
                    </Upload>
                  </div>
                  <Paragraph type="secondary" style={{ fontSize: 12, marginTop: 12 }}>
                    支持 .dcm / .dicom / .zip。单例 DICOM 进入智能分析后调用 CT 合并接口（分割 + PCI）。
                  </Paragraph>
                  <Paragraph type="secondary" style={{ fontSize: 12 }}>
                    批量预勾画 ROI + 临床 Excel 请前往 <Link to="/db/follow-up">随访队列</Link> 或{" "}
                    <Link to="/knowledge">科研延伸</Link> 导入。
                  </Paragraph>
                  {getPendingCaseFileNames().length > 0 ? (
                    <AlertLike text={`已缓存 ${getPendingCaseFileNames().length} 个文件，可直接开始智能分析`} />
                  ) : null}
                  <Button
                    type="primary"
                    size="large"
                    block
                    className="pmp-imaging-start-btn"
                    icon={<ExperimentOutlined />}
                    onClick={goToAnalysis}
                  >
                    开始智能分析
                  </Button>
                  <Paragraph type="secondary" style={{ fontSize: 12, marginTop: 8, marginBottom: 0 }}>
                    将跳转到上方「② 智能分析」，调用 CT 接口返回分割图与 PCI 评分（不走大模型）。
                  </Paragraph>
                </Col>
              </Row>
            </div>
          </section>
        ) : null}

        {activeStep.key === "diagnosis" ? <PlatformDiagnosisPage embedded /> : null}

        {activeStep.key === "database" ? (
          <section className="pmp-section">
            <Title level={4}>
              <span className="pmp-section-num">3</span>
              加入数据库
            </Title>
            <Paragraph type="secondary" style={{ marginBottom: 16 }}>
              分析完成并入队后，可在患者数据库（Excel 式总表，含临床/病理/影像）与随访队列查看；最新公开临床指标可在智能对话中通过 ReachAPI 大模型检索。
            </Paragraph>
            <Space wrap style={{ marginBottom: 16 }}>
              <Link to="/db/follow-up">
                <Button>随访队列</Button>
              </Link>
              <Link to="/db/patients">
                <Button>患者数据库</Button>
              </Link>
            </Space>
            <Row gutter={16}>
              <Col xs={24} md={8}>
                <div className="pmp-card" style={{ padding: 16 }}>
                  <div className="pmp-panel-title">患者摘要</div>
                  <Paragraph>
                    {patient.name} · {patient.gender} · {patient.age}岁
                    <br />
                    {patient.diagnosis} · {patient.stage}
                  </Paragraph>
                  <Tag color="green">随访中</Tag>
                </div>
              </Col>
              <Col xs={24} md={16}>
                <div className="pmp-card" style={{ padding: 16 }}>
                  <Link to="/db/patients">
                    <Button type="primary">进入患者数据库</Button>
                  </Link>
                </div>
              </Col>
            </Row>
          </section>
        ) : null}

        {activeStep.key === "research" ? (
          <section className="pmp-section" style={{ background: "#f8fafc", borderRadius: 12 }}>
            <Title level={4}>
              <span className="pmp-section-num">4</span>
              科研延伸
            </Title>
            <Link to="/knowledge">
              <Button type="primary">进入科研延伸</Button>
            </Link>
          </section>
        ) : null}
      </div>

      <div className="pmp-workflow-footer">
        <Space>
          <Button icon={<LeftOutlined />} disabled={isFirst} onClick={() => goToStep(stepIndex - 1)}>
            上一步
          </Button>
          <Text type="secondary" style={{ fontSize: 13 }}>
            {stepIndex + 1} / {WORKFLOW_STEPS.length} · {activeStep.label.replace(/^[①-⑨\d+\s]+/, "")}
          </Text>
          {!isLast ? (
            <Button type="primary" icon={<RightOutlined />} iconPosition="end" onClick={() => goToStep(stepIndex + 1)}>
              下一步
            </Button>
          ) : (
            <Link to="/knowledge">
              <Button type="primary">完成 · 进入科研延伸</Button>
            </Link>
          )}
        </Space>
      </div>
    </div>
  );
}

function AlertLike({ text }: { text: string }) {
  return (
    <div style={{ marginTop: 12, padding: "8px 12px", background: "#e6f4ff", borderRadius: 8, fontSize: 12, color: "#1677ff" }}>
      {text}
    </div>
  );
}
