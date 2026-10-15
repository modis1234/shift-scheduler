#!/usr/bin/env bash
# 개발 모드 실행: 엔진 venv와 web-client 의존성이 없으면 만들고 next dev를 띄운다.
# 사용법: ./dev.sh [포트]   (기본 3000)
set -euo pipefail
cd "$(dirname "$0")"

if [ ! -x algorithm-engine/.venv/bin/python ]; then
  echo "[dev] algorithm-engine venv 생성"
  python3 -m venv algorithm-engine/.venv
  algorithm-engine/.venv/bin/pip install -r algorithm-engine/requirements.txt
fi

if [ ! -d web-client/node_modules ]; then
  echo "[dev] web-client 의존성 설치"
  (cd web-client && npm ci)
fi

cd web-client
exec npm run dev -- -p "${1:-3000}"
