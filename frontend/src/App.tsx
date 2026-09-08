import { Navigate, Route, Routes } from "react-router-dom";
import PlatformLayout from "./layouts/PlatformLayout";
import BasicLayout from "./layouts/BasicLayout";
import { QuotaGateListener } from "./components/platform/QuotaGateListener";
import DashboardHome from "./pages/DashboardHome";
import AccountBillingPage from "./pages/platform/AccountBillingPage";
import AccountLoginPage from "./pages/platform/AccountLoginPage";
import PlatformChatPage from "./pages/platform/PlatformChatPage";
import PlatformHomePage from "./pages/platform/PlatformHomePage";
import PlatformClinicalAnalysisPage from "./pages/platform/PlatformClinicalAnalysisPage";
import PlatformImagingAnalysisPage from "./pages/platform/PlatformImagingAnalysisPage";
import PlatformKnowledgeLibraryPage from "./pages/platform/PlatformKnowledgeLibraryPage";
import PlatformMultimodalAnalysisPage from "./pages/platform/PlatformMultimodalAnalysisPage";
import PlatformPatientDbPage from "./pages/platform/PlatformPatientDbPage";
import PlatformSettingsPage from "./pages/platform/PlatformSettingsPage";
import PlatformResearchDataHubPage from "./pages/platform/PlatformResearchDataHubPage";
import PlatformResearchExtensionPage from "./pages/platform/PlatformResearchExtensionPage";
import PlatformResearchPublicationPage from "./pages/platform/PlatformResearchPublicationPage";
import PlatformResearchPptPage from "./pages/platform/PlatformResearchPptPage";
import PlatformFollowUpPage from "./pages/platform/PlatformFollowUpPage";
import PlatformWorkflowPage from "./pages/platform/PlatformWorkflowPage";
import PlatformAssistedDiagnosisPage from "./pages/platform/PlatformAssistedDiagnosisPage";
import PlatformOmicsPage from "./pages/platform/PlatformOmicsPage";

/** 旧版模块入口（保留兼容，不在主导航展示） */
import ModuleCohort from "./pages/ModuleCohort";
import ModuleIngestion from "./pages/ModuleIngestion";
import ModuleKnowledge from "./pages/ModuleKnowledge";
import ModuleOutputs from "./pages/ModuleOutputs";
import ModulePathology from "./pages/ModulePathology";
import ModuleTreatment from "./pages/ModuleTreatment";

export default function App() {
  return (
    <>
      <QuotaGateListener />
      <Routes>
        <Route path="/account/login" element={<AccountLoginPage />} />
        <Route path="/account/billing" element={<AccountBillingPage />} />

        <Route path="/" element={<PlatformLayout />}>
          <Route index element={<PlatformHomePage />} />
          <Route path="chat" element={<PlatformChatPage />} />
          <Route path="workflow" element={<PlatformWorkflowPage />} />
          <Route path="assisted-diagnosis" element={<PlatformAssistedDiagnosisPage />} />
          <Route path="db/patients" element={<PlatformPatientDbPage />} />
          <Route path="db/clinical" element={<Navigate to="/knowledge/data/clinical" replace />} />
          <Route path="db/clinical/:id" element={<Navigate to="/knowledge/data/clinical" replace />} />
          <Route path="db/imaging" element={<Navigate to="/db/patients" replace />} />
          <Route path="db/pathology" element={<Navigate to="/db/patients" replace />} />
          <Route path="db/follow-up" element={<PlatformFollowUpPage />} />
          <Route path="db/genetics" element={<Navigate to="/db/patients" replace />} />
          <Route path="db/literature" element={<Navigate to="/knowledge/library" replace />} />
          <Route path="analysis" element={<Navigate to="/workflow?step=diagnosis" replace />} />
          <Route path="analysis/diagnosis" element={<Navigate to="/workflow?step=diagnosis" replace />} />
          <Route path="analysis/treatment" element={<Navigate to="/workflow?step=diagnosis" replace />} />
          <Route path="analysis/prognosis" element={<Navigate to="/workflow?step=diagnosis" replace />} />
          <Route path="analysis/cohort" element={<Navigate to="/db/patients" replace />} />
          <Route path="knowledge" element={<PlatformResearchExtensionPage />} />
          <Route path="knowledge/data" element={<PlatformResearchDataHubPage />} />
          <Route path="knowledge/data/clinical" element={<PlatformClinicalAnalysisPage />} />
          <Route path="knowledge/data/imaging" element={<PlatformImagingAnalysisPage />} />
          <Route path="knowledge/data/multimodal" element={<PlatformMultimodalAnalysisPage />} />
          <Route path="knowledge/omics" element={<PlatformOmicsPage />} />
          <Route path="knowledge/library" element={<PlatformKnowledgeLibraryPage />} />
          <Route path="knowledge/publications" element={<PlatformResearchPublicationPage />} />
          <Route path="knowledge/ppt" element={<PlatformResearchPptPage />} />
          <Route path="settings" element={<PlatformSettingsPage />} />
        </Route>

        <Route path="/legacy" element={<BasicLayout />}>
          <Route index element={<DashboardHome />} />
          <Route path="ingestion" element={<ModuleIngestion />} />
          <Route path="pathology" element={<ModulePathology />} />
          <Route path="treatment" element={<ModuleTreatment />} />
          <Route path="cohort" element={<ModuleCohort />} />
          <Route path="knowledge" element={<ModuleKnowledge />} />
          <Route path="outputs" element={<ModuleOutputs />} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  );
}
