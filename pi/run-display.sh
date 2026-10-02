#!/bin/sh
# Run the TFT status display and restart it if it stops. Use from @reboot in crontab or from systemd.
cd "$(dirname "$0")/.."
set -a
[ -f pi/display.env ] && . pi/display.env
set +a
PY=pi/.venv/bin/python
[ -x "$PY" ] || PY=python3
while true; do
  "$PY" -u pi/display.py
  sleep 5
done
