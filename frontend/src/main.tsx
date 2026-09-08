import { App as AntApp, ConfigProvider, theme } from "antd";
import zhCN from "antd/locale/zh_CN";
import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import "./styles/platform-theme.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ConfigProvider
      locale={zhCN}
      theme={{
        algorithm: theme.defaultAlgorithm,
        token: {
          colorPrimary: "#1677ff",
          borderRadius: 8,
          borderRadiusLG: 12,
          colorBgContainer: "#ffffff",
          colorBgElevated: "#ffffff",
          colorBorder: "#e8edf5",
          colorText: "#1f2937",
          colorTextSecondary: "#6b7280",
          colorSplit: "#e8edf5",
          fontFamily:
            '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "PingFang SC", "Microsoft YaHei", sans-serif',
        },
        components: {
          Layout: {
            bodyBg: "#eef2f8",
            headerBg: "#ffffff",
            siderBg: "#0b1f4a",
          },
          Menu: {
            darkItemBg: "transparent",
            darkItemSelectedBg: "rgba(22, 119, 255, 0.22)",
          },
        },
      }}
    >
      <AntApp>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </AntApp>
    </ConfigProvider>
  </React.StrictMode>
);
