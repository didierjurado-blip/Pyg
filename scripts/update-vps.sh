#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/pg-control-v2}"
GITHUB_OWNER="${GITHUB_OWNER:-didierjurado-blip}"
GITHUB_REPO="${GITHUB_REPO:-Pyg}"
GITHUB_REF="${GITHUB_REF:-main}"
INSTALLER_URL="https://raw.githubusercontent.com/${GITHUB_OWNER}/${GITHUB_REPO}/${GITHUB_REF}/scripts/install-vps.sh"
TMP_SCRIPT="$(mktemp)"

cleanup() {
  rm -f "$TMP_SCRIPT"
}
trap cleanup EXIT

if [[ ! -f "$APP_DIR/compose.yaml" ]]; then
  echo "[ERROR] No compose.yaml found in $APP_DIR" >&2
  exit 1
fi

CURL_ARGS=(-fsSL)
if [[ -n "${GITHUB_TOKEN:-}" ]]; then
  CURL_ARGS+=(-H "Authorization: Bearer ${GITHUB_TOKEN}")
fi
CURL_ARGS+=("$INSTALLER_URL" -o "$TMP_SCRIPT")

curl "${CURL_ARGS[@]}"
chmod +x "$TMP_SCRIPT"
APP_DIR="$APP_DIR" GITHUB_OWNER="$GITHUB_OWNER" GITHUB_REPO="$GITHUB_REPO" GITHUB_REF="$GITHUB_REF" GITHUB_TOKEN="${GITHUB_TOKEN:-}" bash "$TMP_SCRIPT"
