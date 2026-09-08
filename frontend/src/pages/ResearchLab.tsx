import { App, Button, Form, Input, Typography } from "antd";
import { useState } from "react";
import type { PetCtInterviewRecord } from "../api/client";
import { runResearch } from "../api/client";

const { Paragraph } = Typography;

const defaultRecord: PetCtInterviewRecord = {
  patient_base_info: {
    name: "罗红兰",
    gender: "女",
    age: 59,
    phone: "15969793688",
    source: "住院",
    exam_id: "PET260320003",
    medical_record_id: "1138428444",
    admission_id: "ZY010000381810",
    outpatient_id: "",
    department: "风湿免疫科住院",
    doctor_phone: "",
    exam_item: "18F-FDG PET/CT全身显像",
    height_cm: 154,
    weight_kg: 48.5,
    interview_doctor: "刘佳宁",
    interview_time: "2026-03-20T08:13:20",
    patient_type: ["VIP"],
    is_free_report: false,
  },
  interview_info: {
    clinical_diagnosis: "发热待查",
    brief_medical_history: "发热待查相关病史摘要",
  },
  supplementary_interview_info: {},
};

export default function ResearchLab() {
  const { message } = App.useApp();
  const [topic, setTopic] = useState("发热待查患者 PET-CT 代谢特征与风湿免疫病的相关性研究");
  const [jsonText, setJsonText] = useState(JSON.stringify(defaultRecord, null, 2));
  const [output, setOutput] = useState("");

  async function onRun() {
    try {
      const record = JSON.parse(jsonText) as PetCtInterviewRecord;
      const res = await runResearch({ ...record, research_topic: topic });
      setOutput(res.output);
      message.success("智能体执行完成");
    } catch (e) {
      message.error(e instanceof Error ? e.message : "执行失败");
    }
  }

  return (
    <div>
      <Form layout="vertical">
        <Form.Item label="研究主题">
          <Input value={topic} onChange={(e) => setTopic(e.target.value)} />
        </Form.Item>
        <Form.Item label="患者与问诊 JSON">
          <Input.TextArea rows={12} value={jsonText} onChange={(e) => setJsonText(e.target.value)} />
        </Form.Item>
        <Button type="primary" onClick={onRun}>
          运行科研智能体
        </Button>
      </Form>
      <Paragraph style={{ marginTop: 24 }}>输出</Paragraph>
      <Input.TextArea rows={16} value={output} readOnly />
    </div>
  );
}
