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
          colorPrimary: "#4285F4",
          colorLink: "#4285F4",
          colorLinkHover: "#3367D6",
          borderRadius: 10,
          borderRadiusLG: 14,
          colorBgContainer: "#ffffff",
          colorBgElevated: "#ffffff",
          colorBgLayout: "#ffffff",
          colorBorder: "#e8ecf1",
          colorText: "#1a1a2e",
          colorTextSecondary: "#64748b",
          colorSplit: "#eef2f6",
          boxShadow: "0 1px 3px rgba(15, 23, 42, 0.06)",
          boxShadowSecondary: "0 4px 14px rgba(66, 133, 244, 0.08)",
          fontFamily:
            '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "PingFang SC", "Microsoft YaHei", sans-serif',
        },
        components: {
          Layout: {
            bodyBg: "#ffffff",
            headerBg: "#ffffff",
            siderBg: "#ffffff",
          },
          Menu: {
            itemBg: "transparent",
            itemColor: "#475569",
            itemHoverBg: "#f0f6ff",
            itemHoverColor: "#4285F4",
            itemSelectedBg: "#e8f1fe",
            itemSelectedColor: "#4285F4",
            activeBarBorderWidth: 0,
            iconSize: 16,
            itemBorderRadius: 8,
          },
          Button: {
            primaryShadow: "0 2px 6px rgba(66, 133, 244, 0.28)",
            defaultBorderColor: "#e2e8f0",
            defaultColor: "#334155",
          },
          Card: {
            colorBorderSecondary: "#eef2f6",
          },
          Input: {
            activeBorderColor: "#4285F4",
            hoverBorderColor: "#93b4f5",
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
