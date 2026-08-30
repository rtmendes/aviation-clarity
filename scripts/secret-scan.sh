#!/usr/bin/env bash
# Fails the build if anything that looks like a live credential is tracked in git.
# This is a coarse net, not a replacement for a secret manager — it exists so an
# accidental paste never reaches the default branch.
set -euo pipefail

patterns=(
  'sk-[A-Za-z0-9_-]{20,}'          # OpenAI-style secret key
  'sk_live_[A-Za-z0-9]{16,}'       # Stripe live secret
  'rk_live_[A-Za-z0-9]{16,}'       # Stripe live restricted
  'whsec_[A-Za-z0-9]{16,}'         # Stripe webhook secret
  'sb_secret_[A-Za-z0-9_-]{16,}'   # Supabase secret key (current naming)
  'service_role'                   # legacy Supabase service-role JWT claim
  'eyJ[A-Za-z0-9_-]{20,}\.eyJ[A-Za-z0-9_-]{20,}\.'  # any JWT
  'postgres(ql)?://[^ \n"]*:[^ \n"@]+@'             # DSN with inline password
)

# Documentation and this scanner itself legitimately name these tokens.
excluded=':(exclude)scripts/secret-scan.sh :(exclude)docs/ :(exclude)*.md'

status=0
for pattern in "${patterns[@]}"; do
  if matches=$(git grep -nIE "$pattern" -- . $excluded 2>/dev/null); then
    printf 'Potential secret matching /%s/:\n%s\n\n' "$pattern" "$matches" >&2
    status=1
  fi
done

if [[ $status -ne 0 ]]; then
  echo 'Secret scan failed. Move these values into Infisical or Vercel environment variables.' >&2
  exit 1
fi

echo 'Secret scan clean.'
