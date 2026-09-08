import type { FollowUpBatchImportResult } from "../../lib/followUpBatchImport";
import ResearchBatchImportPanel from "./ResearchBatchImportPanel";

type Props = {
  onImported?: (result: FollowUpBatchImportResult) => void;
};

export default function FollowUpBatchImportPanel(props: Props) {
  return <ResearchBatchImportPanel variant="followup" {...props} />;
}
