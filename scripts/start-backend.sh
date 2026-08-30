#!/bin/zsh
set -eu

PROJECT_ROOT="/Users/hainguyen/Documents/Codex/Doneward"
PYTHON_BIN="/Users/hainguyen/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3"

for attempt in {1..30}; do
  if curl -fsS --max-time 1 http://127.0.0.1:11434/api/version >/dev/null 2>&1; then
    exec "$PYTHON_BIN" "$PROJECT_ROOT/backend/server.py"
  fi
  sleep 1
done

echo "Ollama did not become ready within 30 seconds." >&2
exit 1
