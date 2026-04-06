#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/pg-control-v2}"
GITHUB_OWNER="${GITHUB_OWNER:-didierjurado-blip}"
GITHUB_REPO="${GITHUB_REPO:-Pyg}"
GITHUB_REF="${GITHUB_REF:-main}"
ARCHIVE_URL="https://codeload.github.com/${GITHUB_OWNER}/${GITHUB_REPO}/tar.gz/${GITHUB_REF}"
TMP_DIR="$(mktemp -d)"

cleanup() {
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "[ERROR] Missing required command: $1" >&2
    exit 1
  fi
}

if [[ "$(uname -s)" != "Linux" ]]; then
  echo "[ERROR] This installer is intended for Linux VPS hosts." >&2
  exit 1
fi

require_cmd curl
require_cmd tar
require_cmd docker

if docker compose version >/dev/null 2>&1; then
  COMPOSE_CMD=(docker compose)
elif command -v docker-compose >/dev/null 2>&1; then
  COMPOSE_CMD=(docker-compose)
else
  echo "[ERROR] Docker Compose is not available. Install docker compose plugin first." >&2
  exit 1
fi

mkdir -p "$APP_DIR" "$APP_DIR/data"

DOWNLOAD_ARGS=(-fsSL)
if [[ -n "${GITHUB_TOKEN:-}" ]]; then
  DOWNLOAD_ARGS+=(-H "Authorization: Bearer ${GITHUB_TOKEN}")
fi
DOWNLOAD_ARGS+=("$ARCHIVE_URL" -o "$TMP_DIR/repo.tar.gz")

echo "[INFO] Downloading ${GITHUB_OWNER}/${GITHUB_REPO}@${GITHUB_REF}"
curl "${DOWNLOAD_ARGS[@]}"

echo "[INFO] Extracting application package"
tar -xzf "$TMP_DIR/repo.tar.gz" -C "$TMP_DIR"
SRC_DIR="$(find "$TMP_DIR" -mindepth 1 -maxdepth 1 -type d | head -n 1)"
if [[ -z "$SRC_DIR" ]]; then
  echo "[ERROR] Could not locate extracted source directory." >&2
  exit 1
fi

echo "[INFO] Syncing project files into ${APP_DIR}"
(cd "$SRC_DIR" && tar --exclude="./data" --exclude="./node_modules" --exclude="./.git" --exclude="./*.log" -cf - .) | (cd "$APP_DIR" && tar -xf -)

if [[ ! -f "$APP_DIR/.env" && -f "$APP_DIR/.env.example" ]]; then
  cp "$APP_DIR/.env.example" "$APP_DIR/.env"
  echo "[INFO] Created $APP_DIR/.env from .env.example"
fi

echo "[INFO] Building and starting containers"
(cd "$APP_DIR" && "${COMPOSE_CMD[@]}" up -d --build)

echo
echo "[OK] Installation complete."
echo "[OK] App directory: $APP_DIR"
echo "[OK] URL: http://$(hostname -I 2>/dev/null | awk "{print \$1}" || echo YOUR_SERVER_IP):3000"
echo
echo "Default admin if no user exists yet:"
echo "  user: admin@pgcontrol.local"
echo "  password: PgcAdmin_2026!Cambiar"
echo
echo "Change the credentials immediately from Configuracion after first login."
