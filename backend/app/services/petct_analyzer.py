"""PET-CT 量化分析：MONAI 3D 分割（可选）+ SUV/MTV/TLG 指标计算骨架。"""

from __future__ import annotations

from pathlib import Path
from typing import Any

import numpy as np

from app.core.config import settings
from app.models.domain import PetCtAnalysisResult, PetCtImageMetrics


def _try_load_monai_segresnet(model_path: Path, device: str):
    import torch
    from monai.networks.nets import SegResNet

    net = SegResNet(
        spatial_dims=3,
        in_channels=2,
        out_channels=1,
        dropout_prob=0.2,
    )
    if model_path.is_file():
        try:
            state = torch.load(model_path, map_location=device, weights_only=False)
        except TypeError:
            state = torch.load(model_path, map_location=device)
        if isinstance(state, dict) and "state_dict" in state:
            state = state["state_dict"]
        net.load_state_dict(state, strict=False)
    net.eval()
    net.to(device)
    return net, torch


class PETCTAnalyzer:
    def __init__(self, model_path: str | None = None) -> None:
        self.model_path = Path(model_path or settings.petct_model_path)
        self._model = None
        self._torch = None
        self._device = "cpu"
        self._init_model()

    def _init_model(self) -> None:
        try:
            import torch

            self._device = "cuda" if torch.cuda.is_available() else "cpu"
            self._model, self._torch = _try_load_monai_segresnet(self.model_path, self._device)
        except Exception:
            self._model = None
            self._torch = None

    def _preprocess(self, pet: np.ndarray, ct: np.ndarray) -> Any:
        """Resize/pad to network input; placeholder — align with training pipeline in production."""
        if self._torch is None:
            return None
        torch = self._torch
        # Expect 5D input (B, C, D, H, W)
        pet_t = torch.from_numpy(pet.astype(np.float32)).unsqueeze(0).unsqueeze(0)
        ct_t = torch.from_numpy(ct.astype(np.float32)).unsqueeze(0).unsqueeze(0)
        x = torch.cat([pet_t, ct_t], dim=1)
        return x.to(self._device)

    def _extract_metrics(
        self,
        pet_volume: np.ndarray,
        seg_mask: np.ndarray,
        voxel_volume_ml: float = 1.0,
    ) -> PetCtImageMetrics:
        """SUV 假定 pet_volume 已为 SUV 体素；MTV = 掩膜体积；TLG = mean(SUV in mask) * MTV。"""
        mask = seg_mask > 0.5
        if not np.any(mask):
            return PetCtImageMetrics(suv_max=None, suv_mean=None, mtv=None, tlg=None)
        vals = pet_volume[mask]
        suv_max = float(np.max(vals))
        suv_mean = float(np.mean(vals))
        vox_ml = float(voxel_volume_ml)
        mtv = float(np.sum(mask) * vox_ml)
        tlg = float(suv_mean * mtv)
        return PetCtImageMetrics(suv_max=suv_max, suv_mean=suv_mean, mtv=mtv, tlg=tlg)

    def _generate_report(self, metrics: PetCtImageMetrics) -> str:
        parts = []
        if metrics.suv_max is not None:
            parts.append(f"SUVmax = {metrics.suv_max:.2f}")
        if metrics.suv_mean is not None:
            parts.append(f"SUVmean = {metrics.suv_mean:.2f}")
        if metrics.mtv is not None:
            parts.append(f"MTV ≈ {metrics.mtv:.2f} mL")
        if metrics.tlg is not None:
            parts.append(f"TLG ≈ {metrics.tlg:.2f}")
        if not parts:
            return "未获得有效分割掩膜或 PET 体数据；请检查输入维度与模型权重。"
        return "；".join(parts) + "。"

    def analyze_image(self, petct_data: dict[str, Any]) -> dict[str, Any]:
        """
        ``petct_data`` 可包含:
        - ``pet`` / ``ct``: numpy 可序列化 list 或 .npy 路径
        - ``voxel_volume_ml``: 单个体素体积 (mL)
        """
        pet, ct = self._load_volumes(petct_data)
        seg_available = self._model is not None and pet is not None and ct is not None

        seg_result: np.ndarray | None = None
        if seg_available:
            assert self._torch is not None
            x = self._preprocess(pet, ct)
            if x is not None:
                with self._torch.no_grad():
                    logits = self._model(x)
                    prob = self._torch.sigmoid(logits)
                    seg_result = prob.squeeze().cpu().numpy()

        if seg_result is not None and pet is not None:
            # 若尺寸不一致，使用 PET 原始尺寸上的简单对齐占位：取中心 crop
            if seg_result.shape != pet.shape:
                seg_result = self._center_crop_or_resize_mask(seg_result, pet.shape)
            vox = float(petct_data.get("voxel_volume_ml") or 1.0)
            metrics = self._extract_metrics(pet, seg_result, voxel_volume_ml=vox)
            report = self._generate_report(metrics)
            out = PetCtAnalysisResult(
                quantitative_metrics=metrics,
                image_report=report,
                segmentation_available=True,
                notes="MONAI SegResNet 推理完成（权重存在时加载）。",
            )
        elif pet is not None:
            # 无模型：全图粗略统计（非分割）
            metrics = PetCtImageMetrics(
                suv_max=float(np.max(pet)),
                suv_mean=float(np.mean(pet)),
                mtv=None,
                tlg=None,
            )
            out = PetCtAnalysisResult(
                quantitative_metrics=metrics,
                image_report=self._generate_report(metrics).replace("None", "N/A")
                or f"PET 体素最大值 {metrics.suv_max:.2f}，均值 {metrics.suv_mean:.2f}（无分割掩膜）。",
                segmentation_available=False,
                notes="未加载分割模型或 CT 缺失；仅返回 PET 全图描述性统计。",
            )
        else:
            out = PetCtAnalysisResult(
                quantitative_metrics=PetCtImageMetrics(
                    suv_max=12.5, suv_mean=8.2, mtv=15.3, tlg=125.6
                ),
                image_report="演示占位指标；请上传 pet/ct 数组或配置模型路径。",
                segmentation_available=False,
                notes="未提供 pet 体积数据，返回占位示例。",
            )

        return out.model_dump()

    def _load_volumes(self, petct_data: dict[str, Any]) -> tuple[np.ndarray | None, np.ndarray | None]:
        pet = petct_data.get("pet")
        ct = petct_data.get("ct")
        pet_arr = self._to_array(pet)
        ct_arr = self._to_array(ct)
        return pet_arr, ct_arr

    def _to_array(self, val: Any) -> np.ndarray | None:
        if val is None:
            return None
        if isinstance(val, str) and val.endswith(".npy"):
            return np.load(val)
        if isinstance(val, list):
            return np.asarray(val, dtype=np.float32)
        if isinstance(val, np.ndarray):
            return val.astype(np.float32, copy=False)
        return None

    def _center_crop_or_resize_mask(self, mask: np.ndarray, target_shape: tuple[int, ...]) -> np.ndarray:
        """Minimal alignment: center-crop mask to target_shape (demo only)."""
        out = np.zeros(target_shape, dtype=np.float32)
        src = mask
        slices_src: list[slice] = []
        slices_dst: list[slice] = []
        rank = min(len(src.shape), len(target_shape))
        for i in range(rank):
            dim_s, dim_t = int(src.shape[i]), int(target_shape[i])
            if dim_s >= dim_t:
                start = (dim_s - dim_t) // 2
                slices_src.append(slice(start, start + dim_t))
                slices_dst.append(slice(0, dim_t))
            else:
                start = (dim_t - dim_s) // 2
                slices_src.append(slice(0, dim_s))
                slices_dst.append(slice(start, start + dim_s))
        out[tuple(slices_dst)] = src[tuple(slices_src)]
        return out
