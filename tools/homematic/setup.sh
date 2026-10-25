#!/usr/bin/env bash
set -euo pipefail
runtime="${NODE_RED_USER_DIR:-$HOME/.node-red}/homematic-ip-runtime"
python3 -m venv "$runtime"
"$runtime/bin/python" -m pip install --disable-pip-version-check 'homematicip==2.19.1'
"$runtime/bin/python" -c 'from homematicip.async_home import AsyncHome; from homematicip.auth import Auth; print("Homematic-IP-Bibliothek verfügbar")'
