#!/usr/bin/env bash
set -euo pipefail

# Run with Infisical so no credentials are written to disk:
# infisical run --env=dev --path=/aviation-clarity -- bash scripts/integration-smoke.sh

: "${SUPABASE_URL:=https://supabase.insightprofit.live}"

printf '\n== Aviation Clarity integration smoke test ==\n'
printf 'Supabase URL: %s\n' "$SUPABASE_URL"

printf '\n[1/3] Supabase REST gateway\n'
curl -fsS -o /dev/null -w 'HTTP %{http_code}\n' "$SUPABASE_URL/rest/v1/" || {
  echo 'Supabase REST gateway is unreachable.' >&2
  exit 10
}

printf '\n[2/3] Supabase Auth gateway\n'
curl -fsS -o /dev/null -w 'HTTP %{http_code}\n' "$SUPABASE_URL/auth/v1/settings" || {
  echo 'Supabase Auth gateway is unreachable.' >&2
  exit 11
}

printf '\n[3/3] Required environment names (values never printed)\n'
for key in SUPABASE_URL NEXT_PUBLIC_SUPABASE_URL SUPABASE_PUBLISHABLE_KEY NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY; do
  if [[ -n "${!key:-}" ]]; then printf '%s: present\n' "$key"; else printf '%s: MISSING\n' "$key"; fi
done

printf '\nSmoke test complete.\n'
