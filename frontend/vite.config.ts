import react from "@vitejs/plugin-react";
import http from "node:http";
import { defineConfig, loadEnv } from "vite";

/**
 * 强制走 IPv4，避免 Node 将 localhost 解析到 ::1 而后端只监听 127.0.0.1 时出现连接超时。
 * 可在 frontend/.env.development 中设置 VITE_PROXY_TARGET 覆盖目标（例如远程调试机）。
 */
function createProxyTarget(mode: string) {
  const env = loadEnv(mode, process.cwd(), "");
  const target = env.VITE_PROXY_TARGET || "http://127.0.0.1:8000";
  const agent = new http.Agent({ family: 4 });
  // 影像诊断 + PCI 合并接口，501 层约 8–12 分钟
  const longTimeout = 900_000;
  return {
    target,
    changeOrigin: true,
    agent,
    timeout: longTimeout,
    proxyTimeout: longTimeout,
  };
}

export default defineConfig(({ mode }) => {
  const proxyOpts = createProxyTarget(mode);
  return {
    plugins: [react()],
    server: {
      host: "127.0.0.1",
      port: 5173,
      proxy: {
        "/api": proxyOpts,
        "/health": proxyOpts,
        "/schema": proxyOpts,
      },
    },
  };
});
