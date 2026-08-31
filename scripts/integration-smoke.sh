#!/usr/bin/env bash
# Connectivity check against the self-hosted Supabase instance.
#
# Run with Infisical so no credentials are written to disk:
#   infisical run --env=dev --path=/aviation-clarity -- bash scripts/integration-smoke.sh
#
# Only presence and status are printed. No secret value is ever echoed.
set -uo pipefail

: "${SUPABASE_URL:=${NEXT_PUBLIC_SUPABASE_URL:-https://supabase.insightprofit.live}}"

KEY="${NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:-${SUPABASE_PUBLISHABLE_KEY:-${NEXT_PUBLIC_SUPABASE_ANON_KEY:-${SUPABASE_ANON_KEY:-}}}}"

failures=0

printf '\n== Aviation Clarity integration smoke test ==\n'
printf 'Supabase URL: %s\n' "$SUPABASE_URL"
if [[ -n "$KEY" ]]; then
  printf 'API key:      present (authenticated checks enabled)\n'
else
  printf 'API key:      absent (gateway-reachability checks only)\n'
fi

# The Supabase gateway answers an unauthenticated request with 401
# ("No API key found in request"). That is proof the gateway is alive, so it
# counts as reachable — treating it as a failure, as an earlier version of this
# script did, reports a perfectly healthy instance as down.
# probe <label> <url> <expected-codes> [--no-key]
probe() {
  local label=$1 url=$2 expected=$3 with_key=${4:-with-key}
  local args=(-sS -o /dev/null -w '%{http_code}' --max-time 20)
  if [[ -n "$KEY" && "$with_key" == 'with-key' ]]; then
    args+=(-H "apikey: $KEY" -H "Authorization: Bearer $KEY")
  fi

  local code
  if ! code=$(curl "${args[@]}" "$url" 2>/dev/null); then
    printf '  FAIL  %-22s could not connect (DNS, TLS or network)\n' "$label"
    failures=$((failures + 1))
    return
  fi

  if [[ " $expected " == *" $code "* ]]; then
    printf '  OK    %-22s HTTP %s\n' "$label" "$code"
  else
    printf '  FAIL  %-22s HTTP %s (expected one of: %s)\n' "$label" "$code" "$expected"
    failures=$((failures + 1))
  fi
}

printf '\n[1/3] Gateway reachability\n'
if [[ -n "$KEY" ]]; then
  # With a valid key PostgREST answers 200; 404 means the schema is not applied.
  probe 'REST gateway' "$SUPABASE_URL/rest/v1/"               '200 404'
  probe 'Auth gateway' "$SUPABASE_URL/auth/v1/settings"        '200'
  # ac_topics, not topics. This instance is shared, and an unprefixed probe
  # both checks the wrong thing and would have passed on a 404 — reporting a
  # healthy system while confirming nothing. 404 stays accepted because it is
  # the honest answer before the schema is applied.
  probe 'ac_topics table' "$SUPABASE_URL/rest/v1/ac_topics?limit=1"  '200 401 404'
else
  probe 'REST gateway' "$SUPABASE_URL/rest/v1/"         '200 401'
  probe 'Auth gateway' "$SUPABASE_URL/auth/v1/settings" '200 401'
fi

printf '\n[2/3] Required environment names (values never printed)\n'
for key in SUPABASE_URL NEXT_PUBLIC_SUPABASE_URL; do
  if [[ -n "${!key:-}" ]]; then printf '  OK    %-38s present\n' "$key"
  else printf '  WARN  %-38s missing\n' "$key"; fi
done

if [[ -n "$KEY" ]]; then
  printf '  OK    %-38s present\n' 'publishable/anon key'
else
  printf '  FAIL  %-38s missing\n' 'publishable/anon key'
  failures=$((failures + 1))
fi

for key in SUPABASE_SECRET_KEY SUPABASE_SERVICE_ROLE_KEY; do
  [[ -n "${!key:-}" ]] && printf '  OK    %-38s present\n' "$key"
done

[[ -n "${AVIATION_CLARITY_API_TOKEN:-}" ]] \
  && printf '  OK    %-38s present\n' 'AVIATION_CLARITY_API_TOKEN' \
  || printf '  WARN  %-38s missing (writes disabled)\n' 'AVIATION_CLARITY_API_TOKEN'

printf '\n[3/3] Application health endpoint\n'
if [[ -n "${APP_URL:-}" ]]; then
  # The application is not the Supabase gateway, so the key is not sent here.
  probe 'app /api/health' "${APP_URL%/}/api/health" '200' --no-key
else
  printf '  SKIP  set APP_URL to check the deployed health endpoint\n'
fi

printf '\n'
if [[ $failures -eq 0 ]]; then
  printf 'Smoke test passed.\n'
  exit 0
fi
printf 'Smoke test failed with %d problem(s).\n' "$failures"
exit 1
