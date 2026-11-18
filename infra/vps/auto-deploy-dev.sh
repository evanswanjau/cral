#!/usr/bin/env bash
# Deploy the DEV API whenever origin/develop moves. Lives on the VPS as
# ~/auto-deploy-dev.sh (this file is the tracked copy), run by the cral
# user's crontab every 2 minutes:
#
#   */2 * * * * /home/cral/auto-deploy-dev.sh
#
# It never deploys production and never edits ~/redeploy-dev.sh - it only
# decides *when* to run it. Results:
#   ~/deploy-dev.log     every run of ~/redeploy-dev.sh, appended
#   ~/deploy-dev.status  one line: <sha> ok|failed <UTC time>
#
# A sha is attempted once. A failed deploy is not retried every 2 minutes;
# the next push to develop tries again, or run ~/redeploy-dev.sh by hand.
# See docs/decisions/deploy.md.
set -uo pipefail

PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
REPO=/srv/cral-dev
LOG="$HOME/deploy-dev.log"
STATUS="$HOME/deploy-dev.status"
LAST="$HOME/.deploy-dev.last"   # last sha attempted, ok or not
LOCK="$HOME/.deploy-dev.lock"

exec 9>"$LOCK"
flock -n 9 || exit 0            # a deploy is already running

git -C "$REPO" fetch -q origin develop 2>/dev/null || exit 0   # GitHub unreachable: try next tick
target=$(git -C "$REPO" rev-parse FETCH_HEAD)
last=$(cat "$LAST" 2>/dev/null || true)
[ "$target" = "$last" ] && exit 0

# Keep the log from growing without bound.
if [ -f "$LOG" ] && [ "$(stat -c %s "$LOG")" -gt 2000000 ]; then
  tail -n 4000 "$LOG" > "$LOG.tmp" && mv "$LOG.tmp" "$LOG"
fi

echo "$target" > "$LAST"
{
  echo
  echo "=== $(date -u +%FT%TZ) deploying develop ${target:0:7} (was ${last:0:7})"
} >> "$LOG"

if "$HOME/redeploy-dev.sh" >> "$LOG" 2>&1; then
  # redeploy-dev.sh resets to whatever origin/develop is when it runs,
  # which may be newer than $target. Record what is actually deployed.
  sha=$(git -C "$REPO" rev-parse HEAD)
  result=ok
  echo "$sha" > "$LAST"
else
  # A failure may stop before the reset, so HEAD says nothing useful.
  # Keep $target as attempted so the same sha isn't retried every tick.
  sha=$target
  result=failed
fi

echo "$sha $result $(date -u +%FT%TZ)" > "$STATUS"
echo "=== $(date -u +%FT%TZ) $result ${sha:0:7}" >> "$LOG"
