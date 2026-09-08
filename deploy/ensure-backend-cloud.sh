#!/usr/bin/env bash
# 云上仅保证后端可启动/重启（不构建前端）
# 用法：
#   sudo bash deploy/ensure-backend-cloud.sh
#   sudo PIP_INDEX_URL=https://pypi.tuna.tsinghua.edu.cn/simple bash deploy/ensure-backend-cloud.sh
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
export SKIP_FRONTEND=1
export BACKEND_WORKERS="${BACKEND_WORKERS:-1}"
export BACKEND_STARTUP_TIMEOUT="${BACKEND_STARTUP_TIMEOUT:-600}"

exec bash "$ROOT/deploy/deploy-server.sh"
