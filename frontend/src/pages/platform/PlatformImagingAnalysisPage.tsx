import { useMemo } from "react";
import ImagingAgentWorkbench from "../../components/platform/ImagingAgentWorkbench";
import { IMAGING_INDICATOR_SPECS } from "../../data/indicatorSpecs";
import {
  IMAGING_FIELDS,
  IMAGING_METHODS,
  IMAGING_RESULTS,
  IMAGING_TASKS,
} from "../../data/researchWorkbenchMock";
import { consumeBatchSelection } from "../../lib/platformBatchSelection";
import { getResearchBatchPatients } from "../../lib/researchBatchContext";
import { getPathologyImagingOrNull } from "../../lib/platformSession";

export default function PlatformImagingAnalysisPage() {
  const batch = useMemo(() => {
    const fromResearch = getResearchBatchPatients("imaging");
    if (fromResearch.length) return { patients: fromResearch };
    return consumeBatchSelection("radiomics");
  }, []);

  const batchPatients = batch?.patients ?? [];
  const batchHasPresegRoi = batchPatients.some((p) => p.niiVolumeId);
  const pathology = batchHasPresegRoi ? null : getPathologyImagingOrNull();

  const pathologyGrade =
    batchPatients.find((p) => p.gradeLabel)?.gradeLabel ?? pathology?.grade_label;

  return (
    <ImagingAgentWorkbench
      batchPatients={batchPatients}
      batchRoiMode={batchHasPresegRoi}
      radiomicsAnnotatedImage={pathology?.result_image_base64}
      radiomicsPathologyGrade={pathologyGrade}
    />
  );
}
