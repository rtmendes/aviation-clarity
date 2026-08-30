#!/usr/bin/env bash
# Re-checks that every URL in the source registry still resolves.
#
# A citation registry rots: federal handbook URLs move, and a reviewer who
# clicks a dead citation has no way to verify the claim it backs. Run this
# periodically, not just at seed time.
#
#   npm run verify:sources
set -uo pipefail

SEED='supabase/seed/authoritative-sources.sql'
ok=0
dead=0

printf 'Checking source registry URLs:\n'

# Pull the URL out of each seeded row.
while read -r url; do
  code=$(curl -sS -o /dev/null -w '%{http_code}' -L --max-time 25 "$url" 2>/dev/null || echo 'ERR')
  if [[ "$code" == '200' ]]; then
    printf '  OK    %s\n' "$url"
    ok=$((ok + 1))
  else
    printf '  DEAD  %-4s %s\n' "$code" "$url"
    dead=$((dead + 1))
  fi
done < <(grep -oE "'https?://[^']+'" "$SEED" | tr -d "'" | sort -u)

printf '\n%d reachable, %d unreachable\n' "$ok" "$dead"

if [[ $dead -gt 0 ]]; then
  printf 'Replace or remove unreachable sources before a reviewer cites them.\n' >&2
  exit 1
fi
