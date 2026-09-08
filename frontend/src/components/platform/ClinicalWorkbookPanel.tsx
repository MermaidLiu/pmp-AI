import { FileExcelOutlined, LinkOutlined } from "@ant-design/icons";
import { App, Button, Select, Space, Tag, Typography, Upload } from "antd";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  applyWorkbookRowToWorkflow,
  importClinicalWorkbookFile,
  loadClinicalWorkbook,
  saveClinicalWorkbook,
  WORKBOOK_IMPORTED_EVENT,
  type ClinicalWorkbookState,
} from "../../lib/clinicalWorkbookImport";

const { Text, Paragraph } = Typography;

type Props = {
  onImported?: (state: ClinicalWorkbookState) => void;
};

export default function ClinicalWorkbookPanel({ onImported }: Props) {
  const { message } = App.useApp();
  const [workbook, setWorkbook] = useState<ClinicalWorkbookState | null>(() => loadClinicalWorkbook());
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setWorkbook(loadClinicalWorkbook());
    function onImported(e: Event) {
      const state = (e as CustomEvent<ClinicalWorkbookState>).detail;
      if (state) setWorkbook(state);
    }
    window.addEventListener(WORKBOOK_IMPORTED_EVENT, onImported);
    return () => window.removeEventListener(WORKBOOK_IMPORTED_EVENT, onImported);
  }, []);

  async function handleFile(file: File) {
    setLoading(true);
    try {
      const state = await importClinicalWorkbookFile(file);
      setWorkbook(state);
      onImported?.(state);
      message.success(`已导入 ${state.rows.length} 例临床资料，并同步至科研临床分析队列`);
    } catch (e) {
      message.error(e instanceof Error ? e.message : "Excel 解析失败");
    } finally {
      setLoading(false);
    }
    return false;
  }

  function selectPatient(id: string) {
    const row = workbook?.rows.find((r) => r.id === id);
    if (!row || !workbook) return;
    applyWorkbookRowToWorkflow(row);
    const next = { ...workbook, selectedId: id };
    saveClinicalWorkbook(next);
    setWorkbook(next);
    message.success(`已载入病例 ${row.name}（${row.id}）`);
  }

  return (
    <div className="pmp-card pmp-clinical-workbook" style={{ padding: 16, marginBottom: 16 }}>
      <div className="pmp-panel-title" style={{ marginBottom: 8 }}>
        <FileExcelOutlined style={{ marginRight: 6, color: "#389e0d" }} />
        临床 Excel 集成
      </div>
      <Paragraph type="secondary" style={{ fontSize: 12, marginBottom: 12 }}>
        上传「临床资料.xls / xlsx」批量导入 CEA、CA125、PCI、病理等字段；选中病例后自动填入左侧临床表单，并与预勾画 NIfTI 一并进入智能分析。
      </Paragraph>
      <Upload
        accept=".xls,.xlsx,.csv"
        showUploadList={false}
        beforeUpload={(file) => {
          void handleFile(file);
          return false;
        }}
      >
        <Button loading={loading} icon={<FileExcelOutlined />}>
          导入临床 Excel
        </Button>
      </Upload>

      {workbook ? (
        <Space direction="vertical" style={{ width: "100%", marginTop: 12 }} size={8}>
          <Space wrap>
            <Tag color="green">{workbook.fileName}</Tag>
            <Tag>{workbook.rows.length} 例</Tag>
            <Link to="/knowledge/data/clinical">
              <Button type="link" size="small" icon={<LinkOutlined />}>
                进入临床及病理数据分析
              </Button>
            </Link>
          </Space>
          <div>
            <Text type="secondary" style={{ fontSize: 12, display: "block", marginBottom: 4 }}>
              选择本例患者（与 NIfTI / 影像一并分析）
            </Text>
            <Select
              showSearch
              style={{ width: "100%" }}
              placeholder="搜索 ID / 姓名"
              value={workbook.selectedId}
              optionFilterProp="label"
              onChange={selectPatient}
              options={workbook.rows.map((r) => ({
                value: r.id,
                label: `${r.name}（${r.id}）· PCI ${r.pciScore ?? "—"} · ${r.gradeLabel}`,
              }))}
            />
          </div>
        </Space>
      ) : null}
    </div>
  );
}
