#!/usr/bin/env bash
# Stop + remove the Car Thing LaunchAgents (feeder + tunnel). Run this before
# starting the feeder by hand (`bun run feeder`) so they don't fight over :4000.
#
# Usage: bun run daemon:uninstall   (or: bash scripts/uninstall-daemon.sh)
set -uo pipefail

LA="$HOME/Library/LaunchAgents"
GUI="gui/$(id -u)"

for label in com.carthing.feeder com.carthing.tunnel; do
  launchctl bootout "$GUI/$label" 2>/dev/null || true
  rm -f "$LA/$label.plist"
done

echo "✓ stopped + removed the Car Thing daemons (feeder + tunnel)"
