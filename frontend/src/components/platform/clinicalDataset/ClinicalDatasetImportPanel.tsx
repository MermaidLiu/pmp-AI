import { DownloadOutlined, InboxOutlined, InfoCircleOutlined } from "@ant-design/icons";
import { Alert, App, Button, Input, Space, Typography, Upload } from "antd";
import { useState } from "react";
import { parseClinicalExcelFile } from "../../../lib/clinicalDataset/parseExcel";
import { saveClinicalDataset } from "../../../lib/clinicalDataset/store";
import { downloadClinicalExcelTemplate } from "../../../lib/clinicalDataset/template";
import { DEFAULT_PURCHASED_MODULES } from "../../../lib/clinicalDataset/types";

const { Dragger } = Upload;
const { Paragraph, Text } = Typography;

type Props = {
  onImported: (datasetId: string) => void;
};

export default function ClinicalDatasetImportPanel({ onImported }: Props) {
  const { message } = App.useApp();
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [lastWarnings, setLastWarnings] = useState<string[]>([]);

  async function handleFile(file: File) {
    setLoading(true);
    setLastWarnings([]);
    try {
      const result = await parseClinicalExcelFile(file, name || undefined, {
        purchasedModules: DEFAULT_PURCHASED_MODULES,
      });
      if (result.errors.length) {
        message.error(result.errors[0]);
        setLastWarnings([...result.errors, ...result.warnings]);
        return false;
      }
      const saved = saveClinicalDataset(result.dataset);
      if (result.warnings.length) setLastWarnings(result.warnings);
      message.success(`导入成功：${saved.rows.length} 例 · ${saved.variables.length} 个变量`);
      onImported(saved.id);
    } catch (e) {
      message.error(e instanceof Error ? e.message : "解析 Excel 失败");
    } finally {
      setLoading(false);
    }
    return false;
  }

  return (
    <div className="pmp-card pmp-clinical-import" style={{ padding: 20 }}>
      <div className="pmp-panel-title">临床数据导入</div>
      <Paragraph type="secondary" style={{ fontSize: 12, marginBottom: 16 }}>
        支持两种格式：① 两行表头（第 1 行类型 + 第 2 行变量名）；② 单行表头（如 临床资料.xls：第 1 行 ID/姓名/…，第 2 行起为数据）。
        文件列可在 {"{}"} 内设置关联键（患者ID / 检查号 / 文件名），上传后平台自动关联已入库影像/病理。
      </Paragraph>

      <Alert
        type="info"
        showIcon
        icon={<InfoCircleOutlined />}
        style={{ marginBottom: 16, fontSize: 12 }}
        message="识别规则"
        description={
          <ul style={{ margin: "4px 0 0", paddingLeft: 18, fontSize: 12 }}>
            <li>数值型：一列全为数值且种类 &gt; 20</li>
            <li>分类型：种类 ≤ 20</li>
            <li>日期型：YYYY-MM-DD（如 2023-10-20）</li>
            <li>同一关联键出现在多列时，仅第一列会关联文件</li>
            <li>未购买模块（如波形）对应列不会解析</li>
            <li>识别有误可在变量管理处修改</li>
          </ul>
        }
      />

      <Space style={{ marginBottom: 12 }} wrap>
        <div>
          <Text type="secondary" style={{ fontSize: 12, display: "block", marginBottom: 4 }}>
            数据集名称（可选）
          </Text>
          <Input
            placeholder="如：样本中心-患者信息"
            value={name}
            onChange={(e) => setName(e.target.value)}
            style={{ width: 280 }}
          />
        </div>
        <div style={{ paddingTop: 20 }}>
          <Button icon={<DownloadOutlined />} onClick={downloadClinicalExcelTemplate}>
            下载 Excel 模板
          </Button>
        </div>
      </Space>

      <Dragger
        accept=".xlsx,.xls"
        multiple={false}
        showUploadList={false}
        disabled={loading}
        beforeUpload={(file) => {
          handleFile(file as File);
          return false;
        }}
      >
        <p className="ant-upload-drag-icon">
          <InboxOutlined />
        </p>
        <p className="ant-upload-text">点击或拖拽 Excel 文件到此处上传</p>
        <p className="ant-upload-hint">支持 .xlsx / .xls · 两行表头或单行表头（含 ID 列）</p>
      </Dragger>

      {lastWarnings.length ? (
        <Alert
          type="warning"
          showIcon
          style={{ marginTop: 12, fontSize: 12 }}
          message="导入提示"
          description={
            <ul style={{ margin: 0, paddingLeft: 18 }}>
              {lastWarnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          }
        />
      ) : null}
    </div>
  );
}
