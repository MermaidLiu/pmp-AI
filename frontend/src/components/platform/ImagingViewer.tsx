import { LeftOutlined, RightOutlined, ZoomInOutlined, ZoomOutOutlined } from "@ant-design/icons";
import { Button, Select, Slider, Space, Typography } from "antd";
import { useCallback, useEffect, useRef, useState } from "react";

const { Text } = Typography;

type Series = { id: string; name: string; sliceCount: number; seed: number };

type Props = {
  modality: string;
  bodyPart: string;
  dicomCount: number;
  series?: Series[];
};

const DEFAULT_SERIES: Series[] = [
  { id: "ax", name: "轴位", sliceCount: 48, seed: 11 },
  { id: "cor", name: "冠状", sliceCount: 36, seed: 23 },
  { id: "sag", name: "矢状", sliceCount: 36, seed: 37 },
];

/** 根据 seed 与层号绘制可交互的灰度切片（演示用，支持窗宽窗位与翻页） */
function drawSlice(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  slice: number,
  total: number,
  seed: number,
  windowCenter: number,
  windowWidth: number,
) {
  const img = ctx.createImageData(w, h);
  const cx = w * 0.52;
  const cy = h * 0.48;
  const lesionR = 28 + (seed % 12);
  const t = slice / total;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const dx = x - cx;
      const dy = y - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      let v =
        95 +
        Math.sin(x * 0.08 + seed) * 8 +
        Math.cos(y * 0.06 + seed * 0.7) * 6 +
        ((x * 17 + y * 31 + seed * 13) % 17) -
        8;

      if (dist < lesionR) v += 55 * (1 - dist / lesionR);
      if (Math.abs(y - h * (0.35 + t * 0.3)) < 2) v += 40;
      if (Math.abs(x - w * 0.5) < 1) v += 25;

      const lo = windowCenter - windowWidth / 2;
      const hi = windowCenter + windowWidth / 2;
      v = Math.max(lo, Math.min(hi, v));
      const g = Math.round(((v - lo) / (hi - lo)) * 255);
      img.data[i] = g;
      img.data[i + 1] = g;
      img.data[i + 2] = g;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
}

export default function ImagingViewer({ modality, bodyPart, dicomCount, series = DEFAULT_SERIES }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [activeSeries, setActiveSeries] = useState(series[0].id);
  const [slice, setSlice] = useState(1);
  const [windowCenter, setWindowCenter] = useState(128);
  const [windowWidth, setWindowWidth] = useState(256);
  const [zoom, setZoom] = useState(1);

  const current = series.find((s) => s.id === activeSeries) ?? series[0];
  const maxSlice = current.sliceCount;

  const render = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    drawSlice(ctx, canvas.width, canvas.height, slice, maxSlice, current.seed, windowCenter, windowWidth);
  }, [slice, maxSlice, current.seed, windowCenter, windowWidth]);

  useEffect(() => {
    render();
  }, [render]);

  useEffect(() => {
    setSlice(Math.min(slice, maxSlice));
  }, [activeSeries, maxSlice, slice]);

  return (
    <div>
      <Space wrap style={{ marginBottom: 10 }}>
        <Select
          size="small"
          value={activeSeries}
          style={{ width: 100 }}
          options={series.map((s) => ({ value: s.id, label: s.name }))}
          onChange={(v) => {
            setActiveSeries(v);
            setSlice(1);
          }}
        />
        <Text type="secondary" style={{ fontSize: 12 }}>
          {modality} · {bodyPart} · 共 {dicomCount} 张 DICOM
        </Text>
      </Space>

      <div
        style={{
          background: "#0a0a0a",
          borderRadius: 8,
          padding: 8,
          display: "flex",
          justifyContent: "center",
          overflow: "auto",
        }}
      >
        <canvas
          ref={canvasRef}
          width={384}
          height={384}
          style={{
            width: 384 * zoom,
            height: 384 * zoom,
            imageRendering: "pixelated",
            cursor: "crosshair",
          }}
        />
      </div>

      <div style={{ marginTop: 12 }}>
        <Space style={{ width: "100%", justifyContent: "space-between", marginBottom: 8 }}>
          <Button
            size="small"
            icon={<LeftOutlined />}
            disabled={slice <= 1}
            onClick={() => setSlice((s) => Math.max(1, s - 1))}
          />
          <Text style={{ fontSize: 12 }}>
            层 {slice} / {maxSlice}
          </Text>
          <Button
            size="small"
            icon={<RightOutlined />}
            disabled={slice >= maxSlice}
            onClick={() => setSlice((s) => Math.min(maxSlice, s + 1))}
          />
        </Space>
        <Slider min={1} max={maxSlice} value={slice} onChange={setSlice} tooltip={{ formatter: (v) => `第 ${v} 层` }} />

        <Space wrap style={{ marginTop: 8, width: "100%" }}>
          <Text type="secondary" style={{ fontSize: 11, width: 56 }}>
            窗位
          </Text>
          <Slider style={{ width: 120 }} min={40} max={200} value={windowCenter} onChange={setWindowCenter} />
          <Text type="secondary" style={{ fontSize: 11, width: 56 }}>
            窗宽
          </Text>
          <Slider style={{ width: 120 }} min={80} max={400} value={windowWidth} onChange={setWindowWidth} />
          <Button size="small" icon={<ZoomOutOutlined />} onClick={() => setZoom((z) => Math.max(0.75, z - 0.25))} />
          <Button size="small" icon={<ZoomInOutlined />} onClick={() => setZoom((z) => Math.min(2, z + 0.25))} />
        </Space>
      </div>
    </div>
  );
}
