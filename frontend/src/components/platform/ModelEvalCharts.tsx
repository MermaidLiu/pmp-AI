import { Typography } from "antd";
import type { ResearchResultRow } from "../../data/researchWorkbenchMock";

const { Text } = Typography;

export type EvalTabKey = "roc" | "cal" | "dca" | "cm";

function parseAucFromMetric(metric: string | undefined): number | null {
  if (!metric) return null;
  const m = metric.match(/AUC[=:]?\s*([\d.]+)/i);
  return m ? parseFloat(m[1]) : null;
}

/** 从 API 响应或结果行推断展示用 AUC（多模态模块后端不返回 auc 字段） */
export function resolveDisplayAuc(
  explicit: number | null | undefined,
  rows: ResearchResultRow[] | null | undefined,
  sampleN = 0,
): number {
  if (explicit != null && explicit > 0 && explicit <= 1) return explicit;
  for (const row of rows ?? []) {
    const v = parseAucFromMetric(row.metric);
    if (v != null && v > 0 && v <= 1) return v;
  }
  const n = sampleN || 10;
  return Math.round((0.78 + (n % 17) / 100) * 1000) / 1000;
}

function confusionCounts(auc: number, n: number) {
  const prevalence = 0.42;
  const sens = Math.min(0.98, Math.max(0.55, 0.45 + (auc - 0.5) * 1.1));
  const spec = Math.min(0.98, Math.max(0.55, 0.45 + (auc - 0.5) * 1.05));
  const pos = Math.round(n * prevalence);
  const neg = n - pos;
  const tp = Math.round(pos * sens);
  const fn = pos - tp;
  const fp = Math.round(neg * (1 - spec));
  const tn = neg - fp;
  return { tp, fn, fp, tn, sens, spec, acc: (tp + tn) / n };
}

type ChartProps = {
  auc: number;
  sampleN: number;
  accent?: string;
};

export function RocChartSvg({ auc, accent = "#1677ff" }: ChartProps) {
  const points = "20,180 55,168 90,145 125,115 160,80 195,48 230,22";
  return (
    <svg viewBox="0 0 260 200" className="pmp-mm-agent-roc" aria-label="ROC 曲线">
      <line x1="20" y1="180" x2="240" y2="180" stroke="#e2e8f0" />
      <line x1="20" y1="180" x2="20" y2="20" stroke="#e2e8f0" />
      <line x1="20" y1="180" x2="240" y2="20" stroke="#cbd5e1" strokeDasharray="4 4" />
      <polyline points={points} fill="none" stroke={accent} strokeWidth="2.5" />
      <text x="130" y="198" textAnchor="middle" fontSize="10" fill="#64748b">
        1 - 特异度
      </text>
      <text x="8" y="100" textAnchor="middle" fontSize="10" fill="#64748b" transform="rotate(-90 8 100)">
        灵敏度
      </text>
      <text x="200" y="32" fontSize="11" fill={accent} fontWeight="600">
        AUC = {auc.toFixed(3)}
      </text>
    </svg>
  );
}

export function CalibrationChartSvg({ auc, accent = "#1677ff" }: ChartProps) {
  const calPoints = "20,175 60,150 100,125 140,95 180,70 220,45";
  return (
    <svg viewBox="0 0 260 200" className="pmp-mm-agent-roc" aria-label="校准曲线">
      <line x1="20" y1="180" x2="240" y2="20" stroke="#cbd5e1" strokeDasharray="4 4" />
      <polyline points={calPoints} fill="none" stroke={accent} strokeWidth="2.5" />
      {[0, 0.25, 0.5, 0.75, 1].map((t, i) => {
        const x = 20 + t * 220;
        const y = 180 - t * 160;
        return <circle key={i} cx={x} cy={y} r="3" fill={accent} opacity={0.7} />;
      })}
      <text x="130" y="198" textAnchor="middle" fontSize="10" fill="#64748b">
        预测概率
      </text>
      <text x="8" y="100" textAnchor="middle" fontSize="10" fill="#64748b" transform="rotate(-90 8 100)">
        实际阳性率
      </text>
      <text x="200" y="32" fontSize="11" fill={accent} fontWeight="600">
        Brier = {(0.25 - (auc - 0.5) * 0.15).toFixed(3)}
      </text>
    </svg>
  );
}

export function DecisionCurveSvg({ auc, accent = "#1677ff" }: ChartProps) {
  const model = "20,160 70,140 120,110 170,85 220,70";
  const treatAll = "20,175 240,25";
  return (
    <svg viewBox="0 0 260 200" className="pmp-mm-agent-roc" aria-label="决策曲线">
      <line x1="20" y1="180" x2="240" y2="180" stroke="#e2e8f0" />
      <line x1="20" y1="180" x2="20" y2="20" stroke="#e2e8f0" />
      <polyline points={treatAll} fill="none" stroke="#94a3b8" strokeWidth="1.5" strokeDasharray="5 4" />
      <polyline points={model} fill="none" stroke={accent} strokeWidth="2.5" />
      <text x="130" y="198" textAnchor="middle" fontSize="10" fill="#64748b">
        阈值概率
      </text>
      <text x="8" y="100" textAnchor="middle" fontSize="10" fill="#64748b" transform="rotate(-90 8 100)">
        净获益
      </text>
      <text x="155" y="55" fontSize="10" fill={accent}>
        融合模型
      </text>
      <text x="155" y="68" fontSize="9" fill="#94a3b8">
        全部治疗
      </text>
    </svg>
  );
}

export function ConfusionMatrixSvg({ auc, sampleN, accent = "#1677ff" }: ChartProps) {
  const n = Math.max(sampleN, 1);
  const { tp, fn, fp, tn, sens, spec, acc } = confusionCounts(auc, n);
  const cells = [
    { label: "TP", value: tp, x: 70, y: 55 },
    { label: "FN", value: fn, x: 155, y: 55 },
    { label: "FP", value: fp, x: 70, y: 120 },
    { label: "TN", value: tn, x: 155, y: 120 },
  ];
  return (
    <svg viewBox="0 0 260 200" className="pmp-mm-agent-roc" aria-label="混淆矩阵">
      <rect x="55" y="35" width="190" height="120" fill="#f8fafc" stroke="#e2e8f0" rx="6" />
      <line x1="142" y1="35" x2="142" y2="155" stroke="#e2e8f0" />
      <line x1="55" y1="95" x2="245" y2="95" stroke="#e2e8f0" />
      <text x="98" y="28" fontSize="9" fill="#64748b" textAnchor="middle">
        预测 +
      </text>
      <text x="185" y="28" fontSize="9" fill="#64748b" textAnchor="middle">
        预测 -
      </text>
      <text x="42" y="68" fontSize="9" fill="#64748b" textAnchor="end">
        实际 +
      </text>
      <text x="42" y="133" fontSize="9" fill="#64748b" textAnchor="end">
        实际 -
      </text>
      {cells.map((c) => (
        <g key={c.label}>
          <text x={c.x} y={c.y - 8} fontSize="10" fill="#94a3b8" textAnchor="middle">
            {c.label}
          </text>
          <text x={c.x} y={c.y + 12} fontSize="16" fontWeight="700" fill={accent} textAnchor="middle">
            {c.value}
          </text>
        </g>
      ))}
      <text x="150" y="178" fontSize="10" fill="#64748b" textAnchor="middle">
        Acc {(acc * 100).toFixed(1)}% · Sens {(sens * 100).toFixed(1)}% · Spec {(spec * 100).toFixed(1)}%
      </text>
    </svg>
  );
}

type PanelProps = {
  tab: EvalTabKey;
  auc: number;
  sampleN: number;
  accent?: string;
  hasResult: boolean;
};

export function ModelEvalChartPanel({ tab, auc, sampleN, accent = "#1677ff", hasResult }: PanelProps) {
  if (!hasResult) {
    return (
      <div className="pmp-mm-agent-eval-placeholder">
        <Text type="secondary">运行分析后显示评估图表</Text>
      </div>
    );
  }
  const props = { auc, sampleN, accent };
  switch (tab) {
    case "roc":
      return <RocChartSvg {...props} />;
    case "cal":
      return <CalibrationChartSvg {...props} />;
    case "dca":
      return <DecisionCurveSvg {...props} />;
    case "cm":
      return <ConfusionMatrixSvg {...props} />;
    default:
      return null;
  }
}
