import { DownOutlined, UpOutlined } from "@ant-design/icons";
import { Button, Empty, Typography } from "antd";
import { useCallback, useEffect, useState } from "react";
import { hasAnnotatedImage, imageSrcFromBase64 } from "../../lib/pathologyImage";
import { NiiSliceViewer } from "./NiiSliceViewer";

const { Text } = Typography;

export type BatchImageItem = {
  id: string;
  label: string;
  base64: string;
  meta?: string;
  /** 本地缓存的 NIfTI 体积 ID（预勾画上传） */
  volumeId?: string;
  /** CT 底图 NIfTI */
  backgroundVolumeId?: string;
};

type Props = {
  images: BatchImageItem[];
  fallbackBase64?: string | null;
  alt?: string;
};

export function BatchImageNavigator({ images, fallbackBase64, alt = "标注病灶图" }: Props) {
  const gallery = images.filter((img) => img.volumeId || hasAnnotatedImage(img.base64));
  const [pos, setPos] = useState(0);

  useEffect(() => {
    setPos(0);
  }, [images]);

  const goPrev = useCallback(() => {
    setPos((p) => Math.max(0, p - 1));
  }, []);

  const goNext = useCallback(() => {
    setPos((p) => Math.min(gallery.length - 1, p + 1));
  }, [gallery.length]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (gallery.length <= 1) return;
      if (e.key === "ArrowLeft") goPrev();
      if (e.key === "ArrowRight") goNext();
      // 无 NIfTI 时仍可用 ↑/↓ 切换病例（兼容旧交互）
      const currentHasNii = gallery[pos]?.volumeId;
      if (!currentHasNii) {
        if (e.key === "ArrowUp") goPrev();
        if (e.key === "ArrowDown") goNext();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [goPrev, goNext, gallery, pos]);

  const single = gallery.length <= 1;
  const current = gallery[pos];
  const displayB64 = current?.base64 || fallbackBase64 || "";
  const hasNii = Boolean(current?.volumeId);

  if (!hasNii && !hasAnnotatedImage(displayB64)) {
    return <Empty description="暂无标注图" image={Empty.PRESENTED_IMAGE_SIMPLE} />;
  }

  return (
    <div className="pmp-batch-image-nav">
      <div className="pmp-batch-image-nav-stage">
        {!single ? (
          <Button
            type="text"
            className="pmp-batch-image-nav-btn pmp-batch-image-nav-btn--up"
            icon={<UpOutlined />}
            disabled={pos <= 0}
            onClick={goPrev}
            aria-label="上一张"
          />
        ) : null}
        <div className="pmp-diagnosis-image-wrap pmp-batch-image-nav-image">
          {hasNii && current?.volumeId ? (
            <NiiSliceViewer
              volumeId={current.volumeId}
              backgroundVolumeId={current.backgroundVolumeId}
              title={current.label}
            />
          ) : (
            <img src={imageSrcFromBase64(displayB64)} alt={alt} />
          )}
        </div>
        {!single ? (
          <Button
            type="text"
            className="pmp-batch-image-nav-btn pmp-batch-image-nav-btn--down"
            icon={<DownOutlined />}
            disabled={pos >= gallery.length - 1}
            onClick={goNext}
            aria-label="下一张"
          />
        ) : null}
      </div>
      {!single && current ? (
        <div className="pmp-batch-image-nav-meta">
          <Text type="secondary" style={{ fontSize: 12 }}>
            {current.label}
            {current.meta ? ` · ${current.meta}` : ""} · {pos + 1} / {gallery.length}
            {current.volumeId ? " · ← / → 切换病例 · ↑ / ↓ 翻阅轴位" : ""}
          </Text>
        </div>
      ) : null}
    </div>
  );
}
