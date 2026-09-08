import { App, Button, Input, Typography } from "antd";
import { useState } from "react";
import { analyzePetCt } from "../api/client";

const { Paragraph } = Typography;

export default function ImagingLab() {
  const { message } = App.useApp();
  const [payload, setPayload] = useState("{}");
  const [result, setResult] = useState("");

  async function onAnalyze() {
    try {
      const obj = JSON.parse(payload) as Record<string, unknown>;
      const data = await analyzePetCt(obj);
      setResult(JSON.stringify(data, null, 2));
      message.success("分析完成");
    } catch (e) {
      message.error(e instanceof Error ? e.message : "请求失败");
    }
  }

  return (
    <div>
      <Paragraph>
        请求体示例：空对象 <code>{"{}"}</code> 将返回占位指标；或提供{" "}
        <code>pet</code> / <code>ct</code> 三维数组与 <code>voxel_volume_ml</code>。
      </Paragraph>
      <Input.TextArea rows={8} value={payload} onChange={(e) => setPayload(e.target.value)} />
      <Button type="primary" style={{ marginTop: 12 }} onClick={onAnalyze}>
        调用 /api/v1/petct/analyze
      </Button>
      <Paragraph style={{ marginTop: 24 }}>响应</Paragraph>
      <Input.TextArea rows={14} value={result} readOnly />
    </div>
  );
}
