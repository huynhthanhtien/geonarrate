#!/usr/bin/env bash
# Sinh lại openapi.json và báo lỗi nếu bản đã commit bị cũ (frontend sinh client từ file này).
set -euo pipefail
cd "$(dirname "$0")/.."
python -m app.tools.export_openapi > openapi.json
git diff --exit-code -- openapi.json || { echo "openapi.json chưa cập nhật — chạy scripts/check_openapi.sh rồi commit"; exit 1; }
