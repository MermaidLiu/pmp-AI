#!/usr/bin/env bash
# PMP / LingX-Agent 云服务器一键部署（Ubuntu 22.04+）
#
# 用法（在仓库根目录）：
#   sudo bash deploy/deploy-server.sh
#
# 常用参数（环境变量）：
#   SERVER_NAME=your.domain.com          # nginx server_name + CORS
#   PIP_INDEX_URL=https://pypi.tuna.tsinghua.edu.cn/simple
#   SKIP_FRONTEND=1                      # 仅部署/重启后端
#   BACKEND_PORT=8000
#   BACKEND_WORKERS=1                    # SQLite 建议 1；PostgreSQL 可加大
#   BACKEND_STARTUP_TIMEOUT=600          # 冷启动等待秒数
#   WEB_ROOT=/var/www/lingxi/dist
#   SERVICE_NAME=pmp-backend
#
# 示例：
#   sudo PIP_INDEX_URL=https://pypi.tuna.tsinghua.edu.cn/simple bash deploy/deploy-server.sh
#   sudo SERVER_NAME=petct.example.com bash deploy/deploy-server.sh
#   sudo SKIP_FRONTEND=1 bash deploy/deploy-server.sh
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND_DIR="$ROOT/backend"
FRONTEND_DIR="$ROOT/frontend"
VENV_DIR="${VENV_DIR:-$BACKEND_DIR/.venv}"
WEB_ROOT="${WEB_ROOT:-/var/www/lingxi/dist}"
SERVICE_NAME="${SERVICE_NAME:-pmp-backend}"
NGINX_SITE="${NGINX_SITE:-pmp-agent}"
SERVER_NAME="${SERVER_NAME:-_}"
PIP_INDEX_URL="${PIP_INDEX_URL:-}"
BACKEND_PORT="${BACKEND_PORT:-8000}"
BACKEND_WORKERS="${BACKEND_WORKERS:-1}"
BACKEND_STARTUP_TIMEOUT="${BACKEND_STARTUP_TIMEOUT:-600}"
SKIP_FRONTEND="${SKIP_FRONTEND:-0}"
RUN_USER="${SUDO_USER:-${USER:-ubuntu}}"

log() { printf '[deploy] %s\n' "$*"; }
die() { log "错误: $*"; exit 1; }

[[ "$(id -u)" -eq 0 ]] || die "请使用 sudo 运行：sudo bash deploy/deploy-server.sh"
[[ -f "$BACKEND_DIR/app/main.py" ]] || die "未找到 backend/app/main.py，请在仓库根目录执行本脚本"
command -v python3 >/dev/null 2>&1 || die "未找到 python3"

export DEBIAN_FRONTEND=noninteractive

log "项目目录: $ROOT"
log "运行用户: $RUN_USER · 后端端口: $BACKEND_PORT · workers: $BACKEND_WORKERS"

# —— 系统依赖 ——
log "安装系统依赖…"
apt-get update -qq
apt-get install -y -qq python3 python3-venv python3-pip nginx curl git ca-certificates build-essential

if [[ "$SKIP_FRONTEND" != "1" ]]; then
  if ! command -v node >/dev/null 2>&1 || [[ "$(node -v | cut -d. -f1 | tr -d v)" -lt 18 ]]; then
    log "安装 Node.js 20…"
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt-get install -y -qq nodejs
  fi
fi

# —— Python 虚拟环境 ——
log "配置后端虚拟环境…"
if [[ ! -d "$VENV_DIR" ]]; then
  python3 -m venv "$VENV_DIR"
fi
# shellcheck disable=SC1091
source "$VENV_DIR/bin/activate"
python3 -m pip install -q --upgrade pip --default-timeout=120 ${PIP_INDEX_URL:+-i "$PIP_INDEX_URL"}
python3 -m pip install -q --default-timeout=300 ${PIP_INDEX_URL:+-i "$PIP_INDEX_URL"} -r "$BACKEND_DIR/requirements.txt"

# —— .env ——
if [[ ! -f "$BACKEND_DIR/.env" ]]; then
  cp "$BACKEND_DIR/.env.example" "$BACKEND_DIR/.env"
  log "已从 .env.example 创建 backend/.env（请补全 REACHAPI_API_KEY 等密钥）"
fi

ensure_env_kv() {
  local key="$1"
  local val="$2"
  local file="$BACKEND_DIR/.env"
  if grep -q "^${key}=" "$file" 2>/dev/null; then
    return 0
  fi
  printf '%s=%s\n' "$key" "$val" >> "$file"
  log "已写入 .env: ${key}"
}

PUBLIC_IP="$(curl -sf --max-time 5 ifconfig.me 2>/dev/null || hostname -I 2>/dev/null | awk '{print $1}' || true)"
PUBLIC_IP="${PUBLIC_IP:-127.0.0.1}"

if [[ "$SERVER_NAME" != "_" ]]; then
  ensure_env_kv "CORS_ORIGINS" "https://${SERVER_NAME},http://${SERVER_NAME}"
elif ! grep -q '^CORS_ORIGINS=' "$BACKEND_DIR/.env"; then
  ensure_env_kv "CORS_ORIGINS" "http://${PUBLIC_IP},http://127.0.0.1:5173,http://localhost:5173"
fi

ensure_env_kv "DEMO_MODE" "false"
ensure_env_kv "FREE_LLM_QUOTA" "10"
ensure_env_kv "PRO_PRICE_USD" "199"
ensure_env_kv "REACHAPI_BASE_URL" "https://direct.reachapi.ai/v1"
ensure_env_kv "REACHAPI_CHAT_MODEL" "gpt-5.6-sol"
ensure_env_kv "DEEPSEEK_BASE_URL" "https://api.deepseek.com"
ensure_env_kv "DEEPSEEK_CHAT_MODEL" "deepseek-chat"
ensure_env_kv "PATHOLOGY_IMAGING_API_TIMEOUT" "720"

if ! grep -qE '^REACHAPI_API_KEY=.+' "$BACKEND_DIR/.env"; then
  log "警告: REACHAPI_API_KEY 为空 — 智能对话将回退规则引擎。请编辑 $BACKEND_DIR/.env 后执行: systemctl restart ${SERVICE_NAME}"
fi

# —— 可写目录（SQLite / 缓存 / 模型）——
mkdir -p "$BACKEND_DIR/data" "$BACKEND_DIR/models" "$ROOT/data" "$ROOT/models"
chown -R "$RUN_USER":"$RUN_USER" "$BACKEND_DIR" "$VENV_DIR" 2>/dev/null || true
# SQLite 文件需对运行用户可写
touch "$BACKEND_DIR/petct_research.db" 2>/dev/null || true
chown "$RUN_USER":"$RUN_USER" "$BACKEND_DIR/petct_research.db" 2>/dev/null || true

# —— 导入冒烟（避免 systemd 静默失败）——
log "后端导入冒烟测试…"
(
  cd "$BACKEND_DIR"
  # shellcheck disable=SC1091
  source "$VENV_DIR/bin/activate"
  python3 - <<'PY'
import sys
try:
    from app.main import app  # noqa: F401
    from app.services.llm_gateway import llm_base_url, is_llm_available
    print("import_ok", "llm_configured=", is_llm_available(), "base=", llm_base_url())
except Exception as e:
    print("IMPORT_FAILED:", e, file=sys.stderr)
    sys.exit(1)
PY
) || die "backend 导入失败，请先修复依赖/代码后再部署。日志见上方 IMPORT_FAILED"

# —— 前端构建（可选）——
if [[ "$SKIP_FRONTEND" != "1" ]]; then
  log "构建前端…"
  cd "$FRONTEND_DIR"
  if [[ -f package-lock.json ]]; then
    npm ci --silent
  else
    npm install --silent
  fi
  npm run build

  log "发布静态文件到 $WEB_ROOT …"
  mkdir -p "$(dirname "$WEB_ROOT")"
  rm -rf "$WEB_ROOT"
  cp -a dist "$WEB_ROOT"
  chown -R "$RUN_USER":"$RUN_USER" "$(dirname "$WEB_ROOT")" 2>/dev/null || true
else
  log "SKIP_FRONTEND=1，跳过前端构建"
fi

# —— systemd：不依赖 EnvironmentFile 解析 .env（应用内 _load_dotenv 读取 backend/.env）——
log "写入 systemd 服务 ${SERVICE_NAME} …"
cat > "/etc/systemd/system/${SERVICE_NAME}.service" <<EOF
[Unit]
Description=PMP Agent / LingX backend (uvicorn)
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=${RUN_USER}
Group=${RUN_USER}
WorkingDirectory=${BACKEND_DIR}
# 应用从 WorkingDirectory/.env 自行加载；此处仅补充 PATH
Environment=PATH=${VENV_DIR}/bin:/usr/local/bin:/usr/bin
Environment=PYTHONUNBUFFERED=1
ExecStart=${VENV_DIR}/bin/uvicorn app.main:app --host 127.0.0.1 --port ${BACKEND_PORT} --workers ${BACKEND_WORKERS}
Restart=always
RestartSec=5
# 冷启动（langchain/xgboost）可能较慢，给足时间
TimeoutStartSec=300
# 大文件上传 / 长耗时影像接口
LimitNOFILE=65535

[Install]
WantedBy=multi-user.target
EOF

# —— Nginx ——
if [[ "$SKIP_FRONTEND" != "1" ]] || [[ ! -f "/etc/nginx/sites-available/${NGINX_SITE}" ]]; then
  log "写入 Nginx 站点 ${NGINX_SITE} …"
  cat > "/etc/nginx/sites-available/${NGINX_SITE}" <<EOF
server {
    listen 80;
    server_name ${SERVER_NAME};

    root ${WEB_ROOT};
    index index.html;

    client_max_body_size 200m;

    location / {
        try_files \$uri \$uri/ /index.html;
    }

    location /api/ {
        proxy_pass http://127.0.0.1:${BACKEND_PORT};
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_connect_timeout 60s;
        proxy_send_timeout 900s;
        proxy_read_timeout 900s;
    }

    location /health {
        proxy_pass http://127.0.0.1:${BACKEND_PORT}/health;
        proxy_set_header Host \$host;
    }

    location /docs {
        proxy_pass http://127.0.0.1:${BACKEND_PORT}/docs;
        proxy_set_header Host \$host;
    }

    location /openapi.json {
        proxy_pass http://127.0.0.1:${BACKEND_PORT}/openapi.json;
        proxy_set_header Host \$host;
    }

    location /schema/ {
        proxy_pass http://127.0.0.1:${BACKEND_PORT}/schema/;
        proxy_set_header Host \$host;
    }
}
EOF
  ln -sf "/etc/nginx/sites-available/${NGINX_SITE}" "/etc/nginx/sites-enabled/${NGINX_SITE}"
  rm -f /etc/nginx/sites-enabled/default 2>/dev/null || true
fi

log "启动/重载服务…"
systemctl daemon-reload
systemctl enable "${SERVICE_NAME}"
systemctl restart "${SERVICE_NAME}"

if [[ "$SKIP_FRONTEND" != "1" ]] || [[ -f "/etc/nginx/sites-available/${NGINX_SITE}" ]]; then
  nginx -t
  systemctl reload nginx
fi

log "等待后端健康检查（最多 ${BACKEND_STARTUP_TIMEOUT}s）…"
ok=0
for i in $(seq 1 "$BACKEND_STARTUP_TIMEOUT"); do
  if curl -sf "http://127.0.0.1:${BACKEND_PORT}/health" >/dev/null 2>&1; then
    log "后端就绪 ✓（${i}s）→ $(curl -sf "http://127.0.0.1:${BACKEND_PORT}/health")"
    ok=1
    break
  fi
  if ! systemctl is-active --quiet "${SERVICE_NAME}"; then
    log "后端服务未处于 active，最近日志："
    journalctl -u "${SERVICE_NAME}" -n 80 --no-pager || true
    die "systemd 服务 ${SERVICE_NAME} 已退出"
  fi
  if (( i % 30 == 0 )); then
    log "仍在等待… (${i}s / ${BACKEND_STARTUP_TIMEOUT}s)"
  fi
  sleep 1
done

if [[ "$ok" != "1" ]]; then
  journalctl -u "${SERVICE_NAME}" -n 120 --no-pager || true
  die "后端启动超时。请检查: journalctl -u ${SERVICE_NAME} -f"
fi

# 二次校验 API 前缀
if curl -sf "http://127.0.0.1:${BACKEND_PORT}/api/v1/auth/quota" -H "X-Guest-Id: deploy-check" >/dev/null 2>&1; then
  log "Auth/quota 接口可达 ✓"
else
  log "警告: /api/v1/auth/quota 暂不可达（若刚加路由，确认代码已更新）"
fi

log "部署完成 ✓"
log "  站点:     http://${PUBLIC_IP}"
if [[ "$SERVER_NAME" != "_" ]]; then
  log "  域名:     http://${SERVER_NAME}"
fi
log "  健康检查: http://${PUBLIC_IP}/health"
log "  API 文档: http://${PUBLIC_IP}/docs"
log "  后端日志: journalctl -u ${SERVICE_NAME} -f"
log "  重启后端: systemctl restart ${SERVICE_NAME}"
log "  仅更新后端: sudo SKIP_FRONTEND=1 bash deploy/deploy-server.sh"
