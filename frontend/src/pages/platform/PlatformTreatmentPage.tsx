import { MedicineBoxOutlined, TeamOutlined } from "@ant-design/icons";
import { Alert, Collapse, Empty, List, Space, Tag, Typography } from "antd";
import { useMemo } from "react";
import { Link } from "react-router-dom";
import { GradeTag } from "../../components/platform/DatabasePageShell";
import { loadCarePathwayResult } from "../../lib/platformSession";

const { Title, Paragraph, Text } = Typography;

/**
 * 治疗建议页：仅展示工作台产出的 MDT 待确认证据卡，不再使用演示 MOCK_TREATMENT_PLANS。
 */
export default function PlatformTreatmentPage() {
  const care = useMemo(() => loadCarePathwayResult(), []);
  const cards = care?.treatment.evidence_cards?.length
    ? care.treatment.evidence_cards
    : (care?.treatment.recommendations ?? []).map((rec, i) => ({
        id: `rec-${i}`,
        status: care?.treatment.draft_status || "MDT待确认草案",
        priority: i === 0 ? "首选草案" : "草案",
        recommendation: rec,
        guideline_fragments: [],
        patient_evidence: [],
        generated_at: "",
        requires_mdt_confirmation: true,
      }));

  const grade = care?.treatment.grade_label || "—";

  return (
    <div className="pmp-section">
      <Title level={4} style={{ marginBottom: 16 }}>
        <MedicineBoxOutlined style={{ marginRight: 8, color: "#1677ff" }} />
        治疗建议 · MDT 待确认草案
      </Title>

      <Alert
        type="warning"
        showIcon
        style={{ marginBottom: 16 }}
        message="可追溯证据卡（非演示方案）"
        description="每条推荐须关联本地版本化指南片段与患者证据。本页不再展示不可核查的演示患者方案。"
      />

      {!cards.length ? (
        <div className="pmp-card" style={{ padding: 24 }}>
          <Empty
            description={
              <span>
                尚无治疗证据卡。请先在 <Link to="/analysis">智能分析与诊断</Link> 完成影像分析并生成护理路径。
              </span>
            }
          />
        </div>
      ) : (
        <>
          <div className="pmp-card" style={{ padding: 16, marginBottom: 16 }}>
            <Space wrap>
              <Tag color="orange">{care?.treatment.draft_status || "MDT待确认草案"}</Tag>
              <Tag icon={<TeamOutlined />} color="orange">
                须 MDT 确认
              </Tag>
              <Tag color="blue">
                分级：
                <GradeTag label={grade} />
              </Tag>
              {care?.inferred_diagnosis ? <Tag>{care.inferred_diagnosis}</Tag> : null}
            </Space>
            {care?.api_conclusion ? (
              <Paragraph type="secondary" style={{ marginTop: 12, marginBottom: 0, fontSize: 13 }}>
                患者证据摘要：{care.api_conclusion}
              </Paragraph>
            ) : null}
          </div>

          <Space direction="vertical" size={16} style={{ width: "100%" }}>
            {cards.map((card) => (
              <div key={card.id} className="pmp-card" style={{ padding: 16 }}>
                <Space wrap style={{ marginBottom: 8 }}>
                  <Tag color="orange">{card.status}</Tag>
                  {card.priority ? <Tag color="blue">{card.priority}</Tag> : null}
                </Space>
                <Paragraph style={{ fontSize: 14, marginBottom: 12 }}>{card.recommendation}</Paragraph>
                <Collapse
                  size="small"
                  items={[
                    {
                      key: "g",
                      label: `指南片段 ${card.guideline_fragments.length}`,
                      children: (
                        <List
                          size="small"
                          dataSource={card.guideline_fragments}
                          locale={{ emptyText: "无指南片段（请重新生成护理路径）" }}
                          renderItem={(g) => (
                            <List.Item style={{ display: "block" }}>
                              <Text strong style={{ fontSize: 12 }}>
                                {g.title}（v{g.version}）
                              </Text>
                              <br />
                              <Text type="secondary" style={{ fontSize: 11 }}>
                                {g.section} · {g.fragment_id}
                              </Text>
                              <Paragraph style={{ fontSize: 12, marginTop: 4 }}>{g.excerpt}</Paragraph>
                            </List.Item>
                          )}
                        />
                      ),
                    },
                    {
                      key: "p",
                      label: `患者证据 ${card.patient_evidence.length}`,
                      children: (
                        <List
                          size="small"
                          dataSource={card.patient_evidence}
                          locale={{ emptyText: "无患者证据" }}
                          renderItem={(e) => (
                            <List.Item>
                              <Text style={{ fontSize: 12 }}>
                                <strong>{e.label}</strong>：{e.value}
                                <Text type="secondary">（{e.source}）</Text>
                              </Text>
                            </List.Item>
                          )}
                        />
                      ),
                    },
                  ]}
                />
                {card.generated_at ? (
                  <Text type="secondary" style={{ fontSize: 11, display: "block", marginTop: 8 }}>
                    证据卡生成时间：{card.generated_at}
                  </Text>
                ) : null}
              </div>
            ))}
          </Space>
        </>
      )}
    </div>
  );
}
