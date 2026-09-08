import { App, Alert, Button, Card, Space, Tag, Typography } from "antd";
import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { authCheckoutPro, authConfirmMockPayment, authMe } from "../../api/auth";
import {
  clearAuthSession,
  emitAuthChanged,
  getAuthToken,
  setAuthSession,
  type AuthUser,
} from "../../lib/authSession";

const { Title, Paragraph, Text } = Typography;

export default function AccountBillingPage() {
  const { message } = App.useApp();
  const nav = useNavigate();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [orderId, setOrderId] = useState("");
  const [qrUrl, setQrUrl] = useState("");
  const [merchant, setMerchant] = useState("");
  const [amount, setAmount] = useState(199);
  const [loading, setLoading] = useState(false);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    if (!getAuthToken()) {
      nav("/account/login?next=/account/billing&tab=register");
      return;
    }
    void authMe()
      .then((u) => {
        setUser(u);
        setAuthSession(getAuthToken()!, u);
        emitAuthChanged();
        if (u.is_pro) message.success("当前已是 PRO 会员");
      })
      .catch(() => {
        clearAuthSession();
        emitAuthChanged();
        nav("/account/login?next=/account/billing");
      });
  }, [nav, message]);

  async function startCheckout() {
    setLoading(true);
    try {
      const order = await authCheckoutPro();
      setOrderId(order.order_id);
      setQrUrl(order.qr_image_url);
      setMerchant(order.merchant_name);
      setAmount(order.amount_usd);
      message.info(order.note);
    } catch (e) {
      const detail = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      message.error(typeof detail === "string" ? detail : "创建订单失败");
    } finally {
      setLoading(false);
    }
  }

  async function confirmPaid() {
    if (!orderId) {
      message.warning("请先生成收款码");
      return;
    }
    setConfirming(true);
    try {
      const res = await authConfirmMockPayment(orderId);
      setUser(res.user);
      setAuthSession(getAuthToken()!, res.user);
      emitAuthChanged();
      message.success(res.message);
    } catch (e) {
      message.error(e instanceof Error ? e.message : "确认支付失败");
    } finally {
      setConfirming(false);
    }
  }

  return (
    <div style={{ maxWidth: 560, margin: "32px auto", padding: "0 16px" }}>
      <Card>
        <Title level={3} style={{ marginTop: 0 }}>
          开通 PRO 会员
        </Title>
        <Paragraph type="secondary">
          免费版限 <Text strong>10 次</Text> 模型调用，且仅为简短问答（不计长上下文）。PRO{" "}
          <Text strong>$199 / 月</Text> 解锁完整智能对话与分析。
        </Paragraph>

        {user ? (
          <Space wrap style={{ marginBottom: 16 }}>
            <Tag color={user.is_pro ? "gold" : "default"}>{user.is_pro ? "PRO" : "FREE"}</Tag>
            <Text>{user.display_name || user.email}</Text>
            {!user.is_pro && user.llm_remaining != null ? (
              <Text type="secondary">
                剩余额度 {user.llm_remaining}/{user.llm_limit}
              </Text>
            ) : null}
            {user.is_pro && user.pro_expires_at ? (
              <Text type="secondary">到期 {user.pro_expires_at.slice(0, 10)}</Text>
            ) : null}
          </Space>
        ) : null}

        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
          message="香港公司收款（Mock）"
          description="正式环境将替换为香港主体提供的真实收款码 / FPS。当前点击「我已支付」即可演示开通。"
        />

        {!user?.is_pro ? (
          <Space direction="vertical" size={16} style={{ width: "100%" }}>
            <Button type="primary" size="large" loading={loading} onClick={startCheckout} block>
              生成收款码 · ${amount}/月
            </Button>
            {orderId ? (
              <div style={{ textAlign: "center" }}>
                <Paragraph style={{ marginBottom: 8 }}>
                  商户：{merchant}
                  <br />
                  订单：{orderId}
                </Paragraph>
                {qrUrl ? (
                  <img
                    src={qrUrl}
                    alt="PRO 收款码"
                    width={220}
                    height={250}
                    style={{ border: "1px solid #e2e8f0", borderRadius: 8 }}
                  />
                ) : null}
                <div style={{ marginTop: 12 }}>
                  <Button type="primary" loading={confirming} onClick={confirmPaid}>
                    我已支付（Mock 开通）
                  </Button>
                </div>
              </div>
            ) : null}
          </Space>
        ) : (
          <Alert type="success" showIcon message="PRO 已生效" description="可返回智能对话使用完整上下文分析。" />
        )}

        <Paragraph style={{ marginTop: 24, marginBottom: 0 }}>
          <Link to="/chat">返回智能对话</Link>
          {" · "}
          <Link to="/">首页</Link>
        </Paragraph>
      </Card>
    </div>
  );
}
