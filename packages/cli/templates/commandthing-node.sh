#!/bin/sh

preferred_node="$1"
shift

supports_commandthing() {
  [ -x "$1" ] && "$1" -e 'process.exit(Number(process.versions.node.split(".")[0]) >= 26 ? 0 : 1)' >/dev/null 2>&1
}

if supports_commandthing "$preferred_node"; then
  exec "$preferred_node" "$@"
fi

for candidate in \
  "$HOME/.volta/bin/node" \
  "$HOME/.local/share/mise/shims/node" \
  "$HOME/.asdf/shims/node" \
  /opt/homebrew/bin/node \
  /usr/local/bin/node \
  /usr/bin/node
do
  if supports_commandthing "$candidate"; then
    exec "$candidate" "$@"
  fi
done

for candidate in "$HOME"/.nvm/versions/node/*/bin/node
do
  if supports_commandthing "$candidate"; then
    exec "$candidate" "$@"
  fi
done

echo "CommandThing requires Node.js 26 or newer. Run: npx commandthing@latest setup" >&2
exit 78
