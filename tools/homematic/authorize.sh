#!/usr/bin/env bash
set -euo pipefail
script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
export NODE_RED_USER_DIR="${NODE_RED_USER_DIR:-$HOME/.node-red}"
exec "$NODE_RED_USER_DIR/homematic-ip-runtime/bin/python" "$script_dir/bridge.py" authorize
