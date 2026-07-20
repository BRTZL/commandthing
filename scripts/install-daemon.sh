#!/usr/bin/env bash
# Install launchd LaunchAgents that auto-start the Car Thing stack at LOGIN and
# keep it alive:
#   com.commandthing.feeder  - the Bun feeder on :4000 (serves dist + WS + media)
#   com.commandthing.tunnel  - adb-reverse watchdog (device localhost:4000 -> Mac)
#
# LaunchAgents (not LaunchDaemons) on purpose: the feeder drives Spotify via
# AppleScript, which needs the user's GUI session. That means these start at
# login, not at boot — if the Mac sits on the login screen, nothing runs until
# you log in.
#
# Generates the plists from your live paths (bun/adb/repo) so there's nothing
# machine-specific committed. Re-run any time to refresh them.
#
# macOS only. Usage: pnpm daemon:install (or: bash scripts/install-daemon.sh)
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LA="$HOME/Library/LaunchAgents"
GUI="gui/$(id -u)"

BUN="$(command -v bun || true)"; [ -n "$BUN" ] || BUN="$HOME/.bun/bin/bun"
ADB="$(command -v adb || true)"; [ -n "$ADB" ] || ADB="$HOME/Library/Android/sdk/platform-tools/adb"
BUN_DIR="$(dirname "$BUN")"
ADB_DIR="$(dirname "$ADB")"

[ -x "$BUN" ] || { echo "error: bun not found (looked at $BUN)"; exit 1; }
[ -x "$ADB" ] || echo "warning: adb not found at $ADB — the tunnel agent won't arm until adb is on PATH"

mkdir -p "$LA"

# The feeder + watchdog both need bun & adb on PATH; launchd hands processes a
# bare PATH, so we set it explicitly.
PATH_LINE="$BUN_DIR:$ADB_DIR:/usr/local/bin:/usr/bin:/bin"

write_plist() { # $1=label  $2=program-args (newline-separated)  $3=extra <dict> env entries
  local label="$1" args="$2" env_extra="${3:-}"
  local args_xml=""
  while IFS= read -r a; do
    [ -n "$a" ] && args_xml="$args_xml    <string>$a</string>"$'\n'
  done <<< "$args"
  cat > "$LA/$label.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>$label</string>
  <key>ProgramArguments</key>
  <array>
$args_xml  </array>
  <!-- WorkingDirectory + log paths live in \$HOME, NOT the repo: the repo is
       under ~/Documents, which is TCC-protected, and launchd cannot chdir into
       (or open files in) it as an agent — that fails the whole job with
       EX_CONFIG(78). The feeder/watchdog resolve their own files by absolute
       script path (import.meta), so cwd doesn't matter. -->
  <key>WorkingDirectory</key>
  <string>$HOME</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>$PATH_LINE</string>
$env_extra  </dict>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>ProcessType</key>
  <string>Background</string>
  <key>StandardOutPath</key>
  <string>$HOME/.commandthing-$label.log</string>
  <key>StandardErrorPath</key>
  <string>$HOME/.commandthing-$label.log</string>
</dict>
</plist>
PLIST
}

write_plist "com.commandthing.feeder" \
  "$BUN
run
$REPO/apps/feeder/src/index.ts" \
  "    <key>HOST</key>
    <string>0.0.0.0</string>
"

write_plist "com.commandthing.tunnel" \
  "$BUN
run
$REPO/scripts/connect.ts
4000"

reload_agent() { # $1=label — bootout if loaded, wait for teardown, then bootstrap
  local label="$1"
  launchctl bootout "$GUI/$label" 2>/dev/null || true
  # bootout is async; bootstrapping before teardown finishes returns EIO (5).
  for _ in $(seq 1 20); do
    launchctl print "$GUI/$label" >/dev/null 2>&1 || break
    sleep 0.2
  done
  launchctl bootstrap "$GUI" "$LA/$label.plist"
  launchctl enable "$GUI/$label" 2>/dev/null || true
}

# Stop labels used before the CommandThing rename so they cannot fight for :4000.
for legacy in com.carthing.feeder com.carthing.tunnel; do
  launchctl bootout "$GUI/$legacy" 2>/dev/null || true
  rm -f "$LA/$legacy.plist"
done

for label in com.commandthing.feeder com.commandthing.tunnel; do
  reload_agent "$label"
done

echo "✓ installed + started:"
echo "    com.commandthing.feeder  → feeder on :4000"
echo "    com.commandthing.tunnel  → adb reverse + kiosk auto-reload"
echo "  logs: $HOME/.commandthing-com.commandthing.feeder.log"
echo "        $HOME/.commandthing-com.commandthing.tunnel.log"
echo "  manage: launchctl print $GUI/com.commandthing.feeder   |   pnpm daemon:uninstall"
