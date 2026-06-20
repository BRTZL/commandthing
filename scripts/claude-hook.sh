#!/usr/bin/env bash
# Forwards a Claude Code hook payload (JSON on stdin) to the Car Thing feeder,
# so the dashboard can show authoritative "working / waiting on you" state.
#
# Wire it up by adding hooks to ~/.claude/settings.json (see README "Hooks").
# Must be fast and never block Claude: short timeout, always exit 0.
curl -s -m 1 -X POST "${CARTHING_FEEDER:-http://localhost:4000}/hook" \
  -H 'content-type: application/json' --data-binary @- >/dev/null 2>&1 || true
exit 0
