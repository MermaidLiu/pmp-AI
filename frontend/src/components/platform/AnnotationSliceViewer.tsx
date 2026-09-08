import { LeftOutlined, RightOutlined } from "@ant-design/icons";
import { Button, Empty, Slider, Spin, Typography } from "antd";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { PathologyImagingGradeResult } from "../../api/platform";
import {
  findInitialSlicePosition,
  getSliceManifest,
  getSliceStoreFingerprint,
  platformAnnotationSliceUrl,
} from "../../lib/annotationSlices";
import { hasAnnotatedImage, imageSrcFromBase64 } from "../../lib/pathologyImage";

const { Text } = Typography;

type Props = {
  result: PathologyImagingGradeResult;
  fallbackImageBase64?: string;
};

export function AnnotationSliceViewer({ result, fallbackImageBase64 = "" }: Props) {
  const manifest = useMemo(() => getSliceManifest(result), [result]);
  const fingerprint = useMemo(() => getSliceStoreFingerprint(result), [result]);
  const raw = result.raw as Record<string, unknown> | undefined;

  const initialPos = useMemo(
    () => findInitialSlicePosition(manifest, raw),
    [manifest, raw],
  );

  const [pos, setPos] = useState(initialPos);
  const [imgError, setImgError] = useState(false);
  const [imgLoading, setImgLoading] = useState(false);
  const [retryToken, setRetryToken] = useState(0);

  useEffect(() => {
    setPos(initialPos);
  }, [initialPos, fingerprint]);

  const current = manifest[pos];
  const canBrowse = manifest.length >= 1 && Boolean(fingerprint);
  const singleFallback =
    !canBrowse && hasAnnotatedImage(fallbackImageBase64 || result.result_image_base64);

  const imageUrl = useMemo(() => {
    if (!canBrowse || !current) return "";
    return platformAnnotationSliceUrl(fingerprint, current.index);
  }, [canBrowse, current, fingerprint]);

  const displayUrl = imageUrl ? (retryToken ? `${imageUrl}?t=${retryToken}` : imageUrl) : "";

  useEffect(() => {
    if (!imageUrl) return;
    setImgError(false);
    setImgLoading(true);
    setRetryToken(0);
  }, [imageUrl]);

  useEffect(() => {
    if (!imgError || !canBrowse || !current || retryToken >= 12) return;
    const timer = window.setTimeout(() => {
      setImgError(false);
      setImgLoading(true);
      setRetryToken((t) => t + 1);
    }, 1500);
    return () => window.clearTimeout(timer);
  }, [imgError, canBrowse, current, retryToken]);

  const goPrev = useCallback(() => {
    setPos((p) => Math.max(0, p - 1));
  }, []);

  const goNext = useCallback(() => {
    setPos((p) => Math.min(manifest.length - 1, p + 1));
  }, [manifest.length]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "ArrowLeft") goPrev();
      if (e.key === "ArrowRight") goNext();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [goPrev, goNext]);

  if (!canBrowse && !singleFallback) {
    return <Empty description="合并接口未返回分割图" image={Empty.PRESENTED_IMAGE_SIMPLE} />;
  }

  if (!canBrowse && singleFallback) {
    const b64 = fallbackImageBase64 || result.result_image_base64;
    return (
      <div className="pmp-annotation-viewer">
        <div className="pmp-diagnosis-image-wrap">
          <img src={imageSrcFromBase64(b64)} alt="CT 分割勾画图" />
        </div>
      </div>
    );
  }

  return (
    <div className="pmp-annotation-viewer">
      <div className="pmp-annotation-viewer-stage">
        <Button
          type="text"
          className="pmp-annotation-viewer-nav pmp-annotation-viewer-nav--left"
          icon={<LeftOutlined />}
          disabled={pos <= 0}
          onClick={goPrev}
          aria-label="上一张"
        />
        <div className="pmp-diagnosis-image-wrap pmp-annotation-viewer-image">
          {imgLoading && !imgError ? (
            <div className="pmp-annotation-viewer-loading">
              <Spin tip="加载标注图…" />
            </div>
          ) : null}
          {imgError ? (
            <Empty description="切片加载中，后台正在写入缓存…" image={Empty.PRESENTED_IMAGE_SIMPLE} />
          ) : (
            <img
              src={displayUrl}
              alt={`标注切片 ${current?.filename || current?.index}`}
              onLoad={() => setImgLoading(false)}
              onError={() => {
                setImgLoading(false);
                setImgError(true);
              }}
            />
          )}
        </div>
        <Button
          type="text"
          className="pmp-annotation-viewer-nav pmp-annotation-viewer-nav--right"
          icon={<RightOutlined />}
          disabled={pos >= manifest.length - 1}
          onClick={goNext}
          aria-label="下一张"
        />
      </div>

      <div className="pmp-annotation-viewer-controls">
        <Text type="secondary" style={{ fontSize: 12 }}>
          {current?.filename || `切片 ${current?.index ?? "—"}`}
          {current?.sc != null ? ` · sc ${current.sc}` : ""}
          {current?.region != null ? ` · 区域 ${current.region}` : ""}
        </Text>
        <div className="pmp-annotation-viewer-slider">
          <Text style={{ fontSize: 12, minWidth: 72 }}>
            {pos + 1} / {manifest.length}
          </Text>
          <Slider
            min={0}
            max={Math.max(0, manifest.length - 1)}
            value={pos}
            onChange={setPos}
            tooltip={{ formatter: (v) => manifest[v ?? 0]?.filename || `第 ${(v ?? 0) + 1} 层` }}
          />
        </div>
      </div>
    </div>
  );
}
