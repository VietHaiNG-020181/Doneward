#!/bin/zsh
set -eu

PROJECT_ROOT="/Users/hainguyen/Documents/Codex/Doneward"
NODE_BIN_DIR="/Users/hainguyen/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin"

export PATH="$NODE_BIN_DIR:/usr/bin:/bin:/usr/sbin:/sbin"
cd "$PROJECT_ROOT"
exec "$PROJECT_ROOT/node_modules/.bin/vinext" start
