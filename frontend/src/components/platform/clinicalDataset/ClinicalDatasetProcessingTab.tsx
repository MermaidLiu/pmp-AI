import { ExportOutlined, FilterOutlined, UploadOutlined } from "@ant-design/icons";
import { App, Button, Input, Space, Typography } from "antd";
import { useState } from "react";
import type { ClinicalDataset } from "../../../lib/clinicalDataset/types";
import ClinicalDatasetTable from "./ClinicalDatasetTable";
import ClinicalVariableSidebar from "./ClinicalVariableSidebar";

const { Text } = Typography;

type Props = {
  dataset: ClinicalDataset;
  onChange: (ds: ClinicalDataset) => void;
  onReimport: () => void;
};

export default function ClinicalDatasetProcessingTab({ dataset, onChange, onReimport }: Props) {
  const { message } = App.useApp();
  const [patientSearch, setPatientSearch] = useState("");

  return (
    <div className="pmp-clinical-processing">
      <div className="pmp-clinical-toolbar">
        <Space wrap>
          <Button icon={<FilterOutlined />} onClick={() => message.info("离群值处理（演示）")}>
            离群值处理
          </Button>
          <Button onClick={() => message.info("缺失值处理（演示）")}>缺失值处理</Button>
          <Button onClick={() => message.info("正态性转换（演示）")}>正态性转换</Button>
          <Button icon={<ExportOutlined />} onClick={() => message.info("数据导出（演示）")}>
            数据导出
          </Button>
          <Button icon={<UploadOutlined />} onClick={onReimport}>
            数据导入
          </Button>
        </Space>
        <Input.Search
          placeholder="搜索患者 ID"
          allowClear
          style={{ width: 200 }}
          value={patientSearch}
          onChange={(e) => setPatientSearch(e.target.value)}
        />
      </div>

      <div className="pmp-clinical-processing-grid">
        <ClinicalVariableSidebar dataset={dataset} onChange={onChange} />
        <ClinicalDatasetTable dataset={dataset} patientSearch={patientSearch} />
      </div>

      <Text type="secondary" style={{ fontSize: 11, marginTop: 8, display: "block" }}>
        文件型变量显示关联键值；影像/病理文件需先在对应数据库独立上传，平台按 {"{}"} 内键自动匹配。
      </Text>
    </div>
  );
}
