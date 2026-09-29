# CT 分割基模 + rPCI / 病理分级（自训练）

数据均为 **CT**；分区与评分原则对齐 **Tops-Welten et al., Eur Radiol 2025（影像 rPCI）**：每区取该区最大结节 **0–3** 分，13 区合计 **0–39**。

## 1. 准备数据（分割，优先）

1. 上传 DICOM 做影像分析时开启 **保存标注数据集**（`save_annotation_dataset`）。
2. 数据落在 `backend/data/annotations/<dataset_id>/`：
   - `*_source.dcm` — 原始 CT 层
   - `*_mask.png` — 病灶 mask（来自分割接口或后续可改为你自训模型输出）
   - `manifest.json` 中 `sc` / `region` — rPCI 逐层标签（有则用于分级训练）

**40 例高/低 ZIP**：放在 `backend/data/imaging_cohort/high_grade|low_grade/`，跑 cohort 特征提取后，建议对每例也 **保存 annotation**（或 `dataset_id` 与 ZIP 文件名一致），便于关联病理标签。

## 2. 安装 ML 依赖

```bash
cd backend
pip install -r requirements.txt
pip install -r requirements-ml.txt   # torch + monai
```

## 3. 训练分割基模（MONAI U-Net 2D）

```bash
python3 -m ml.train_ct_segmentation --status
python3 -m ml.train_ct_segmentation --epochs 30 --batch-size 8
```

产出：

- `models/ct_lesion_unet2d.pth` — **可继续 fine-tune 的基模**（`state_dict` + arch 元数据）
- `models/ct_lesion_unet2d.meta.json`

按 **病例（dataset_id）** 划分 train/val，避免同一患者泄漏。

可选本地推理（不替代远程 CT 服务，除非自行打开）：

```bash
export CT_SEG_USE_LOCAL=true
```

## 4. 训练 rPCI + 病理分级

依赖 manifest 中的 **sc/region**（rPCI）及 cohort 的 **grade_binary**（高/低）。

```bash
python3 -m ml.train_ct_rpci_grade --status
python3 -m ml.train_ct_rpci_grade --mode all
```

产出：

| 文件 | 作用 |
|------|------|
| `models/ct_rpci_region_mlp.joblib` | 13 区 0–3 分（多输出 XGBoost，特征含分区体积等） |
| `models/ct_pathology_grade.joblib` | 高/低级别（XGBoost，特征含 rPCI 与 mask 统计） |

> 后续可把 U-Net **编码器**与 rPCI 头做成端到端 CNN；当前版本先保证在少量标注下可跑通、可迭代。

## 5. 平台状态 API

`GET /api/v1/platform/pathology/ml/status` — 样本数、权重是否存在、训练命令提示。

## 6. 推荐迭代顺序

1. 积累 ≥10 例含 mask 的 annotation → 训 **分割 U-Net** → 目视验证 mask。
2. 在 manifest 中补全/校对 **sc、region**（或与远程 PCI 一致）→ 训 **rPCI**。
3. 高/低 ZIP 标签 + 对齐 `dataset_id` → 训 **病理分级**。
4. （可选）用自训 mask 替换远程分割，再算体积与 rPCI 报告。
