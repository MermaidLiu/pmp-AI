import { App, Button, Card, Form, Input, Tabs, Typography } from "antd";
import { useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { authLogin, authRegister } from "../../api/auth";
import { emitAuthChanged, setAuthSession } from "../../lib/authSession";

const { Title, Paragraph, Text } = Typography;

export default function AccountLoginPage() {
  const { message } = App.useApp();
  const nav = useNavigate();
  const [params] = useSearchParams();
  const next = params.get("next") || "/account/billing";
  const [loading, setLoading] = useState(false);

  const initialTab = useMemo(() => (params.get("tab") === "register" ? "register" : "login"), [params]);

  async function onLogin(values: { email: string; password: string }) {
    setLoading(true);
    try {
      const res = await authLogin(values.email.trim(), values.password);
      setAuthSession(res.token, res.user);
      emitAuthChanged();
      message.success("登录成功");
      nav(next);
    } catch (e) {
      const detail = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      message.error(typeof detail === "string" ? detail : "登录失败");
    } finally {
      setLoading(false);
    }
  }

  async function onRegister(values: { email: string; password: string; display_name?: string }) {
    setLoading(true);
    try {
      const res = await authRegister(values.email.trim(), values.password, values.display_name || "");
      setAuthSession(res.token, res.user);
      emitAuthChanged();
      message.success("注册成功");
      nav(next);
    } catch (e) {
      const detail = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      message.error(typeof detail === "string" ? detail : e instanceof Error ? e.message : "注册失败");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ maxWidth: 440, margin: "48px auto", padding: "0 16px" }}>
      <Card>
        <Title level={3} style={{ marginTop: 0 }}>
          登录 / 注册
        </Title>
        <Paragraph type="secondary">
          免费额度用尽后，请登录并用邮箱开通 <Text strong>PRO（$199/月）</Text>。收款由香港公司主体出具（当前为演示 Mock）。
        </Paragraph>
        <Tabs
          defaultActiveKey={initialTab}
          items={[
            {
              key: "login",
              label: "登录",
              children: (
                <Form layout="vertical" onFinish={onLogin} requiredMark={false}>
                  <Form.Item name="email" label="邮箱" rules={[{ required: true, type: "email", message: "请输入邮箱" }]}>
                    <Input placeholder="you@hospital.com" autoComplete="email" />
                  </Form.Item>
                  <Form.Item name="password" label="密码" rules={[{ required: true, min: 6, message: "至少 6 位" }]}>
                    <Input.Password autoComplete="current-password" />
                  </Form.Item>
                  <Button type="primary" htmlType="submit" block loading={loading}>
                    登录并继续
                  </Button>
                </Form>
              ),
            },
            {
              key: "register",
              label: "邮箱注册",
              children: (
                <Form layout="vertical" onFinish={onRegister} requiredMark={false}>
                  <Form.Item name="display_name" label="显示名（可选）">
                    <Input placeholder="张医生" />
                  </Form.Item>
                  <Form.Item name="email" label="邮箱" rules={[{ required: true, type: "email", message: "请输入邮箱" }]}>
                    <Input placeholder="you@hospital.com" autoComplete="email" />
                  </Form.Item>
                  <Form.Item name="password" label="密码" rules={[{ required: true, min: 6, message: "至少 6 位" }]}>
                    <Input.Password autoComplete="new-password" />
                  </Form.Item>
                  <Button type="primary" htmlType="submit" block loading={loading}>
                    注册并开通 PRO
                  </Button>
                </Form>
              ),
            },
          ]}
        />
        <Paragraph style={{ marginBottom: 0, marginTop: 16 }}>
          <Link to="/">返回首页</Link>
        </Paragraph>
      </Card>
    </div>
  );
}
