import { App, Button, Col, Input, Row, Typography } from "antd";
import { useEffect, useState } from "react";
import type { Disease } from "../api/client";
import { classifyDisease, cohortSummary, listDiseases } from "../api/client";
import { demoRecord } from "../data/demoRecord";
import { rememberDiseaseFromRecord } from "../lib/lastDisease";

export default function ModuleDisease() {
  const { message } = App.useApp();
  const [jsonText, setJsonText] = useState(JSON.stringify(demoRecord, null, 2));
  const [diseases, setDiseases] = useState<Disease[]>([]);
  const [summary, setSummary] = useState<Record<string, unknown> | null>(null);

  useEffect(() => {
    listDiseases()
      .then(setDiseases)
      .catch(() => setDiseases([]));
  }, []);

  async function onClassify(persist: boolean) {
    try {
      const rec = JSON.parse(jsonText);
      const res = await classifyDisease(rec, persist);
      setJsonText(JSON.stringify(res.record, null, 2));
      rememberDiseaseFromRecord(res.record);
      message.success(persist ? "已分型并写入数据库" : "已分型（未入库）");
    } catch (e) {
      message.error(e instanceof Error ? e.message : "分型失败");
    }
  }

  async function onSummary(code: string) {
    try {
      const s = await cohortSummary({ disease_code: code, limit: 500 });
      setSummary(s);
    } catch {
      message.error("队列摘要失败");
    }
  }

  return (
    <div>
      <Typography.Title level={4} className="glass-page-title">
        分病种
      </Typography.Title>
      <Typography.Paragraph type="secondary">
        工作台第 3 步：依据临床诊断、科室与病史规则映射病种编码（如 FUO、RHEUM_IMMU），提取 PET 代谢表型标签，并可从报告文本解析
        SUV/MTV/TLG。定型结果会供「成果转化」模块读取为最近病种。
      </Typography.Paragraph>
      <Row gutter={16}>
        <Col span={8}>
          <Typography.Text strong>内置病种库</Typography.Text>
          <ul style={{ paddingLeft: 18, marginTop: 8 }}>
            {diseases.map((d) => (
              <li key={d.id}>
                <Button type="link" size="small" onClick={() => onSummary(d.code)} style={{ padding: 0 }}>
                  {d.name}
                </Button>{" "}
                <Typography.Text type="secondary">({d.code})</Typography.Text>
              </li>
            ))}
          </ul>
        </Col>
        <Col span={16}>
          <Button type="primary" onClick={() => onClassify(false)} style={{ marginRight: 8 }}>
            分型（仅预览）
          </Button>
          <Button onClick={() => onClassify(true)}>分型并保存</Button>
          <Button style={{ marginLeft: 8 }} onClick={() => setJsonText(JSON.stringify(demoRecord, null, 2))}>
            载入演示 JSON
          </Button>
          <Input.TextArea
            style={{ marginTop: 12, fontFamily: "monospace", fontSize: 12 }}
            rows={18}
            value={jsonText}
            onChange={(e) => setJsonText(e.target.value)}
          />
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            提示：可直接粘贴编辑 JSON；分型后会写回 primary_disease_code / pet_ct_phenotype_tags 等字段。
          </Typography.Text>
        </Col>
      </Row>
      {summary ? (
        <pre className="glass-codeblock glass-codeblock--warm" style={{ marginTop: 16, padding: 12 }}>
          {JSON.stringify(summary, null, 2)}
        </pre>
      ) : null}
    </div>
  );
}
