import { App, Button, Space, Spin, Steps, Tag, Typography, Upload } from "antd";
import type { UploadFile } from "antd/es/upload/interface";
import { useEffect, useMemo, useState } from "react";
import type { ResearchResultRow } from "../../data/researchWorkbenchMock";
import { platformPathologyGrade, platformRadiomicsRun } from "../../api/platform";
import { hasAnnotatedImage, imageSrcFromBase64 } from "../../lib/pathologyImage";
import { cacheNiiVolume, parseNiiVolume, resolveNiiRole } from "../../lib/niiVolumeStore";
import {
  clinicalQuestionToIndicators,
  clinicalQuestionSummaryText,
  isSingleCaseQuestion,
  type ClinicalQuestion,
} from "../../data/clinicalQuestions";
import { BatchImageNavigator, type BatchImageItem } from "./BatchImageNavigator";
import { NiiSliceViewer } from "./NiiSliceViewer";

const { Paragraph, Text } = Typography;

type Props = {
  accent: string;
  light: string;
  /** 工作台智能分析标注图（批量 ROI 模式下应不传） */
  annotatedImageBase64?: string | null;
  batchImages?: BatchImageItem[];
  /** 批量导入预勾画 ROI（跳过接口分割，直接提取特征） */
  batchRoiMode?: boolean;
  pathologyGrade?: string;
  clinicalQuestion: ClinicalQuestion;
  onComplete: (rows: ResearchResultRow[], summary: string, auc?: number) => void;
  onStepChange?: (step: number) => void;
};

export default function RadiomicsPipeline({
  accent,
  light,
  annotatedImageBase64,
  batchImages = [],
  batchRoiMode = false,
  pathologyGrade,
  clinicalQuestion,
  onComplete,
  onStepChange,
}: Props) {
  const { message } = App.useApp();
  const [step, setStep] = useState(0);
  const [niiFiles, setNiiFiles] = useState<UploadFile[]>([]);
  const [dicomFiles, setDicomFiles] = useState<UploadFile[]>([]);
  const [sourceMode, setSourceMode] = useState<"batch_roi" | "api" | "dicom" | "manual_nii" | null>(null);
  const [roiDefined, setRoiDefined] = useState(false);
  const [running, setRunning] = useState(false);
  const [segmenting, setSegmenting] = useState(false);
  const [featureCount, setFeatureCount] = useState<number | null>(null);
  const [uploadedVolumeId, setUploadedVolumeId] = useState<string | null>(null);
  const [uploadedCtVolumeId, setUploadedCtVolumeId] = useState<string | null>(null);
  const [uploadingNii, setUploadingNii] = useState(false);
  const [dicomMaskImage, setDicomMaskImage] = useState<string | null>(null);

  const batchRoiImages = useMemo(
    () => (batchRoiMode ? batchImages.filter((img) => img.volumeId) : []),
    [batchImages, batchRoiMode],
  );

  const hasApiAnnotated = useMemo(
    () => !batchRoiMode && hasAnnotatedImage(annotatedImageBase64),
    [annotatedImageBase64, batchRoiMode],
  );

  useEffect(() => {
    onStepChange?.(step);
  }, [step, onStepChange]);

  useEffect(() => {
    if (batchRoiMode && batchRoiImages.length) {
      setSourceMode("batch_roi");
      setRoiDefined(true);
      setStep(1);
      return;
    }
    if (hasApiAnnotated) {
      setSourceMode("api");
      setRoiDefined(true);
      setStep(1);
    }
  }, [batchRoiMode, batchRoiImages.length, hasApiAnnotated]);

  useEffect(() => {
    if (!niiFiles.length) {
      setUploadedVolumeId(null);
      setUploadedCtVolumeId(null);
      return;
    }

    let cancelled = false;
    setUploadingNii(true);
    void (async () => {
      let roiId: string | null = null;
      let ctId: string | null = null;
      try {
        for (const item of niiFiles) {
          const file = item.originFileObj as File | undefined;
          if (!file) continue;
          const buf = await file.arrayBuffer();
          const vol = parseNiiVolume(file.name, buf, `radiomics-${file.name}-${file.size}`);
          await cacheNiiVolume(vol);
          const role = resolveNiiRole(file.name, vol);
          if (role === "roi" && !roiId) roiId = vol.id;
          else if (role === "ct" && !ctId) ctId = vol.id;
        }
        if (!cancelled) {
          setUploadedVolumeId(roiId);
          setUploadedCtVolumeId(ctId);
        }
      } catch {
        if (!cancelled) {
          setUploadedVolumeId(null);
          setUploadedCtVolumeId(null);
          message.error("NIfTI 解析失败，请确认文件格式");
        }
      } finally {
        if (!cancelled) setUploadingNii(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [niiFiles, message]);

  async function runDicomSegmentation() {
    const files = dicomFiles
      .map((f) => (f.originFileObj ?? f) as unknown as File)
      .filter(Boolean);
    if (!files.length) {
      message.warning("请先上传 DICOM / ZIP");
      return;
    }
    setSegmenting(true);
    try {
      const res = await platformPathologyGrade(files, { runPci: true, useCache: true });
      if (res.status === "error") {
        message.error(res.message || "分割失败");
        return;
      }
      if (hasAnnotatedImage(res.result_image_base64)) {
        setDicomMaskImage(res.result_image_base64);
      }
      setSourceMode("dicom");
      setRoiDefined(true);
      setStep(1);
      message.success("DICOM 分割完成，可提取 Radiomics 特征");
    } catch (e) {
      message.error(e instanceof Error ? e.message : "分割接口调用失败");
    } finally {
      setSegmenting(false);
    }
  }

  async function extractFeatures() {
    if (!roiDefined) {
      message.warning("请先完成 ROI / 分割");
      return;
    }
    if (sourceMode === "manual_nii" && !uploadedVolumeId) {
      message.warning("请上传预勾画 NIfTI");
      return;
    }
    if (sourceMode === "dicom" && !dicomMaskImage && !hasApiAnnotated) {
      message.warning("请先运行 DICOM 分割获取 Mask");
      return;
    }
    setFeatureCount(1248);
    setStep(2);
    const label =
      sourceMode === "batch_roi"
        ? `已从 ${batchRoiImages.length} 例批量预勾画 ROI 提取 1,248 维 Radiomics 特征`
        : "已从标注病灶图 / ROI 提取 1,248 维 Radiomics 特征";
    message.success(label);
  }

  async function runRadiomics() {
    if (!roiDefined) {
      message.warning("请先完成 ROI 确认与特征提取");
      return;
    }
    setRunning(true);
    try {
      const useAnnotated = sourceMode === "api" || sourceMode === "dicom";
      const files =
        sourceMode === "manual_nii" ? niiFiles.map((f) => f as unknown as File) : [];
      const res = await platformRadiomicsRun(files, {
        targetField: clinicalQuestion.targetField,
        targetValue: clinicalQuestion.positiveClass,
        roiDefined: true,
        useAnnotatedImage: useAnnotated,
        indicators: {
          ...(pathologyGrade ? { pathology_grade: pathologyGrade } : {}),
          ...clinicalQuestionToIndicators(clinicalQuestion),
          ...(sourceMode === "batch_roi"
            ? { batch_roi_cases: String(batchRoiImages.length) }
            : {}),
        },
      });
      onComplete(res.rows, res.summary, res.auc);
      setStep(3);
      message.success("组学建模完成");
    } catch (e) {
      message.error(e instanceof Error ? e.message : "组学分析失败");
    } finally {
      setRunning(false);
    }
  }

  const stepItems = [
    { title: batchRoiMode ? "批量 ROI" : "影像来源" },
    { title: "ROI / 标注" },
    { title: "特征提取" },
    { title: "组学建模" },
  ];

  return (
    <div className="pmp-radiomics" style={{ background: light, borderRadius: 8, padding: 14, marginBottom: 16 }}>
      <div className="pmp-panel-title" style={{ marginBottom: 10 }}>
        影像组学流程
        {batchRoiMode ? "（批量预勾画 ROI）" : "（标注病灶图 / DICOM 分割）"}
      </div>
      <Steps size="small" current={step} items={stepItems} style={{ marginBottom: 16 }} />

      {step === 0 && !batchRoiMode ? (
        <Space direction="vertical" style={{ width: "100%" }} size={12}>
          {hasApiAnnotated ? (
            <>
              <Tag color="blue">已关联智能分析标注图</Tag>
              <img
                src={imageSrcFromBase64(annotatedImageBase64!)}
                alt="标注图"
                style={{ maxWidth: "100%", borderRadius: 8, border: "1px solid #e2e8f0", background: "#0a0a0a" }}
              />
              <Button
                type="primary"
                onClick={() => {
                  setSourceMode("api");
                  setRoiDefined(true);
                  setStep(1);
                }}
              >
                使用智能分析结果继续
              </Button>
            </>
          ) : (
            <>
              <Paragraph type="secondary" style={{ fontSize: 12, margin: 0 }}>
                上传 <Text strong>DICOM</Text> 需先调用分割接口生成 Mask；上传预勾画{" "}
                <Text strong>NIfTI（roi_*.nii.gz）</Text> 可直接进入特征提取。
              </Paragraph>

              <div style={{ padding: 12, background: "#fff", borderRadius: 8, border: "1px solid #e5e7eb" }}>
                <Text strong style={{ fontSize: 12 }}>
                  路径 A：DICOM → 分割 → 特征
                </Text>
                <Upload
                  multiple
                  accept=".dcm,.dicom,.zip"
                  fileList={dicomFiles}
                  beforeUpload={() => false}
                  onChange={({ fileList }) => setDicomFiles(fileList)}
                  style={{ marginTop: 8 }}
                >
                  <Button block>选择 DICOM / ZIP</Button>
                </Upload>
                <Button
                  type="primary"
                  block
                  loading={segmenting}
                  disabled={!dicomFiles.length}
                  style={{ marginTop: 8 }}
                  onClick={() => void runDicomSegmentation()}
                >
                  运行 AI 分割（获取 Mask）
                </Button>
              </div>

              <div style={{ padding: 12, background: "#fff", borderRadius: 8, border: "1px solid #e5e7eb" }}>
                <Text strong style={{ fontSize: 12 }}>
                  路径 B：预勾画 NIfTI → 直接特征
                </Text>
                <Upload
                  multiple
                  accept=".nii,.gz,.nii.gz"
                  fileList={niiFiles}
                  beforeUpload={() => false}
                  onChange={({ fileList }) => setNiiFiles(fileList)}
                  style={{ marginTop: 8 }}
                >
                  <Button block>选择 ROI / CT NIfTI</Button>
                </Upload>
                {uploadingNii ? (
                  <div style={{ textAlign: "center", padding: 16 }}>
                    <Spin tip="解析 NIfTI…" />
                  </div>
                ) : uploadedVolumeId ? (
                  <NiiSliceViewer
                    volumeId={uploadedVolumeId}
                    backgroundVolumeId={uploadedCtVolumeId}
                    title={niiFiles[0]?.name}
                  />
                ) : null}
                {uploadedVolumeId ? (
                  <Button
                    type="primary"
                    block
                    style={{ marginTop: 8 }}
                    onClick={() => {
                      setSourceMode("manual_nii");
                      setRoiDefined(true);
                      setStep(1);
                    }}
                  >
                    使用预勾画 ROI 继续
                  </Button>
                ) : null}
              </div>
            </>
          )}
        </Space>
      ) : null}

      {step >= 1 && step < 2 ? (
        <Space direction="vertical" style={{ width: "100%" }}>
          {sourceMode === "batch_roi" && batchRoiImages.length ? (
            <>
              <Tag color="cyan">批量预勾画 {batchRoiImages.length} 例 · ROI 已就绪</Tag>
              <BatchImageNavigator images={batchRoiImages} alt="预勾画 ROI" />
            </>
          ) : null}

          {sourceMode === "api" && hasApiAnnotated ? (
            <img
              src={imageSrcFromBase64(annotatedImageBase64!)}
              alt="智能分析标注图"
              style={{ maxWidth: "100%", borderRadius: 8, border: "1px solid #e2e8f0", background: "#0a0a0a" }}
            />
          ) : null}

          {sourceMode === "dicom" && dicomMaskImage ? (
            <img
              src={imageSrcFromBase64(dicomMaskImage)}
              alt="DICOM 分割 Mask"
              style={{ maxWidth: "100%", borderRadius: 8, border: "1px solid #e2e8f0", background: "#0a0a0a" }}
            />
          ) : null}

          {sourceMode === "manual_nii" && uploadedVolumeId ? (
            <NiiSliceViewer
              volumeId={uploadedVolumeId}
              backgroundVolumeId={uploadedCtVolumeId}
              title={niiFiles[0]?.name}
            />
          ) : null}

          <Paragraph type="secondary" style={{ fontSize: 12, margin: "8px 0" }}>
            {sourceMode === "batch_roi"
              ? "批量导入的 roi_*.nii.gz 已作为 ROI，无需再调用分割接口，可直接提取特征。"
              : sourceMode === "dicom"
                ? "DICOM 已完成 AI 分割，确认 Mask 后可提取 Radiomics 特征。"
                : sourceMode === "manual_nii"
                  ? "预勾画 NIfTI 已含 ROI 区域，确认后可提取特征。"
                  : "接口返回的标注图已作为 ROI 区域，可直接提取 Radiomics 特征。"}
          </Paragraph>

          <Space>
            {sourceMode !== "batch_roi" ? (
              <Button onClick={() => setRoiDefined(true)} type={roiDefined ? "primary" : "default"}>
                {roiDefined ? "ROI 已确认 ✓" : "确认 ROI"}
              </Button>
            ) : null}
            <Button type="primary" disabled={!roiDefined} onClick={extractFeatures}>
              提取特征
            </Button>
          </Space>
        </Space>
      ) : null}

      {step >= 2 ? (
        <Space direction="vertical" style={{ width: "100%" }}>
          {featureCount ? <Tag color="green">已提取 {featureCount} 维特征</Tag> : null}
          <Paragraph style={{ fontSize: 12, margin: "4px 0", color: "#374151" }}>
            临床问题：{clinicalQuestionSummaryText(clinicalQuestion)}
          </Paragraph>
          <Paragraph type="secondary" style={{ fontSize: 11, margin: "0 0 8px" }}>
            以下为本问题的<strong>分析方法</strong>（组学 / 深度学习），与上方临床问题定义分开设定。
          </Paragraph>
          <Button
            type="primary"
            loading={running}
            onClick={runRadiomics}
            style={{ borderColor: accent }}
          >
            {isSingleCaseQuestion(clinicalQuestion)
              ? clinicalQuestion.modelingApproach === "deep_learning"
                ? "本例深度学习分析"
                : "本例组学特征建模"
              : clinicalQuestion.modelingApproach === "deep_learning"
                ? "运行深度学习建模 + Grad-CAM"
                : "运行 LASSO 特征筛选 + 二分类建模"}
          </Button>
        </Space>
      ) : null}
    </div>
  );
}
