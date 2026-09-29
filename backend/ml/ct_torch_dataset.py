"""PyTorch Dataset wrappers for CT ML (lazy load from disk)."""

from __future__ import annotations

from typing import Any

import numpy as np
import torch
from torch.utils.data import Dataset

from app.services.ct_ml_dataset import iter_annotation_studies, load_slice_image_and_mask


class CtSliceSegDataset(Dataset):
    """2D CT slice + binary lesion mask."""

    def __init__(
        self,
        *,
        dataset_ids: list[str] | None = None,
        require_lesion: bool = False,
        image_size: int = 256,
    ) -> None:
        self.image_size = image_size
        self.items: list[tuple[str, dict[str, Any]]] = []
        for manifest in iter_annotation_studies():
            did = str(manifest.get("dataset_id") or "")
            if dataset_ids is not None and did not in dataset_ids:
                continue
            for rec in manifest.get("slices") or []:
                if not isinstance(rec, dict) or not rec.get("mask_png"):
                    continue
                if require_lesion and not rec.get("has_overlay"):
                    continue
                self.items.append((did, rec))

    def __len__(self) -> int:
        return len(self.items)

    def __getitem__(self, idx: int) -> dict[str, torch.Tensor]:
        did, rec = self.items[idx]
        pair = load_slice_image_and_mask(did, rec)
        if pair is None:
            raise RuntimeError(f"failed to load {did} slice {rec.get('index')}")
        img, mask = pair
        img_t, mask_t = self._resize(img, mask)
        return {
            "image": img_t.unsqueeze(0),
            "mask": mask_t.unsqueeze(0),
            "dataset_id": did,
        }

    def _resize(self, img: np.ndarray, mask: np.ndarray) -> tuple[torch.Tensor, torch.Tensor]:
        from PIL import Image

        s = self.image_size
        img_p = Image.fromarray((img * 255).astype(np.uint8)).resize((s, s), Image.BILINEAR)
        mask_p = Image.fromarray((mask * 255).astype(np.uint8)).resize((s, s), Image.NEAREST)
        img_f = np.array(img_p, dtype=np.float32) / 255.0
        mask_f = (np.array(mask_p) > 127).astype(np.float32)
        return torch.from_numpy(img_f), torch.from_numpy(mask_f)
