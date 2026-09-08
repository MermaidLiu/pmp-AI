import { InboxOutlined } from "@ant-design/icons";
import { App, Button, Col, Form, Input, Row, Upload } from "antd";
import { useState } from "react";
import type { PetCtInterviewRecord } from "../api/client";
import { saveCase, uploadFormImage } from "../api/client";
import { demoRecord as demo } from "../data/demoRecord";

export default function InterviewWorkbench() {
  const { message } = App.useApp();
  const [jsonText, setJsonText] = useState(JSON.stringify(demo, null, 2));

  async function onSave() {
    try {
      const parsed = JSON.parse(jsonText) as PetCtInterviewRecord;
      await saveCase(parsed);
      message.success("已保存到后端（按 exam_id 幂等 upsert）");
    } catch (e) {
      message.error(e instanceof Error ? e.message : "保存失败");
    }
  }

  return (
    <div>
      <Row gutter={[16, 16]}>
        <Col span={24}>
          <Upload.Dragger
            maxCount={1}
            accept="image/*"
            beforeUpload={async (file) => {
              try {
                const data = await uploadFormImage(file);
                setJsonText(JSON.stringify(data, null, 2));
                message.success("已尝试 OCR 解析（无 Tesseract 时可能仅返回空壳，可手工补全）");
              } catch (err) {
                message.error("上传解析失败");
              }
              return false;
            }}
          >
            <p className="ant-upload-drag-icon">
              <InboxOutlined />
            </p>
            <p className="ant-upload-text">上传问诊表单截图（调用 /api/v1/extract_data）</p>
          </Upload.Dragger>
        </Col>
        <Col span={24}>
          <Form layout="vertical" onFinish={onSave}>
            <Form.Item label="结构化 JSON（可编辑）">
              <Input.TextArea rows={18} value={jsonText} onChange={(e) => setJsonText(e.target.value)} />
            </Form.Item>
            <Button type="primary" htmlType="submit">
              校验并保存
            </Button>
            <Button
              style={{ marginLeft: 8 }}
              onClick={() => setJsonText(JSON.stringify(demo, null, 2))}
            >
              载入示例
            </Button>
          </Form>
        </Col>
      </Row>
    </div>
  );
}
