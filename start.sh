#!/usr/bin/env bash
# PMP Agent 一键启动：后端 FastAPI + 前端 Vite 开发服务
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$ROOT/backend"
FRONTEND_DIR="$ROOT/frontend"
VENV_DIR="$ROOT/.venv"
BACKEND_PORT="${BACKEND_PORT:-8000}"
FRONTEND_PORT="${FRONTEND_PORT:-5173}"
BACKEND_HOST="${BACKEND_HOST:-127.0.0.1}"
# 首次冷启动导入较重（langchain/xgboost 等），默认等待 10 分钟
BACKEND_STARTUP_TIMEOUT="${BACKEND_STARTUP_TIMEOUT:-600}"

BACKEND_PID=""
FRONTEND_PID=""

log() { printf '[PMP Agent] %s\n' "$*"; }
die() { log "错误: $*"; exit 1; }

cleanup() {
  log "正在停止服务…"
  [[ -n "$FRONTEND_PID" ]] && kill "$FRONTEND_PID" 2>/dev/null || true
  [[ -n "$BACKEND_PID" ]] && kill "$BACKEND_PID" 2>/dev/null || true
  wait 2>/dev/null || true
  log "已退出"
}
trap cleanup EXIT INT TERM

port_busy() {
  lsof -i ":$1" -sTCP:LISTEN -t >/dev/null 2>&1
}

ensure_python() {
  command -v python3 >/dev/null 2>&1 || die "未找到 python3，请先安装 Python 3.10+"
}

ensure_node() {
  command -v npm >/dev/null 2>&1 || die "未找到 npm，请先安装 Node.js 18+"
}

req_hash() {
  if command -v md5 >/dev/null 2>&1; then
    md5 -q "$BACKEND_DIR/requirements.txt"
  elif command -v md5sum >/dev/null 2>&1; then
    md5sum "$BACKEND_DIR/requirements.txt" | awk '{print $1}'
  else
    wc -c < "$BACKEND_DIR/requirements.txt" | tr -d ' '
  fi
}

setup_backend() {
  log "配置后端虚拟环境…"
  if [[ ! -d "$VENV_DIR" ]]; then
    python3 -m venv "$VENV_DIR"
  fi
  # shellcheck disable=SC1091
  source "$VENV_DIR/bin/activate"

  local hash_file="$VENV_DIR/.requirements.hash"
  local current_hash
  current_hash="$(req_hash)"
  if [[ "${FORCE_PIP_INSTALL:-0}" == "1" ]] || [[ ! -f "$hash_file" ]] || [[ "$(cat "$hash_file")" != "$current_hash" ]]; then
    log "安装/更新 Python 依赖（首次或 requirements 变更时较慢，请耐心等待）…"
    python3 -m pip install -q --upgrade pip --default-timeout=120 ${PIP_INDEX_URL:+-i "$PIP_INDEX_URL"}
    python3 -m pip install -q --default-timeout=300 ${PIP_INDEX_URL:+-i "$PIP_INDEX_URL"} -r "$BACKEND_DIR/requirements.txt"
    echo "$current_hash" > "$hash_file"
    log "Python 依赖就绪 ✓"
  else
    log "Python 依赖未变更，跳过 pip install（设 FORCE_PIP_INSTALL=1 可强制重装）"
  fi

  if [[ ! -f "$BACKEND_DIR/.env" && -f "$BACKEND_DIR/.env.example" ]]; then
    cp "$BACKEND_DIR/.env.example" "$BACKEND_DIR/.env"
    log "已从 .env.example 创建 backend/.env"
  fi
}

setup_frontend() {
  log "安装前端依赖…"
  if [[ ! -d "$FRONTEND_DIR/node_modules" ]]; then
    (cd "$FRONTEND_DIR" && npm install)
  fi
}

start_backend() {
  if port_busy "$BACKEND_PORT"; then
    die "端口 $BACKEND_PORT 已被占用。可执行: kill \$(lsof -t -i :$BACKEND_PORT) 或设置 BACKEND_PORT=8001"
  fi
  log "启动后端 http://${BACKEND_HOST}:${BACKEND_PORT}（首次冷启动约 1–3 分钟，请稍候）"
  (
    cd "$BACKEND_DIR"
    # shellcheck disable=SC1091
    source "$VENV_DIR/bin/activate"
    exec uvicorn app.main:app --reload --host "$BACKEND_HOST" --port "$BACKEND_PORT"
  ) &
  BACKEND_PID=$!

  for i in $(seq 1 "$BACKEND_STARTUP_TIMEOUT"); do
    if curl -sf "http://${BACKEND_HOST}:${BACKEND_PORT}/health" >/dev/null 2>&1; then
      log "后端就绪 ✓（${i}s）"
      return
    fi
    if ! kill -0 "$BACKEND_PID" 2>/dev/null; then
      die "后端进程已退出，请手动查看日志: cd backend && source ../.venv/bin/activate && uvicorn app.main:app --reload --port $BACKEND_PORT"
    fi
    if (( i % 30 == 0 )); then
      log "仍在等待后端就绪… (${i}s / ${BACKEND_STARTUP_TIMEOUT}s)"
    fi
    sleep 1
  done
  die "后端启动超时（${BACKEND_STARTUP_TIMEOUT}s）。可增大 BACKEND_STARTUP_TIMEOUT 或手动运行: cd backend && source ../.venv/bin/activate && uvicorn app.main:app --reload --port $BACKEND_PORT"
}

start_frontend() {
  if port_busy "$FRONTEND_PORT"; then
    die "端口 $FRONTEND_PORT 已被占用。可设置 FRONTEND_PORT=5174"
  fi
  log "启动前端 http://127.0.0.1:${FRONTEND_PORT}"
  (
    cd "$FRONTEND_DIR"
    export VITE_PROXY_TARGET="http://${BACKEND_HOST}:${BACKEND_PORT}"
    exec npm run dev -- --host 127.0.0.1 --port "$FRONTEND_PORT"
  ) &
  FRONTEND_PID=$!
  sleep 2
  log "前端已启动 ✓"
}

main() {
  log "PMP Agent 一键部署"
  ensure_python
  ensure_node
  setup_backend
  setup_frontend
  start_backend
  start_frontend
  log "全部就绪"
  log "  前端: http://127.0.0.1:${FRONTEND_PORT}"
  log "  后端: http://${BACKEND_HOST}:${BACKEND_PORT}"
  log "  API 文档: http://${BACKEND_HOST}:${BACKEND_PORT}/docs"
  log "按 Ctrl+C 停止前后端"
  wait
}

main "$@"
