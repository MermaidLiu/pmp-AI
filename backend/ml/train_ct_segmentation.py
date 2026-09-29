#!/usr/bin/env python3
"""Train CT lesion segmentation (MONAI U-Net 2D base model).

Run from backend/:
  python3 -m ml.train_ct_segmentation --epochs 30
  python3 -m ml.train_ct_segmentation --status

Weights: models/ct_lesion_unet2d.pth (+ .meta.json)
Data: data/annotations/*/manifest.json (source_dcm + mask_png from platform saves)
"""

from __future__ import annotations

import argparse
import json
import random
import sys
from datetime import datetime, timezone
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

MODEL_PATH = BACKEND_ROOT / "models" / "ct_lesion_unet2d.pth"
META_PATH = BACKEND_ROOT / "models" / "ct_lesion_unet2d.meta.json"


def _study_ids() -> list[str]:
    from app.services.ct_ml_dataset import iter_annotation_studies

    return [str(m.get("dataset_id") or "") for m in iter_annotation_studies()]


def status() -> dict:
    from app.services.ct_ml_dataset import collect_seg_samples

    samples = collect_seg_samples(require_mask=False)
    with_mask = sum(1 for s in samples if float(s["mask"].sum()) > 0)
    meta: dict = {}
    if META_PATH.is_file():
        try:
            meta = json.loads(META_PATH.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            pass
    return {
        "annotation_studies": len(_study_ids()),
        "slice_samples": len(samples),
        "slices_with_lesion": with_mask,
        "model_path": str(MODEL_PATH),
        "model_exists": MODEL_PATH.is_file(),
        "last_training": meta,
        "hint": "平台分析时开启 save_annotation_dataset，或跑 cohort 后保存标注集",
    }


def train(
    *,
    epochs: int = 25,
    batch_size: int = 8,
    lr: float = 1e-3,
    image_size: int = 256,
    val_ratio: float = 0.2,
    seed: int = 42,
) -> dict:
    import torch
    from monai.losses import DiceCELoss
    from monai.networks.nets import UNet
    from torch.utils.data import DataLoader, Subset

    from ml.ct_torch_dataset import CtSliceSegDataset

    random.seed(seed)
    torch.manual_seed(seed)

    all_ids = _study_ids()
    if len(all_ids) < 1:
        raise ValueError("无标注数据集。请先上传 CT 并完成分析且 save_annotation_dataset=true")

    random.shuffle(all_ids)
    n_val = max(1, int(len(all_ids) * val_ratio)) if len(all_ids) >= 2 else 0
    val_ids = set(all_ids[:n_val])
    train_ids = [i for i in all_ids if i not in val_ids]

    train_ds = CtSliceSegDataset(dataset_ids=train_ids, require_lesion=False, image_size=image_size)
    if len(train_ds) < 4:
        raise ValueError(f"训练切片仅 {len(train_ds)} 张，至少需要 4 张（建议 ≥40 层含 mask）")

    val_ds = CtSliceSegDataset(dataset_ids=list(val_ids), require_lesion=False, image_size=image_size) if val_ids else None

    train_loader = DataLoader(train_ds, batch_size=batch_size, shuffle=True, num_workers=0)
    val_loader = DataLoader(val_ds, batch_size=batch_size, shuffle=False, num_workers=0) if val_ds and len(val_ds) else None

    device = "cuda" if torch.cuda.is_available() else "cpu"
    net = UNet(
        spatial_dims=2,
        in_channels=1,
        out_channels=1,
        channels=(16, 32, 64, 128, 256),
        strides=(2, 2, 2, 2),
        num_res_units=2,
    ).to(device)
    opt = torch.optim.AdamW(net.parameters(), lr=lr, weight_decay=1e-4)
    loss_fn = DiceCELoss(sigmoid=True, squared_pred=True, to_onehot_y=False)

    best_val = float("inf")
    history: list[dict] = []

    for ep in range(1, epochs + 1):
        net.train()
        train_loss = 0.0
        n_batches = 0
        for batch in train_loader:
            x = batch["image"].to(device)
            y = batch["mask"].to(device)
            opt.zero_grad()
            logits = net(x)
            loss = loss_fn(logits, y)
            loss.backward()
            opt.step()
            train_loss += float(loss.item())
            n_batches += 1
        train_loss /= max(n_batches, 1)

        val_loss = None
        if val_loader:
            net.eval()
            v_sum, v_n = 0.0, 0
            with torch.no_grad():
                for batch in val_loader:
                    x = batch["image"].to(device)
                    y = batch["mask"].to(device)
                    logits = net(x)
                    v_sum += float(loss_fn(logits, y).item())
                    v_n += 1
            val_loss = v_sum / max(v_n, 1)
            if val_loss < best_val:
                best_val = val_loss
                _save(net, ep, train_loss, val_loss, train_ids, list(val_ids), image_size)

        history.append({"epoch": ep, "train_loss": train_loss, "val_loss": val_loss})
        print(f"epoch {ep}/{epochs} train_loss={train_loss:.4f} val_loss={val_loss}")

    if not MODEL_PATH.is_file():
        _save(net, epochs, train_loss, val_loss, train_ids, list(val_ids), image_size)

    return {"ok": True, "model_path": str(MODEL_PATH), "meta_path": str(META_PATH), "history": history[-3:]}


def _save(net, epoch, train_loss, val_loss, train_ids, val_ids, image_size) -> None:
    import torch

    MODEL_PATH.parent.mkdir(parents=True, exist_ok=True)
    torch.save(
        {
            "state_dict": net.state_dict(),
            "arch": "monai_unet2d",
            "in_channels": 1,
            "out_channels": 1,
            "image_size": image_size,
        },
        MODEL_PATH,
    )
    meta = {
        "trained_at": datetime.now(timezone.utc).isoformat(),
        "epoch": epoch,
        "train_loss": train_loss,
        "val_loss": val_loss,
        "train_studies": train_ids,
        "val_studies": val_ids,
        "model_path": str(MODEL_PATH),
        "task": "ct_lesion_segmentation_2d",
    }
    META_PATH.write_text(json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8")


def main() -> None:
    p = argparse.ArgumentParser(description="CT 病灶分割基模训练 (MONAI U-Net 2D)")
    p.add_argument("--status", action="store_true")
    p.add_argument("--epochs", type=int, default=25)
    p.add_argument("--batch-size", type=int, default=8)
    p.add_argument("--lr", type=float, default=1e-3)
    p.add_argument("--image-size", type=int, default=256)
    args = p.parse_args()
    if args.status:
        print(json.dumps(status(), ensure_ascii=False, indent=2))
        return
    out = train(epochs=args.epochs, batch_size=args.batch_size, lr=args.lr, image_size=args.image_size)
    print(json.dumps(out, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
