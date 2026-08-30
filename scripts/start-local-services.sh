#!/bin/zsh
set -eu

PROJECT_ROOT="/Users/hainguyen/Documents/Codex/Doneward"
OLLAMA_BIN="/Users/hainguyen/Library/Application Support/Doneward/ollama/ollama"
RUNTIME_ROOT="/Users/hainguyen/Library/Application Support/Doneward"
PYTHON_BIN="/Users/hainguyen/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3"

mkdir -p "$RUNTIME_ROOT/logs"

export OLLAMA_HOST="127.0.0.1:11434"
export OLLAMA_MODELS="/Users/hainguyen/Library/Application Support/Doneward/models"

if ! curl -fsS --max-time 1 http://127.0.0.1:11434/api/version >/dev/null 2>&1; then
  "$OLLAMA_BIN" serve >>"$RUNTIME_ROOT/logs/ollama.log" 2>&1 &
fi

sleep 1
exec "$PYTHON_BIN" "$PROJECT_ROOT/backend/server.py"
