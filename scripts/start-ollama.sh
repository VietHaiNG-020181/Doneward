#!/bin/zsh
set -eu

RUNTIME_ROOT="/Users/hainguyen/Library/Application Support/Doneward"
mkdir -p "$RUNTIME_ROOT/logs"

export OLLAMA_HOST="127.0.0.1:11434"
export OLLAMA_MODELS="$RUNTIME_ROOT/models"

exec "$RUNTIME_ROOT/ollama/ollama" serve
