import {
  ExperimentOutlined,
  FilePptOutlined,
  FileSearchOutlined,
  LineChartOutlined,
  MergeCellsOutlined,
  ReadOutlined,
} from "@ant-design/icons";
import { Button, Col, Row, Space, Tag, Typography } from "antd";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import ResearchBatchImportPanel from "../../components/platform/ResearchBatchImportPanel";
import { hasResearchClinicalReady, loadResearchBatchContext } from "../../lib/researchBatchContext";
import { FOLLOWUP_BATCH_IMPORTED_EVENT, loadFollowUpBatch, type FollowUpBatchState } from "../../lib/followUpBatchStore";

const { Title, Paragraph } = Typography;

const MODULES = [
  {
    key: "clinical",
    path: "/knowledge/data/clinical",
    title: "临床及病理数据分析",
    desc: "病理分级相关因素、生存分析、预后模型与机器学习。",
    tags: ["结构化数据", "生存分析", "机器学习"],
    theme: "navy" as const,
    icon: <FileSearchOutlined style={{ fontSize: 28 }} />,
  },
  {
    key: "imaging",
    path: "/knowledge/data/imaging",
    title: "影像数据智能分析",
    desc: "基于预勾画 NIfTI / 标注图进行 Radiomics 特征建模。",
    tags: ["影像组学", "特征筛选", "深度学习"],
    theme: "cyan" as const,
    icon: <ExperimentOutlined style={{ fontSize: 28 }} />,
  },
  {
    key: "multimodal",
    path: "/knowledge/data/multimodal",
    title: "多模态联合分析",
    desc: "融合临床、病理与影像组学，构建联合模型。",
    tags: ["联合建模", "风险分层", "贡献度"],
    theme: "purple" as const,
    icon: <MergeCellsOutlined style={{ fontSize: 28 }} />,
  },
];

export default function PlatformResearchExtensionPage() {
  const [batch, setBatch] = useState<FollowUpBatchState | null>(() => loadFollowUpBatch());
  const [researchCtx, setResearchCtx] = useState(() => loadResearchBatchContext());
  const clinicalReady = hasResearchClinicalReady(researchCtx);
  const [ready, setReady] = useState(() => hasResearchClinicalReady(loadResearchBatchContext()));

  useEffect(() => {
    function refresh() {
      const b = loadFollowUpBatch();
      const ctx = loadResearchBatchContext();
      setBatch(b);
      setResearchCtx(ctx);
      setReady(hasResearchClinicalReady(ctx));
    }
    window.addEventListener(FOLLOWUP_BATCH_IMPORTED_EVENT, refresh);
    refresh();
    return () => window.removeEventListener(FOLLOWUP_BATCH_IMPORTED_EVENT, refresh);
  }, []);

  // 优先展示「当前激活的勾选队列」，而不是随访整批导入数量
  const clinicalN = researchCtx?.clinical.length ?? batch?.cases.length ?? 0;
  const imagingN = researchCtx?.imaging.length ?? batch?.matchedCount ?? 0;
  const selectionHint =
    researchCtx?.clinicalSource === "workflow_mapped"
      ? "工作台临床已映射为模板字段"
      : researchCtx?.clinicalSource === "excel_upload"
        ? "已上传临床 Excel 模板"
        : researchCtx?.clinical.length && batch?.cases.length && researchCtx.clinical.length < batch.cases.length
          ? `随访已勾选 ${researchCtx.clinical.length}/${batch.cases.length}`
          : researchCtx?.label || "";

  return (
    <div className="pmp-section">
      <Title level={4} style={{ marginBottom: 4 }}>
        <LineChartOutlined style={{ marginRight: 8, color: "#1677ff" }} />
        AI 多模态科研智能体
      </Title>
      <Paragraph type="secondary" style={{ marginBottom: 8 }}>
        从工作台经随访队列进入时，自动将患者与临床信息映射到科研 Excel 模板；否则须上传与模板一致的临床 Excel 后才能分析。
      </Paragraph>
      <Tag color="green" style={{ marginBottom: 16 }}>
        已连接：多模态科研数据库
      </Tag>

      <ResearchBatchImportPanel
        variant="research"
        onImported={() => {
          setBatch(loadFollowUpBatch());
          const ctx = loadResearchBatchContext();
          setResearchCtx(ctx);
          setReady(hasResearchClinicalReady(ctx));
        }}
      />

      {ready && clinicalReady ? (
        <>
          {clinicalN > 0 ? (
            <Space style={{ marginBottom: 12 }} wrap>
              <Tag color="blue">{clinicalN} 例临床</Tag>
              {imagingN > 0 ? <Tag color="cyan">{imagingN} 例预勾画影像</Tag> : null}
              {selectionHint ? (
                <Tag color="purple" style={{ maxWidth: 420, whiteSpace: "normal", height: "auto" }}>
                  {selectionHint}
                </Tag>
              ) : null}
            </Space>
          ) : null}
          <div className="pmp-module-cards">
            {MODULES.map((m) => (
              <div key={m.key} className={`pmp-module-card pmp-module-card--${m.theme}`}>
                <div className="pmp-module-card-icon">{m.icon}</div>
                <Title level={5} style={{ margin: "12px 0 8px", color: "#fff" }}>
                  {m.title}
                </Title>
                <Paragraph style={{ color: "rgba(255,255,255,0.85)", fontSize: 13, minHeight: 48 }}>
                  {m.desc}
                </Paragraph>
                <Space wrap size={[4, 4]} style={{ marginBottom: 16 }}>
                  {m.tags.map((t) => (
                    <Tag key={t} style={{ background: "rgba(255,255,255,0.15)", border: "none", color: "#fff" }}>
                      {t}
                    </Tag>
                  ))}
                </Space>
                <Link to={m.path}>
                  <Button type="default" ghost block>
                    进入模块
                    {m.key === "clinical" && clinicalN > 0 ? `（${clinicalN} 例）` : ""}
                    {m.key === "imaging" && imagingN > 0 ? `（${imagingN} 例）` : ""}
                  </Button>
                </Link>
              </div>
            ))}
          </div>
        </>
      ) : (
        <Paragraph type="secondary" style={{ fontSize: 13, marginBottom: 24 }}>
          {researchCtx?.clinical.length && researchCtx.clinicalSource === "none"
            ? "已勾选病例，但尚无临床模板数据：请上传与「临床数据导入模板」一致的 Excel。"
            : "请先完成临床数据准备（工作台映射或上传模板 Excel），再展开临床 / 影像 / 多模态分析模块。"}
        </Paragraph>
      )}

      <Row gutter={[16, 16]} style={{ marginTop: 24 }}>
        <Col xs={24} sm={12}>
          <div className="pmp-card" style={{ padding: 16, textAlign: "center" }}>
            <ReadOutlined style={{ fontSize: 28, color: "#7c3aed", marginBottom: 8 }} />
            <Title level={5} style={{ marginBottom: 8 }}>
              科研选题
            </Title>
            <Link to="/knowledge/publications">
              <Button block style={{ borderColor: "#7c3aed", color: "#7c3aed" }}>
                论文选题
              </Button>
            </Link>
          </div>
        </Col>
        <Col xs={24} sm={12}>
          <div className="pmp-card" style={{ padding: 16, textAlign: "center" }}>
            <FilePptOutlined style={{ fontSize: 28, color: "#0891b2", marginBottom: 8 }} />
            <Title level={5} style={{ marginBottom: 8 }}>
              PPT 生成
            </Title>
            <Link to="/knowledge/ppt">
              <Button block>生成 PPT</Button>
            </Link>
          </div>
        </Col>
      </Row>
    </div>
  );
}
