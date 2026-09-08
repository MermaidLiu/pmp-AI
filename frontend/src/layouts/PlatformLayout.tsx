import {
  ApartmentOutlined,
  BarChartOutlined,
  CrownOutlined,
  DatabaseOutlined,
  HomeOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  MessageOutlined,
  RobotOutlined,
  SettingOutlined,
  TeamOutlined,
  UserOutlined,
} from "@ant-design/icons";
import { Badge, Button, Input, Layout, Menu, Space, Tag, Typography, Alert } from "antd";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { authGetQuota } from "../api/auth";
import {
  AUTH_CHANGED_EVENT,
  clearAuthSession,
  emitAuthChanged,
  getAuthToken,
  loadCachedUser,
  type AuthUser,
} from "../lib/authSession";
import {
  getPathologyJobState,
  isPathologyJobRunning,
  subscribePathologyJob,
  type PathologyJobState,
} from "../lib/pathologyAnalysisJob";

const { Sider, Header, Content } = Layout;

type MenuItem = {
  key: string;
  icon?: React.ReactNode;
  label: string;
  path?: string;
  children?: MenuItem[];
};

/** 流程：首页 → 工作台（含智能分析 TAB）→ 智能对话 → 数据库 → 科研延伸 */
const MENU: MenuItem[] = [
  { key: "/", icon: <HomeOutlined />, label: "首页", path: "/" },
  { key: "/workflow", icon: <ApartmentOutlined />, label: "工作台", path: "/workflow" },
  { key: "/assisted-diagnosis", icon: <RobotOutlined />, label: "AI 辅助诊断", path: "/assisted-diagnosis" },
  { key: "/chat", icon: <MessageOutlined />, label: "智能对话", path: "/chat" },
  {
    key: "db",
    icon: <DatabaseOutlined />,
    label: "数据库",
    children: [
      { key: "/db/patients", label: "患者数据库", path: "/db/patients" },
      { key: "/db/follow-up", label: "随访队列", path: "/db/follow-up" },
    ],
  },
  {
    key: "/knowledge",
    icon: <BarChartOutlined />,
    label: "科研延伸",
    path: "/knowledge",
  },
  { key: "/settings", icon: <SettingOutlined />, label: "系统设置", path: "/settings" },
];

function flattenPaths(items: MenuItem[]): string[] {
  return items.flatMap((it) => [it.path, ...(it.children ? flattenPaths(it.children) : [])].filter(Boolean) as string[]);
}

function selectedKey(pathname: string): string {
  const paths = flattenPaths(MENU).sort((a, b) => b.length - a.length);
  const hit = paths.find((p) => p === pathname || (p !== "/" && pathname.startsWith(p)));
  if (pathname.startsWith("/research")) return "/knowledge";
  if (pathname.startsWith("/knowledge")) return "/knowledge";
  if (pathname.startsWith("/analysis")) return "/workflow";
  return hit || (pathname === "/" ? "/" : "/workflow");
}

function openKeysFor(pathname: string): string[] {
  if (pathname.startsWith("/db")) return ["db"];
  return [];
}

export default function PlatformLayout() {
  const nav = useNavigate();
  const loc = useLocation();
  const [collapsed, setCollapsed] = useState(false);
  const [pathologyJob, setPathologyJob] = useState<PathologyJobState>(() => getPathologyJobState());
  const [quota, setQuota] = useState<AuthUser | null>(() => loadCachedUser());

  const refreshQuota = useCallback(() => {
    void authGetQuota()
      .then((q) => setQuota(q))
      .catch(() => setQuota(loadCachedUser()));
  }, []);

  useEffect(() => subscribePathologyJob(setPathologyJob), []);
  useEffect(() => {
    refreshQuota();
    const onAuth = () => refreshQuota();
    window.addEventListener(AUTH_CHANGED_EVENT, onAuth);
    window.addEventListener("pmp-quota-exceeded", onAuth);
    return () => {
      window.removeEventListener(AUTH_CHANGED_EVENT, onAuth);
      window.removeEventListener("pmp-quota-exceeded", onAuth);
    };
  }, [refreshQuota]);

  const jobRunning = isPathologyJobRunning() || pathologyJob.phase === "running";
  const jobDoneAway =
    pathologyJob.phase === "done" &&
    !loc.pathname.startsWith("/workflow") &&
    Boolean(pathologyJob.finishedAt);

  const menuItems = useMemo(
    () =>
      MENU.map((item) => ({
        key: item.path || item.key,
        icon: item.icon,
        label: item.label,
        children: item.children?.map((c) => ({
          key: c.path!,
          label: c.label,
        })),
      })),
    [],
  );

  const pageTitle = useMemo(() => {
    const map: Record<string, string> = {
      "/": "首页",
      "/chat": "智能对话",
      "/workflow": "PMP 智能平台 · 工作台",
      "/assisted-diagnosis": "AI 辅助诊断与医生反馈",
      "/db/patients": "患者数据库",
      "/db/clinical": "临床数据集",
      "/db/imaging": "影像数据库",
      "/db/pathology": "病理数据库",
      "/knowledge/publications": "科研选题",
      "/knowledge/ppt": "PPT 生成",
      "/knowledge": "科研延伸",
      "/knowledge/data": "数据分析",
      "/knowledge/library": "知识库",
      "/analysis": "智能分析与诊断",
      "/analysis/diagnosis": "智能分析与诊断",
      "/settings": "系统监控与统计分析",
    };
    if (loc.pathname.startsWith("/workflow")) {
      const step = new URLSearchParams(loc.search).get("step");
      if (step === "diagnosis" || step === "analysis") return "工作台 · 智能分析";
      if (step === "database") return "工作台 · 方案推荐 / 入队";
      if (step === "research") return "工作台 · 科研延伸";
      return "PMP 智能平台 · 工作台";
    }
    if (loc.pathname.startsWith("/research")) return "科研延伸";
    if (loc.pathname.startsWith("/db/clinical")) return "临床数据集";
    if (loc.pathname.startsWith("/knowledge/data/imaging")) return "影像数据智能分析";
    if (loc.pathname.startsWith("/knowledge/data/multimodal")) return "多模态分析 Agent";
    if (loc.pathname.startsWith("/knowledge/data")) return "数据分析";
    if (loc.pathname.startsWith("/knowledge/library")) return "知识库";
    return map[loc.pathname] || "PMP 智能医疗平台";
  }, [loc.pathname]);

  const hideWorkflowBanner =
    loc.pathname.startsWith("/knowledge/data/multimodal") ||
    loc.pathname.startsWith("/knowledge/data/imaging") ||
    (loc.pathname.startsWith("/workflow") &&
      ["diagnosis", "analysis"].includes(new URLSearchParams(loc.search).get("step") || ""));

  return (
    <Layout className="pmp-layout">
      <Sider
        className="pmp-sidebar"
        width={220}
        collapsedWidth={64}
        collapsible
        collapsed={collapsed}
        trigger={null}
        theme="dark"
      >
        <div className="pmp-sidebar-logo">
          <div className="pmp-sidebar-logo-icon">P</div>
          {!collapsed ? <span>PMP 智能平台</span> : null}
        </div>
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[selectedKey(loc.pathname)]}
          defaultOpenKeys={openKeysFor(loc.pathname)}
          items={menuItems}
          onClick={({ key }) => {
            if (typeof key === "string" && key.startsWith("/")) nav(key);
          }}
          style={{ border: "none", padding: "8px 0" }}
        />
        <div style={{ position: "absolute", bottom: 16, left: 0, right: 0, textAlign: "center" }}>
          <button
            type="button"
            onClick={() => setCollapsed(!collapsed)}
            style={{
              background: "rgba(255,255,255,0.08)",
              border: "none",
              color: "#fff",
              borderRadius: 6,
              padding: "6px 12px",
              cursor: "pointer",
            }}
          >
            {collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
          </button>
        </div>
      </Sider>
      <Layout>
        <Header className="pmp-header">
          <Space size={16}>
            <Typography.Text strong style={{ fontSize: 15 }}>
              {pageTitle}
            </Typography.Text>
            <span className="pmp-tag-blue">Beta</span>
          </Space>
          <Space size={16}>
            <Input.Search placeholder="搜索病例、患者、模型等…" style={{ width: 280 }} allowClear />
            {quota?.is_pro ? (
              <Tag icon={<CrownOutlined />} color="gold">
                PRO
              </Tag>
            ) : (
              <Tag
                color={quota?.llm_remaining === 0 ? "error" : "processing"}
                style={{ cursor: "pointer" }}
                onClick={() => nav(getAuthToken() ? "/account/billing" : "/account/login?next=/account/billing")}
              >
                免费 {quota?.llm_remaining ?? "—"}/{quota?.llm_limit ?? 10}
              </Tag>
            )}
            <Badge count={12} size="small">
              <RobotOutlined style={{ fontSize: 18, color: "#6b7280" }} />
            </Badge>
            <Badge dot>
              <TeamOutlined style={{ fontSize: 18, color: "#6b7280" }} />
            </Badge>
            {getAuthToken() && quota?.email ? (
              <Space size={8}>
                <UserOutlined style={{ color: "#6b7280" }} />
                <span style={{ fontSize: 13, color: "#374151" }}>{quota.display_name || quota.email}</span>
                <Button
                  type="link"
                  size="small"
                  style={{ padding: 0 }}
                  onClick={() => {
                    clearAuthSession();
                    emitAuthChanged();
                    refreshQuota();
                  }}
                >
                  退出
                </Button>
              </Space>
            ) : (
              <Button type="link" size="small" onClick={() => nav("/account/login")}>
                登录
              </Button>
            )}
          </Space>
        </Header>
        <Content className="pmp-content">
          {!hideWorkflowBanner && jobRunning ? (
            <Alert
              type="info"
              showIcon
              banner
              style={{ marginBottom: 0 }}
              message="影像诊断分析进行中"
              description={
                <span>
                  {pathologyJob.message ||
                    "正在调用 CT 合并接口（分割 + PCI 报告），同学侧约 5 分钟；您可以自由浏览其他页面，完成后可在工作台「② 智能分析」查看结果。"}
                  <Button
                    type="link"
                    size="small"
                    onClick={() => nav("/workflow?step=diagnosis")}
                    style={{ padding: 0, marginLeft: 8 }}
                  >
                    查看进度
                  </Button>
                </span>
              }
            />
          ) : !hideWorkflowBanner && jobDoneAway ? (
            <Alert
              type="success"
              showIcon
              banner
              closable
              style={{ marginBottom: 0 }}
              message="影像分析已完成"
              description={
                <span>
                  {pathologyJob.message}
                  <Button
                    type="link"
                    size="small"
                    onClick={() => nav("/workflow?step=diagnosis")}
                    style={{ padding: 0, marginLeft: 8 }}
                  >
                    查看结果
                  </Button>
                </span>
              }
            />
          ) : null}
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  );
}
