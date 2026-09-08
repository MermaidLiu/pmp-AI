import { CheckCircleOutlined, LinkOutlined, TeamOutlined } from "@ant-design/icons";
import { Alert, Button, Card, Col, Collapse, List, Row, Space, Tag, Typography } from "antd";
import { Link } from "react-router-dom";
import type { PathologyImagingGradeResult } from "../../api/platform";
import type { CarePathwayResult, TreatmentEvidenceCard } from "../../lib/platformCarePathway";
import { buildImagingReportText } from "../../lib/platformCarePathway";

const { Paragraph, Text, Title } = Typography;

type Props = {
  imaging: PathologyImagingGradeResult;
  careResult: CarePathwayResult | null;
  careLoading: boolean;
  inFollowUp: boolean;
  followUpLoading: boolean;
  onEnroll: () => void;
};

function EvidenceCardView({ card }: { card: TreatmentEvidenceCard }) {
  return (
    <Card
      size="small"
      className="pmp-evidence-card"
      title={
        <Space wrap>
          <Tag color="orange">{card.status || "MDT待确认草案"}</Tag>
          {card.priority ? <Tag color="blue">{card.priority}</Tag> : null}
        </Space>
      }
    >
      <Paragraph style={{ fontSize: 13, marginBottom: 12 }}>{card.recommendation}</Paragraph>
      <Collapse
        size="small"
        items={[
          {
            key: "guideline",
            label: `本地版本化指南片段（${card.guideline_fragments.length}）`,
            children: (
              <List
                size="small"
                dataSource={card.guideline_fragments}
                locale={{ emptyText: "未绑定指南片段" }}
                renderItem={(g) => (
                  <List.Item style={{ display: "block", paddingBlock: 8 }}>
                    <div style={{ fontWeight: 600, fontSize: 12 }}>
                      {g.title} · v{g.version}
                    </div>
                    <Text type="secondary" style={{ fontSize: 11 }}>
                      {g.section} · {g.fragment_id}
                    </Text>
                    <Paragraph style={{ fontSize: 12, margin: "6px 0 0", color: "#475569" }}>
                      「{g.excerpt}」
                    </Paragraph>
                  </List.Item>
                )}
              />
            ),
          },
          {
            key: "patient",
            label: `患者证据（${card.patient_evidence.length}）`,
            children: (
              <List
                size="small"
                dataSource={card.patient_evidence}
                locale={{ emptyText: "未绑定患者证据" }}
                renderItem={(e) => (
                  <List.Item style={{ paddingBlock: 6 }}>
                    <Space direction="vertical" size={0} style={{ width: "100%" }}>
                      <Text strong style={{ fontSize: 12 }}>
                        {e.label}
                      </Text>
                      <Text style={{ fontSize: 12 }}>{e.value}</Text>
                      <Text type="secondary" style={{ fontSize: 11 }}>
                        {e.kind} · {e.source} · {e.id}
                      </Text>
                    </Space>
                  </List.Item>
                )}
              />
            ),
          },
        ]}
      />
      {card.generated_at ? (
        <Text type="secondary" style={{ fontSize: 11, display: "block", marginTop: 8 }}>
          生成时间：{card.generated_at}
        </Text>
      ) : null}
    </Card>
  );
}

export function CarePathwayPanel({
  imaging,
  careResult,
  careLoading,
  inFollowUp,
  followUpLoading,
  onEnroll,
}: Props) {
  const reportText = careResult?.imaging_report || buildImagingReportText(imaging);
  const cards =
    careResult?.treatment.evidence_cards?.length
      ? careResult.treatment.evidence_cards
      : (careResult?.treatment.recommendations ?? []).map((rec, i) => ({
          id: `legacy-${i}`,
          status: careResult?.treatment.draft_status || "MDT待确认草案",
          priority: i === 0 ? "首选草案" : "草案",
          recommendation: rec,
          guideline_fragments: [],
          patient_evidence: [],
          generated_at: "",
          requires_mdt_confirmation: true,
        }));

  return (
    <div id="pmp-care-pathway" className="pmp-care-pathway pmp-section" style={{ marginTop: 24 }}>
      <Title level={4} style={{ marginBottom: 8 }}>
        <span className="pmp-section-num">3</span>
        治疗方案推荐（MDT 待确认草案）
      </Title>
      <Paragraph type="secondary" style={{ fontSize: 13, marginBottom: 12 }}>
        每条推荐均为可追溯证据卡：关联本地版本化指南片段与患者证据（PCI / 分级 / 临床标志物），供 MDT 确认，非正式医嘱。
      </Paragraph>

      <Alert
        type="warning"
        showIcon
        style={{ marginBottom: 16 }}
        message="定位：MDT 待确认草案"
        description="系统不输出仅含指南名称的空泛建议。采纳前须由多学科团队核对证据卡中的指南片段与患者证据。"
      />

      <Row gutter={[16, 16]}>
        {cards.length ? (
          cards.map((card) => (
            <Col xs={24} lg={12} key={card.id}>
              <EvidenceCardView card={card} />
            </Col>
          ))
        ) : (
          <Col xs={24}>
            <Card size="small" loading={careLoading}>
              <Paragraph type="secondary" style={{ marginBottom: 0 }}>
                影像分析完成后将生成可追溯治疗证据卡…
              </Paragraph>
            </Card>
          </Col>
        )}

        <Col xs={24} lg={12}>
          <Card title="影像分析报告" size="small" loading={careLoading && !careResult}>
            <pre className="pmp-care-report">{reportText}</pre>
            {careResult?.api_conclusion ? (
              <Alert
                type="info"
                showIcon
                style={{ marginTop: 12 }}
                message={careResult.inferred_diagnosis}
                description={careResult.api_conclusion}
              />
            ) : null}
          </Card>
        </Col>

        <Col xs={24} lg={12}>
          <Card title="草案状态与可核查引用" size="small" loading={careLoading}>
            {careResult?.treatment ? (
              <>
                <Space wrap style={{ marginBottom: 12 }}>
                  <Tag color="orange">{careResult.treatment.draft_status || "MDT待确认草案"}</Tag>
                  <Tag color="blue">分级：{careResult.treatment.grade_label}</Tag>
                  <Tag color="orange" icon={<TeamOutlined />}>
                    须 MDT 确认
                  </Tag>
                  {careResult.treatment.llm_used ? (
                    <Tag color="purple">{careResult.treatment.llm_model || "大模型"} 润色条文</Tag>
                  ) : (
                    <Tag>本地证据卡模板</Tag>
                  )}
                </Space>
                <Paragraph type="secondary" style={{ fontSize: 12 }}>
                  已绑定指南片段标题（含版本）：
                </Paragraph>
                <ul style={{ margin: "0 0 12px", paddingLeft: 18, fontSize: 12 }}>
                  {(careResult.treatment.guideline_refs.length
                    ? careResult.treatment.guideline_refs
                    : ["（见各证据卡内片段）"]
                  ).map((g) => (
                    <li key={g}>{g}</li>
                  ))}
                </ul>
                {careResult.literature?.length ? (
                  <div>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      可核查文献（已隔离演示数据）：
                    </Text>
                    <ul style={{ margin: "4px 0 0", paddingLeft: 18, fontSize: 12 }}>
                      {careResult.literature.slice(0, 5).map((lit) => (
                        <li key={lit.pmid || lit.doi || lit.title}>
                          {lit.title}
                          {lit.journal ? ` — ${lit.journal}` : ""}
                          {lit.year ? ` (${lit.year})` : ""}
                          {lit.pmid ? ` · PMID ${lit.pmid}` : ""}
                          {lit.doi ? ` · DOI ${lit.doi}` : ""}
                          {lit.verifiable ? (
                            <Tag color="success" icon={<CheckCircleOutlined />} style={{ marginLeft: 6 }}>
                              可核查
                            </Tag>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : (
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    暂无外链文献；证据以本地版本化指南片段与患者证据为准。
                  </Text>
                )}
              </>
            ) : (
              <Paragraph type="secondary">等待治疗证据卡生成…</Paragraph>
            )}
          </Card>
        </Col>

        <Col xs={24}>
          <Card size="small" bodyStyle={{ padding: "12px 16px" }}>
            <Space wrap>
              <Button
                type="primary"
                icon={<TeamOutlined />}
                loading={followUpLoading}
                disabled={!careResult || inFollowUp}
                onClick={onEnroll}
              >
                {inFollowUp ? "已在随访队列" : "MDT 确认后 · 加入随访队列"}
              </Button>
              {inFollowUp ? (
                <Link to="/db/follow-up">
                  <Button icon={<LinkOutlined />}>查看随访队列</Button>
                </Link>
              ) : null}
            </Space>
            <Paragraph type="secondary" style={{ marginTop: 8, marginBottom: 0, fontSize: 12 }}>
              入队表示将草案纳入随访管理，不代表已完成 MDT 最终确认。
            </Paragraph>
          </Card>
        </Col>
      </Row>
    </div>
  );
}
