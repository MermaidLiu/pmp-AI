#!/usr/bin/env python3
"""CLI：导出训练集并训练病理分级模型。

用法（在 backend 目录下）：
  python3 -m ml.train_pathology export
  python3 -m ml.train_pathology train
  python3 -m ml.train_pathology status
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

# 允许从 backend/ 或项目根目录运行
BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.core.database import SessionLocal  # noqa: E402
from app.services.pathology_trainer import (  # noqa: E402
    export_training_csv,
    get_training_status,
    train_pathology_classifier,
)


def main() -> None:
    parser = argparse.ArgumentParser(description="PMP Agent 病理分级模型训练")
    sub = parser.add_subparsers(dest="cmd", required=True)
    sub.add_parser("export", help="从数据库导出 CSV")
    sub.add_parser("train", help="训练 XGBoost 分类器")
    sub.add_parser("status", help="查看训练状态")
    args = parser.parse_args()

    with SessionLocal() as db:
        if args.cmd == "export":
            out = export_training_csv(db)
            print(json.dumps(out, ensure_ascii=False, indent=2))
        elif args.cmd == "train":
            out = train_pathology_classifier(db)
            print(json.dumps(out, ensure_ascii=False, indent=2))
        elif args.cmd == "status":
            out = get_training_status(db)
            print(json.dumps(out, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
