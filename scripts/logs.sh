#!/usr/bin/env bash
set -euo pipefail

CONFIG_ROOT="${COMMANDTHING_HOME:-${XDG_CONFIG_HOME:-$HOME/.config}/commandthing}"
LOG_DIR="$CONFIG_ROOT/logs"
mkdir -p "$LOG_DIR"
touch "$LOG_DIR/com.commandthing.feeder.log" "$LOG_DIR/com.commandthing.tunnel.log"
exec tail -f "$LOG_DIR/com.commandthing.feeder.log" "$LOG_DIR/com.commandthing.tunnel.log"
