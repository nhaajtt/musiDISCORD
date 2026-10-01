#!/bin/sh
# Chạy màn hình trạng thái TFT và tự chạy lại nếu bị dừng. Dùng cho @reboot trong crontab hoặc systemd.
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
