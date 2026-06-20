#!/usr/bin/env bash
# Keeps `adb reverse tcp:PORT tcp:PORT` alive so the Car Thing's localhost:PORT
# reaches this Mac's feeder. The reverse rule dies on device reboot / USB replug
# / adb-server restart, so we re-arm on every (re)connect.
#
# Usage: scripts/carthing-connect.sh [port]   (default 4000)
set -u
PORT="${1:-4000}"
echo "[carthing] watchdog up - waiting for an adb device to arm reverse tcp:${PORT} ..."
while true; do
  adb wait-for-device
  if adb reverse "tcp:${PORT}" "tcp:${PORT}" >/dev/null 2>&1; then
    echo "[carthing] $(date +%H:%M:%S) reverse armed: device localhost:${PORT} -> mac :${PORT}"
  else
    echo "[carthing] $(date +%H:%M:%S) reverse failed (device offline/unauthorized?) - retrying"
    sleep 2
    continue
  fi
  # Hold until the device drops, then loop to re-arm.
  while adb get-state 2>/dev/null | grep -q '^device$'; do sleep 2; done
  echo "[carthing] $(date +%H:%M:%S) device disconnected - re-arming on reconnect"
done
