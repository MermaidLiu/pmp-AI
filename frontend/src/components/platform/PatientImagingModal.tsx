import { EyeOutlined } from "@ant-design/icons";
import { Empty, Modal, Spin, Tabs, Typography } from "antd";
import { useEffect, useState } from "react";
import type { PlatformPatient } from "../../api/platform";
import ImagingViewer from "./ImagingViewer";
import { NiiSliceViewer } from "./NiiSliceViewer";
import { getFollowUpBatchCase } from "../../lib/followUpBatchStore";
import { imageSrcFromBase64, hasAnnotatedImage } from "../../lib/pathologyImage";
import { loadPathologyImage } from "../../lib/pathologyImagingCache";

const { Text, Paragraph } = Typography;

type Props = {
  open: boolean;
  patient: PlatformPatient | null;
  onClose: () => void;
};

export default function PatientImagingModal({ open, patient, onClose }: Props) {
  const [segImage, setSegImage] = useState("");
  const [loadingImage, setLoadingImage] = useState(false);

  useEffect(() => {
    if (!open || !patient?.examId) {
      setSegImage("");
      return;
    }
    let cancelled = false;
    setLoadingImage(true);
    void loadPathologyImage(patient.examId).then((img) => {
      if (!cancelled) {
        setSegImage(img || "");
        setLoadingImage(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [open, patient?.examId]);

  if (!patient) return null;

  const batchCase = getFollowUpBatchCase(patient.id) || getFollowUpBatchCase(patient.admissionId || "");

  const metaLines = [
    patient.gradeLabel && patient.gradeLabel !== "—" ? `病理分级：${patient.gradeLabel}` : "",
    patient.treatmentMethod && patient.treatmentMethod !== "—" ? `治疗方式：${patient.treatmentMethod}` : "",
    patient.surgeryNumber && patient.surgeryNumber !== "—" ? `第几次手术：${patient.surgeryNumber}` : "",
    patient.ivChemotherapy && patient.ivChemotherapy !== "—" ? `静脉化疗：${patient.ivChemotherapy}` : "",
    patient.pciScore != null ? `PCI：${patient.pciScore}/36` : "",
    patient.ccScore && patient.ccScore !== "—" ? `CC：${patient.ccScore}` : "",
  ].filter(Boolean);

  const tabs = [
    {
      key: "viewer",
      label: "DICOM 浏览",
      children: (
        <ImagingViewer
          modality={patient.modality || "CT"}
          bodyPart="腹盆"
          dicomCount={patient.dicomCount || 48}
        />
      ),
    },
    {
      key: "seg",
      label: batchCase?.niiVolumeId ? "预勾画 NIfTI" : "AI 分割",
      children: batchCase?.niiVolumeId ? (
        <NiiSliceViewer
          volumeId={batchCase.niiVolumeId}
          backgroundVolumeId={batchCase.ctVolumeId}
          title={batchCase.niiFileName || ""}
        />
      ) : loadingImage ? (
        <div style={{ textAlign: "center", padding: 48 }}>
          <Spin tip="加载分割图…" />
        </div>
      ) : hasAnnotatedImage(segImage) ? (
        <div style={{ textAlign: "center" }}>
          <img
            src={imageSrcFromBase64(segImage)}
            alt="分割勾画"
            style={{ maxWidth: "100%", maxHeight: 480, borderRadius: 8, border: "1px solid #e2e8f0" }}
          />
        </div>
      ) : (
        <Empty description="暂无分割图，请先在智能分析页完成 DICOM 分析" />
      ),
    },
  ];

  return (
    <Modal
      title={`影像查看 · ${patient.name}（${patient.id}）`}
      open={open}
      onCancel={onClose}
      footer={null}
      width={920}
      destroyOnClose
    >
      {metaLines.length ? (
        <Paragraph type="secondary" style={{ marginBottom: 12, fontSize: 13 }}>
          {metaLines.join(" · ")}
        </Paragraph>
      ) : null}
      {patient.imagingSummary ? (
        <Text type="secondary" style={{ fontSize: 12, display: "block", marginBottom: 12 }}>
          {patient.imagingSummary}
        </Text>
      ) : null}
      <Tabs items={tabs} />
    </Modal>
  );
}

export function ImagingViewButton({
  patient,
  onView,
}: {
  patient: PlatformPatient;
  onView: (p: PlatformPatient) => void;
}) {
  return (
    <a
      onClick={(e) => {
        e.preventDefault();
        onView(patient);
      }}
      style={{ fontSize: 12 }}
    >
      <EyeOutlined /> 查看
    </a>
  );
}
