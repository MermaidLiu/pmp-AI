import { Modal } from "antd";
import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { getAuthToken } from "../../lib/authSession";

/** Listens for 402 QUOTA_EXCEEDED and routes user to login → PRO billing. */
export function QuotaGateListener() {
  const nav = useNavigate();

  useEffect(() => {
    function onQuota(ev: Event) {
      const detail = (ev as CustomEvent).detail as {
        message?: string;
        code?: string;
      };
      Modal.confirm({
        title: "免费额度已用尽",
        content:
          detail?.message ||
          "免费版限 10 次模型简短问答。开通 PRO（$199/月）可继续使用完整能力。",
        okText: "登录 / 开通 PRO",
        cancelText: "稍后再说",
        onOk: () => {
          if (getAuthToken()) nav("/account/billing");
          else nav("/account/login?next=/account/billing&tab=register");
        },
      });
    }
    window.addEventListener("pmp-quota-exceeded", onQuota);
    return () => window.removeEventListener("pmp-quota-exceeded", onQuota);
  }, [nav]);

  return null;
}
