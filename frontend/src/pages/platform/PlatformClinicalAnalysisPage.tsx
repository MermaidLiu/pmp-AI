import { Spin } from "antd";
import { useEffect, useMemo, useState } from "react";
import { platformListPatients } from "../../api/platform";
import ClinicalAnalysisWorkbench from "../../components/platform/clinicalDataset/ClinicalAnalysisWorkbench";
import { buildClinicalDatasetFromFollowUpCases } from "../../lib/clinicalDataset/buildFromFollowUpCases";
import {
  buildCohortFromBatchRefs,
  buildCohortFromPatients,
  buildDemoPmpCohort,
  RESEARCH_COHORT_DATASET_ID,
} from "../../lib/clinicalDataset/patientCohortDataset";
import { getClinicalDataset, saveClinicalDataset } from "../../lib/clinicalDataset/store";
import { consumeBatchSelection } from "../../lib/platformBatchSelection";
import { getResearchBatchPatients, loadResearchBatchContext } from "../../lib/researchBatchContext";
import { loadFollowUpBatch, visitIdsEqual, type FollowUpBatchCase } from "../../lib/followUpBatchStore";

function filterFollowUpCasesByIds(cases: FollowUpBatchCase[], ids: string[]): FollowUpBatchCase[] {
  if (!ids.length) return [];
  return cases.filter((c) => ids.some((id) => visitIdsEqual(c.visitId, id) || c.visitId === id));
}

export default function PlatformClinicalAnalysisPage() {
  const researchClinical = useMemo(() => getResearchBatchPatients("clinical"), []);
  const batch = useMemo(() => {
    if (researchClinical.length) return { patients: researchClinical };
    return consumeBatchSelection("clinical");
  }, [researchClinical]);
  const [ready, setReady] = useState(false);
  const [batchCount, setBatchCount] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      const ctx = loadResearchBatchContext();
      const followUpBatch = loadFollowUpBatch();

      if (batch?.patients.length && ctx?.source === "patient_db") {
        try {
          const all = await platformListPatients({});
          const ids = new Set(batch.patients.map((p) => p.id));
          const selected = all.filter((p) => ids.has(p.id));
          const payload =
            selected.length > 0
              ? buildCohortFromPatients(selected, `患者库批次（${selected.length} 例）`)
              : buildCohortFromBatchRefs(batch.patients, `患者库批次（${batch.patients.length} 例）`);
          saveClinicalDataset({ ...payload, id: RESEARCH_COHORT_DATASET_ID });
          if (!cancelled) {
            setBatchCount(selected.length || batch.patients.length);
            setReady(true);
          }
          return;
        } catch {
          const payload = buildCohortFromBatchRefs(
            batch.patients,
            `患者库批次（${batch.patients.length} 例）`,
          );
          saveClinicalDataset({ ...payload, id: RESEARCH_COHORT_DATASET_ID });
          if (!cancelled) {
            setBatchCount(batch.patients.length);
            setReady(true);
          }
          return;
        }
      }

      // 随访 / 科研导入：只用当前激活勾选的病例，不要整批
      if (
        ctx?.clinical.length &&
        (ctx.source === "follow_up_batch" || ctx.source === "research_upload") &&
        followUpBatch?.cases.length
      ) {
        const ids = ctx.clinical.map((p) => p.examId || p.id);
        const selectedCases = filterFollowUpCasesByIds(followUpBatch.cases, ids);
        const cases = selectedCases.length
          ? selectedCases
          : followUpBatch.cases.slice(0, 0); // empty → use refs below
        if (cases.length) {
          const label =
            cases.length < followUpBatch.cases.length
              ? `随访已勾选 · ${cases.length}/${followUpBatch.cases.length} 例`
              : `随访批量 · ${followUpBatch.excelFileName || followUpBatch.zipFileName || "队列"}（${cases.length} 例）`;
          saveClinicalDataset({
            ...buildClinicalDatasetFromFollowUpCases(cases, label),
            id: RESEARCH_COHORT_DATASET_ID,
          });
          if (!cancelled) {
            setBatchCount(cases.length);
            setReady(true);
          }
          return;
        }
        const payload = buildCohortFromBatchRefs(
          ctx.clinical,
          `随访已勾选 · ${ctx.clinical.length} 例`,
        );
        saveClinicalDataset({ ...payload, id: RESEARCH_COHORT_DATASET_ID });
        if (!cancelled) {
          setBatchCount(ctx.clinical.length);
          setReady(true);
        }
        return;
      }

      if (batch?.patients.length) {
        const payload = buildCohortFromBatchRefs(
          batch.patients,
          `科研队列（${batch.patients.length} 例）`,
        );
        saveClinicalDataset({ ...payload, id: RESEARCH_COHORT_DATASET_ID });
        if (!cancelled) {
          setBatchCount(batch.patients.length);
          setReady(true);
        }
        return;
      }

      let existing = getClinicalDataset(RESEARCH_COHORT_DATASET_ID);

      if (!existing?.rows.length && followUpBatch?.cases.length) {
        saveClinicalDataset({
          ...buildClinicalDatasetFromFollowUpCases(
            followUpBatch.cases,
            `随访批量 · ${followUpBatch.excelFileName || followUpBatch.zipFileName || "队列"}`,
          ),
          id: RESEARCH_COHORT_DATASET_ID,
        });
        existing = getClinicalDataset(RESEARCH_COHORT_DATASET_ID);
      }

      if (!existing) {
        saveClinicalDataset({ ...buildDemoPmpCohort(), id: RESEARCH_COHORT_DATASET_ID });
        existing = getClinicalDataset(RESEARCH_COHORT_DATASET_ID);
      }

      if (!cancelled) {
        setBatchCount(existing?.rows.length || 0);
        setReady(true);
      }
    }

    void bootstrap();
    return () => {
      cancelled = true;
    };
  }, [batch]);

  if (!ready) {
    return (
      <div className="pmp-section" style={{ textAlign: "center", padding: 48 }}>
        <Spin tip="加载临床数据…" />
      </div>
    );
  }

  return (
    <ClinicalAnalysisWorkbench
      datasetId={RESEARCH_COHORT_DATASET_ID}
      batchCount={batchCount}
      defaultTab="advanced"
    />
  );
}
