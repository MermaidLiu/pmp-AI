import { Typography } from "antd";
import { useLocation } from "react-router-dom";

const { Title, Paragraph } = Typography;

export default function PlatformPlaceholderPage() {
  const loc = useLocation();

  return (
    <div className="pmp-section">
      <div className="pmp-card" style={{ padding: 48, textAlign: "center", maxWidth: 560, margin: "40px auto" }}>
        <Title level={4} style={{ marginBottom: 8 }}>
          模块开发中
        </Title>
        <Paragraph type="secondary">
          「{loc.pathname}」界面框架已就绪，后续将接入业务逻辑与后端 API。
        </Paragraph>
        <Paragraph type="secondary" style={{ marginBottom: 0, fontSize: 12 }}>
          当前可先使用「智能对话」或「工作台」体验完整 UI 流程。
        </Paragraph>
      </div>
    </div>
  );
}
