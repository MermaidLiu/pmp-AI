import { DownOutlined, UpOutlined } from "@ant-design/icons";
import { Button, Empty, Spin, Typography } from "antd";
import { useCallback, useEffect, useState } from "react";
import {
  loadNiiVolume,
  niiSliceToDataUrl,
  niiSliceToOverlayDataUrl,
  type NiiVolume,
} from "../../lib/niiVolumeStore";

const { Text } = Typography;

type Props = {
  volumeId: string;
  /** CT 底图体积 ID，与 ROI mask 叠加显示 */
  backgroundVolumeId?: string | null;
  title?: string;
};

export function NiiSliceViewer({ volumeId, backgroundVolumeId, title }: Props) {
  const [volume, setVolume] = useState<NiiVolume | null>(null);
  const [background, setBackground] = useState<NiiVolume | null>(null);
  const [pos, setPos] = useState(0);
  const [imgUrl, setImgUrl] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void (async () => {
      const v = await loadNiiVolume(volumeId);
      const bg = backgroundVolumeId ? await loadNiiVolume(backgroundVolumeId) : null;
      if (!cancelled) {
        setVolume(v);
        setBackground(bg);
        setPos(v ? v.bestSlice : 0);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [volumeId, backgroundVolumeId]);

  useEffect(() => {
    if (!volume) return;
    if (background && !background.isMask) {
      setImgUrl(niiSliceToOverlayDataUrl(volume, background, pos));
    } else {
      setImgUrl(niiSliceToDataUrl(volume, pos));
    }
  }, [volume, background, pos]);

  const goPrev = useCallback(() => setPos((p) => Math.max(0, p - 1)), []);
  const goNext = useCallback(() => {
    setPos((p) => Math.min((volume?.sliceCount ?? 1) - 1, p + 1));
  }, [volume?.sliceCount]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "ArrowUp") goPrev();
      if (e.key === "ArrowDown") goNext();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [goPrev, goNext]);

  if (loading) {
    return (
      <div style={{ textAlign: "center", padding: 48 }}>
        <Spin tip="加载 NIfTI…" />
      </div>
    );
  }

  if (!volume) {
    return <Empty description="NIfTI 体积未找到" image={Empty.PRESENTED_IMAGE_SIMPLE} />;
  }

  const hasCtOverlay = Boolean(background && !background.isMask);

  return (
    <div className="pmp-nii-viewer">
      <div className="pmp-nii-viewer-stage">
        <Button
          type="text"
          className="pmp-batch-image-nav-btn pmp-batch-image-nav-btn--up"
          icon={<UpOutlined />}
          disabled={pos <= 0}
          onClick={goPrev}
          aria-label="上一层"
        />
        <div className="pmp-diagnosis-image-wrap pmp-nii-viewer-image">
          {imgUrl ? <img src={imgUrl} alt={title || volume.name} /> : null}
        </div>
        <Button
          type="text"
          className="pmp-batch-image-nav-btn pmp-batch-image-nav-btn--down"
          icon={<DownOutlined />}
          disabled={pos >= volume.sliceCount - 1}
          onClick={goNext}
          aria-label="下一层"
        />
      </div>
      <div className="pmp-batch-image-nav-meta">
        <Text type="secondary" style={{ fontSize: 12 }}>
          {volume.name}
          {hasCtOverlay && background ? ` + ${background.name}` : ""}
          {" · "}轴位 {pos + 1} / {volume.sliceCount} · {volume.dims[0]}×{volume.dims[1]}
          {volume.isMask ? (hasCtOverlay ? " · CT + 勾画" : " · 预勾画") : ""}
        </Text>
      </div>
    </div>
  );
}
