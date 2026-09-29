"""Local CT lesion segmentation inference (MONAI U-Net 2D trained weights)."""

from __future__ import annotations

from pathlib import Path
from typing import Any

import numpy as np

from app.core.config import settings
from app.services.ct_ml_dataset import _window_hu, dicom_bytes_to_hu


def _load_unet(model_path: Path, device: str):
    import torch
    from monai.networks.nets import UNet

    ckpt = torch.load(model_path, map_location=device, weights_only=False)
    image_size = int(ckpt.get("image_size") or 256)
    net = UNet(
        spatial_dims=2,
        in_channels=1,
        out_channels=1,
        channels=(16, 32, 64, 128, 256),
        strides=(2, 2, 2, 2),
        num_res_units=2,
    )
    state = ckpt.get("state_dict") or ckpt
    net.load_state_dict(state, strict=False)
    net.eval()
    net.to(device)
    return net, torch, image_size


def predict_mask_from_hu(hu: np.ndarray, *, model_path: str | None = None) -> np.ndarray | None:
    """Return binary mask (H,W) aligned to input HU slice, or None if model missing."""
    path = Path(model_path or settings.ct_seg_model_path)
    if not path.is_file():
        return None
    try:
        import torch
        from PIL import Image

        device = "cuda" if torch.cuda.is_available() else "cpu"
        net, torch_mod, image_size = _load_unet(path, device)
        img = _window_hu(hu.astype(np.float32))
        h, w = img.shape
        img_p = Image.fromarray((img * 255).astype(np.uint8)).resize((image_size, image_size), Image.BILINEAR)
        x = torch_mod.from_numpy(np.array(img_p, dtype=np.float32) / 255.0).unsqueeze(0).unsqueeze(0).to(device)
        with torch_mod.no_grad():
            prob = torch_mod.sigmoid(net(x)).squeeze().cpu().numpy()
        mask_small = (prob > 0.5).astype(np.uint8)
        mask_full = np.array(
            Image.fromarray(mask_small * 255).resize((w, h), Image.NEAREST)
        )
        return (mask_full > 127).astype(np.uint8)
    except Exception:
        return None


def predict_mask_from_dicom_bytes(content: bytes) -> np.ndarray | None:
    hu = dicom_bytes_to_hu(content)
    return predict_mask_from_hu(hu)


def local_seg_model_status() -> dict[str, Any]:
    path = Path(settings.ct_seg_model_path)
    return {
        "enabled": settings.ct_seg_use_local,
        "model_path": str(path),
        "model_exists": path.is_file(),
        "train_cmd": "cd backend && python3 -m ml.train_ct_segmentation",
    }
