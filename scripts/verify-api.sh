#!/usr/bin/env bash
# End-to-end verification of the API routes against a PostgREST-compatible stub.
#
# Proves the routes construct correct requests, send the right key for the
# privilege level, enforce the write token, and parse responses — without
# needing credentials for the live self-hosted Supabase.
#
#   npm run build && bash scripts/verify-api.sh
set -euo pipefail

STUB_PORT=54321
APP_PORT=3112
TOKEN='test-operator-token'
pass=0
fail=0

# `next start` execs a child server, so killing the launcher leaves the real
# server holding the port. Each process is started in its own process group and
# the whole group is signalled, otherwise a stale server from a previous run
# answers the next one and the results are meaningless.
cleanup() {
  for pid in "${STUB_PID:-}" "${APP_PID:-}"; do
    [[ -n "$pid" ]] && kill -- "-$pid" 2>/dev/null || true
  done
}
trap cleanup EXIT

require_free_port() {
  if (exec 3<>"/dev/tcp/127.0.0.1/$1") 2>/dev/null; then
    exec 3<&- 3>&-
    echo "Port $1 is already in use; refusing to run against a stale server." >&2
    exit 1
  fi
}

require_free_port "$STUB_PORT"
require_free_port "$APP_PORT"

check() {
  local name=$1 expected=$2 actual=$3
  if [[ "$actual" == *"$expected"* ]]; then
    printf '  PASS  %s\n' "$name"; pass=$((pass + 1))
  else
    printf '  FAIL  %s\n        expected to contain: %s\n        got: %s\n' "$name" "$expected" "$actual"
    fail=$((fail + 1))
  fi
}

setsid node scripts/postgrest-stub.mjs "$STUB_PORT" >/dev/null 2>&1 &
STUB_PID=$!

NEXT_PUBLIC_SUPABASE_URL="http://127.0.0.1:$STUB_PORT" \
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY='stub-publishable-key' \
SUPABASE_SECRET_KEY='stub-secret-key' \
AVIATION_CLARITY_API_TOKEN="$TOKEN" \
  setsid npx next start -p "$APP_PORT" >/tmp/aviation-clarity-verify-app.log 2>&1 &
APP_PID=$!

BASE="http://127.0.0.1:$APP_PORT"
ready=0
for _ in $(seq 1 60); do
  # Any HTTP response means the server is listening; a 503 is a legitimate
  # answer here, so success is not conditioned on the status code.
  if curl -sS -o /dev/null "$BASE/api/health" 2>/dev/null; then ready=1; break; fi
  sleep 0.5
done
if [[ $ready -ne 1 ]]; then
  echo 'Server never became ready. Log:' >&2
  cat /tmp/aviation-clarity-verify-app.log >&2
  exit 1
fi

echo 'Verifying API routes against PostgREST stub:'

check 'health reports ok when database reachable' \
  '"ok":true' "$(curl -s "$BASE/api/health")"

check 'health reports schema present' \
  '"schemaReady":true' "$(curl -s "$BASE/api/health")"

check 'health never leaks key values' \
  '"supabaseSecretKey":true' "$(curl -s "$BASE/api/health")"

check 'topics list returns seeded row' \
  'Why airplanes stall' "$(curl -s "$BASE/api/topics")"

check 'topics status filter is applied' \
  '"count":0' "$(curl -s "$BASE/api/topics?status=queued")"

check 'sources list returns seeded row' \
  'FAA Airplane Flying Handbook' "$(curl -s "$BASE/api/sources")"

check 'unauthenticated write is rejected' \
  'Unauthorized' \
  "$(curl -s -X POST "$BASE/api/topics" -H 'content-type: application/json' -d '{"title":"nope"}')"

check 'write with wrong token is rejected' \
  'Unauthorized' \
  "$(curl -s -X POST "$BASE/api/topics" -H "authorization: Bearer wrong" -H 'content-type: application/json' -d '{"title":"nope"}')"

check 'authorised write creates a topic' \
  'Adverse yaw explained' \
  "$(curl -s -X POST "$BASE/api/topics" -H "authorization: Bearer $TOKEN" \
     -H 'content-type: application/json' -d '{"title":"Adverse yaw explained","priority":4}')"

check 'invalid priority is rejected' \
  'between 1 and 5' \
  "$(curl -s -X POST "$BASE/api/topics" -H "authorization: Bearer $TOKEN" \
     -H 'content-type: application/json' -d '{"title":"x","priority":99}')"

check 'malformed JSON is rejected' \
  'valid JSON' \
  "$(curl -s -X POST "$BASE/api/topics" -H "authorization: Bearer $TOKEN" \
     -H 'content-type: application/json' -d 'not-json')"

check 'explain records an audit run' \
  '"recorded":true' \
  "$(curl -s -X POST "$BASE/api/explain" -H 'content-type: application/json' \
     -d '{"topic":"Adverse yaw","sensitivity":"technical"}')"

check 'explain flags safety-critical topics for review' \
  '"requiresHumanReview":true' \
  "$(curl -s -X POST "$BASE/api/explain" -H 'content-type: application/json' \
     -d '{"topic":"engine failure on takeoff","sensitivity":"safety"}')"

# A misconfigured deployment must degrade to a clear 503, never a 500.
# Regression guard: a URL without a scheme made supabase-js throw out of the
# route and surface as an unhandled 500 in production.
kill -- "-$APP_PID" 2>/dev/null || true
sleep 2

NEXT_PUBLIC_SUPABASE_URL='supabase.insightprofit.live' \
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY='stub-publishable-key' \
AVIATION_CLARITY_API_TOKEN="$TOKEN" \
  setsid npx next start -p "$APP_PORT" >/tmp/aviation-clarity-verify-bad.log 2>&1 &
APP_PID=$!

for _ in $(seq 1 60); do
  curl -sS -o /dev/null "$BASE/api/health" 2>/dev/null && break
  sleep 0.5
done

check 'malformed Supabase URL yields 503, not 500' \
  '503' "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/api/health")"

check 'malformed Supabase URL is explained' \
  'absolute http(s) URL' "$(curl -s "$BASE/api/health")"

check 'routes stay up under a malformed URL' \
  '503' "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/api/topics")"

printf '\n%d passed, %d failed\n' "$pass" "$fail"
[[ $fail -eq 0 ]]
