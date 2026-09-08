import { Input, Select, Space, Tag, Typography } from "antd";
import {
  CLINICAL_QUESTION_TEMPLATES,
  OUTCOME_TYPE_OPTIONS,
  clinicalQuestionSummaryText,
  isSingleCaseQuestion,
  type ClinicalQuestion,
  type ClinicalQuestionId,
} from "../../data/clinicalQuestions";

const { Text, Paragraph } = Typography;

type Props = {
  value: ClinicalQuestion;
  onChange: (next: ClinicalQuestion) => void;
  suggestedTaskId?: string;
};

export default function ClinicalQuestionPanel({ value, onChange, suggestedTaskId }: Props) {
  function patch(partial: Partial<ClinicalQuestion>) {
    onChange({ ...value, ...partial });
  }

  function selectTemplate(id: ClinicalQuestionId) {
    const t = CLINICAL_QUESTION_TEMPLATES.find((x) => x.id === id)!;
    onChange({
      id: t.id,
      title: t.label,
      hypothesis: t.defaultHypothesis,
      outcomeType: t.defaultOutcome,
      modelingApproach: t.defaultModeling,
      groupA: t.defaultGroupA,
      groupB: t.defaultGroupB,
      targetField: t.defaultTargetField,
      positiveClass: t.defaultPositiveClass,
      notes: value.notes,
    });
  }

  const template = CLINICAL_QUESTION_TEMPLATES.find((t) => t.id === value.id);
  const singleCase = isSingleCaseQuestion(value);
  const summary = clinicalQuestionSummaryText(value);

  return (
    <div className="pmp-card pmp-clinical-question" style={{ padding: 16, marginBottom: 16 }}>
      <div className="pmp-panel-title">临床问题定义</div>
      <Paragraph type="secondary" style={{ fontSize: 12, marginBottom: 12 }}>
        定义<strong>要回答的临床问题</strong>（诊断、鉴别、预后、分子预测等）。具体用什么算法、提什么特征，在下方「分析任务」中选择。
      </Paragraph>

      <Space direction="vertical" style={{ width: "100%" }} size={12}>
        <div>
          <Text type="secondary" style={{ fontSize: 12 }}>
            问题类型
          </Text>
          <Select
            style={{ width: "100%", marginTop: 4 }}
            value={value.id}
            onChange={selectTemplate}
            options={CLINICAL_QUESTION_TEMPLATES.map((t) => ({
              value: t.id,
              label: `${t.label} — ${t.desc}`,
            }))}
          />
        </div>

        {template ? (
          <Paragraph type="secondary" style={{ fontSize: 12, margin: 0 }}>
            {template.desc}
            {suggestedTaskId && template.suggestedTasks?.includes(suggestedTaskId) ? (
              <Tag color="blue" style={{ marginLeft: 8 }}>
                推荐当前任务
              </Tag>
            ) : null}
          </Paragraph>
        ) : null}

        <div>
          <Text type="secondary" style={{ fontSize: 12 }}>
            临床问题（可编辑）
          </Text>
          <Input.TextArea
            rows={3}
            value={value.hypothesis}
            onChange={(e) => patch({ hypothesis: e.target.value })}
            placeholder={
              singleCase
                ? "例如：本例病灶最可能的诊断是什么？需与哪些疾病鉴别？"
                : "例如：在本队列中，影像能否区分病理高级别与低级别？"
            }
            style={{ marginTop: 4 }}
          />
        </div>

        {!singleCase ? (
          <Space wrap style={{ width: "100%" }}>
            <div style={{ flex: 1, minWidth: 140 }}>
              <Text type="secondary" style={{ fontSize: 12 }}>
                比较组 A
              </Text>
              <Input
                value={value.groupA}
                onChange={(e) => patch({ groupA: e.target.value })}
                placeholder="如 高级别"
                style={{ marginTop: 4 }}
              />
            </div>
            <div style={{ flex: 1, minWidth: 140 }}>
              <Text type="secondary" style={{ fontSize: 12 }}>
                比较组 B
              </Text>
              <Input
                value={value.groupB}
                onChange={(e) => patch({ groupB: e.target.value })}
                placeholder="如 低级别"
                style={{ marginTop: 4 }}
              />
            </div>
          </Space>
        ) : (
          <Paragraph type="secondary" style={{ fontSize: 12, margin: 0 }}>
            当前为<strong>单病例</strong>：只回答本例的临床问题。多例队列对比请在问题类型中选择「队列 · …」。
          </Paragraph>
        )}

        <Space wrap style={{ width: "100%" }}>
          <div style={{ flex: 1, minWidth: 160 }}>
            <Text type="secondary" style={{ fontSize: 12 }}>
              临床结局 / 金标准
            </Text>
            <Input
              value={value.targetField}
              onChange={(e) => patch({ targetField: e.target.value })}
              placeholder="病理分级、EGFR、PFS…"
              style={{ marginTop: 4 }}
            />
          </div>
          <div style={{ flex: 1, minWidth: 160 }}>
            <Text type="secondary" style={{ fontSize: 12 }}>
              判定标准 / 阳性事件
            </Text>
            <Input
              value={value.positiveClass}
              onChange={(e) => patch({ positiveClass: e.target.value })}
              placeholder="高级别、12 月内复发…"
              style={{ marginTop: 4 }}
            />
          </div>
        </Space>

        <div style={{ flex: 1, minWidth: 200 }}>
          <Text type="secondary" style={{ fontSize: 12 }}>
            问题形式
          </Text>
          <Select
            style={{ width: "100%", marginTop: 4 }}
            value={value.outcomeType}
            onChange={(v) => patch({ outcomeType: v })}
            options={OUTCOME_TYPE_OPTIONS}
          />
        </div>

        {summary ? (
          <div className="pmp-clinical-question-summary">
            <Text type="secondary" style={{ fontSize: 12 }}>
              当前临床问题
            </Text>
            <Paragraph style={{ fontSize: 13, margin: "4px 0 0", color: "#1e3a5f" }}>
              {summary}
            </Paragraph>
          </div>
        ) : null}

        <div>
          <Text type="secondary" style={{ fontSize: 12 }}>
            临床背景补充（可选）
          </Text>
          <Input.TextArea
            rows={2}
            value={value.notes}
            onChange={(e) => patch({ notes: e.target.value })}
            placeholder="如：纳入标准、随访时间、需考虑的混杂因素…"
            style={{ marginTop: 4 }}
          />
        </div>
      </Space>
    </div>
  );
}
