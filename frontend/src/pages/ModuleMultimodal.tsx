import { App, Button, Progress, Typography } from "antd";
import axios from "axios";
import { useMemo, useState } from "react";
import { fuseMultimodal } from "../api/client";
import { demoRecord } from "../data/demoRecord";

export default function ModuleMultimodal() {
  const { message } = App.useApp();
  const [payload, setPayload] = useState<Record<string, unknown> | null>(null);

  const bars = useMemo(() => {
    const chart = (payload?.chart as Record<string, unknown> | undefined)?.lesion_suv_bars as
      | Array<{ region: string; suv_max: number }>
      | undefined;
    const list = chart || [];
    const max = Math.max(...list.map((x) => x.suv_max || 0), 1);
    return list.map((x) => ({ name: x.region || "病灶", pct: Math.round(((x.suv_max || 0) / max) * 100), suv: x.suv_max }));
  }, [payload]);

  async function run() {
    try {
      const data = await fuseMultimodal(demoRecord);
      setPayload(data);
      message.success("多模态融合完成");
    } catch (e: unknown) {
      let detail =
        "请用「npm run dev」从 http://127.0.0.1:5173 打开页面（走 Vite 代理到 8000），不要只打开静态文件；并确认后端 uvicorn 已启动。";
      if (axios.isAxiosError(e)) {
        const d = e.response?.data;
        if (d && typeof d === "object" && "detail" in d) {
          const raw = (d as { detail: unknown }).detail;
          detail = typeof raw === "string" ? raw : JSON.stringify(raw);
        } else if (e.code === "ERR_NETWORK") {
          detail = "无法连接后端：未启动 8000 或未通过 5173 代理。";
        } else if (e.response?.status) {
          detail = `HTTP ${e.response.status}`;
        }
      }
      message.error(`融合接口失败：${detail}`);
    }
  }

  return (
    <div>
      <Typography.Title level={4} style={{ color: "#0b3d5c" }} className="glass-page-title">
        多模态
      </Typography.Title>
      <Typography.Paragraph type="secondary">
        工作台第 2 步：将 SUV/MTV/TLG、病灶列表、肌酐尿素氮、甲状腺与发热待查画像合并为结构化摘要；下图以 SUVmax 相对比例示意。
      </Typography.Paragraph>
      <Button type="primary" onClick={run}>
        使用演示病例融合
      </Button>
      {payload ? (
        <div style={{ marginTop: 20 }}>
          <Typography.Title level={5}>病灶 SUVmax（相对条形）</Typography.Title>
          {bars.map((b) => (
            <div key={b.name} style={{ marginBottom: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                <span>{b.name}</span>
                <span style={{ color: "#1a8a9e" }}>SUVmax {b.suv ?? "—"}</span>
              </div>
              <Progress percent={b.pct} strokeColor={{ from: "#2a7aa8", to: "#4eb8e8" }} showInfo={false} />
            </div>
          ))}
          <Typography.Title level={5} style={{ marginTop: 24 }}>
            融合摘要
          </Typography.Title>
          <Typography.Paragraph>{String(payload.fusion_summary)}</Typography.Paragraph>
          <pre className="glass-codeblock" style={{ padding: 12, fontSize: 12, maxHeight: 280, overflow: "auto" }}>
            {JSON.stringify(payload, null, 2)}
          </pre>
        </div>
      ) : null}
    </div>
  );
}
