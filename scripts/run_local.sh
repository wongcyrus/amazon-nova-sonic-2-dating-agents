#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
VENV_DIR="${REPO_ROOT}/.venv"
REQUIREMENTS_FILE="${REPO_ROOT}/backend/requirements.txt"

cd "${REPO_ROOT}"

if [ ! -d "${VENV_DIR}" ]; then
    echo "📦 Creating virtual environment..."
    python3 -m venv "${VENV_DIR}"
fi

source "${VENV_DIR}/bin/activate"

if ! python -c "import fastapi, uvicorn" >/dev/null 2>&1; then
    echo "📥 Installing backend dependencies..."
    pip install -r "${REQUIREMENTS_FILE}"
fi

echo "🚀 Starting local backend with virtual environment..."
exec python backend/dating_voice_agent.py
