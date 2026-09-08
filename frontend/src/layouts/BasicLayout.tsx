import { ArrowLeftOutlined } from "@ant-design/icons";
import { Alert, Button, Layout } from "antd";
import { useCallback, useEffect, useState } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";

const { Header, Content } = Layout;

export default function BasicLayout() {
  const nav = useNavigate();
  const loc = useLocation();
  const showBack = loc.pathname !== "/";
  const [backendOk, setBackendOk] = useState<boolean | null>(null);

  const checkBackend = useCallback(async () => {
    setBackendOk(null);
    const ctrl = new AbortController();
    const t = window.setTimeout(() => ctrl.abort(), 15000);
    try {
      const r = await fetch("/health", { signal: ctrl.signal, cache: "no-store" });
      setBackendOk(r.ok);
    } catch {
      setBackendOk(false);
    } finally {
      window.clearTimeout(t);
    }
  }, []);

  useEffect(() => {
    void checkBackend();
  }, [checkBackend]);

  return (
    <Layout style={{ minHeight: "100vh", background: "transparent" }}>
      <Header className="glass-header" style={{ padding: "0 28px", height: 64, lineHeight: "64px" }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            width: "100%",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
            {showBack ? (
              <Button type="text" icon={<ArrowLeftOutlined />} onClick={() => nav("/")} style={{ color: "#1a6a8a" }}>
                返回工作台
              </Button>
            ) : null}
            <span style={{ fontSize: 18, fontWeight: 600, color: "#0f3d52", letterSpacing: 0.5 }}>
              PMP Agent
            </span>
            <span style={{ color: "rgba(22, 74, 99, 0.72)", fontSize: 13 }}>
              诊断智能体 · 病历 → 诊断 → 治疗 → 队列 → 知识积累
            </span>
          </div>
          <span style={{ color: "rgba(22, 74, 99, 0.55)", fontSize: 12 }}>演示原型 · 院内侧结构化字段</span>
        </div>
      </Header>
      <Content style={{ margin: 20, paddingBottom: 32 }}>
        {backendOk === false ? (
          <Alert
            type="error"
            showIcon
            closable
            message="未连接到后端 API（经 Vite 代理到 127.0.0.1:8000）"
            description={
              <span>
                请在本机另开终端进入 <code>backend</code> 目录，激活虚拟环境后启动（二选一）：
                <br />
                <code style={{ display: "block", marginTop: 8 }}>
                  uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
                </code>
                若仍超时，可改为监听所有网卡后再试：
                <br />
                <code style={{ display: "block", marginTop: 8 }}>
                  uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
                </code>
                终端里执行 <code>curl -sS http://127.0.0.1:8000/health</code> 应返回{" "}
                <code>{`{"status":"ok"}`}</code>。修改过依赖或 <code>vite.config.ts</code> 后请<strong>重启</strong>{" "}
                <code>npm run dev</code>。仍失败可在 <code>frontend/.env.development</code> 中设置{" "}
                <code>VITE_PROXY_TARGET=http://127.0.0.1:8000</code>（或你的实际后端地址）后再次重启前端。
              </span>
            }
            action={
              <Button size="small" type="primary" onClick={() => void checkBackend()}>
                重试检测
              </Button>
            }
            style={{ marginBottom: 16 }}
          />
        ) : null}
        <div
          className={`glass-panel glass-panel--large-radius ${loc.pathname === "/" ? "glass-panel--home" : ""}`}
          style={{
            padding: loc.pathname === "/" ? 20 : 24,
            minHeight: 520,
          }}
        >
          <Outlet />
        </div>
      </Content>
    </Layout>
  );
}
