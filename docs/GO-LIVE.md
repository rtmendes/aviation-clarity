# Go-live runbook

Three steps stand between the merged code and a working production deployment.
Two need the Vercel dashboard; one needs the Supabase SQL editor. None of them
are code changes.

## Why this is a runbook rather than something already done

The agent building this has no Postgres credential for
`supabase.insightprofit.live` (the vault's `DATABASE_URL` points at a MySQL
server, and no Postgres connection string exists there) and no Vercel API
token. So the schema and the environment variables are handed over rather than
applied.

That turned out to be the right place to stop for a second reason — see below.

---

## 1. Apply the schema

**File:** `supabase/APPLY-ALL.sql` — paste the whole thing into the Supabase SQL
editor and run it once. It is idempotent; running it twice is safe and is
tested that way in CI.

### Read this before running it

`supabase.insightprofit.live` is **shared**. It holds 626 tables in `public`
belonging to other InsightProfit applications, and three names this project
originally used were already taken by them:

| Name | Belongs to | Its columns |
| --- | --- | --- |
| `profiles` | a billing app | `stripe_customer_id`, `subscription_status`, `plan`, `trial_ends_at` |
| `products` | a funnel builder | `user_id`, `funnel_type`, `goals`, `stages`, `score`, `price` |
| `agent_runs` | another agent framework | `venture_id`, `agent_key`, `cost_cents`, `started_at` |

An unprefixed version of this schema would have been destructive, in two
separate ways:

- `create table if not exists` would have **silently skipped** those three, so
  this application would have read and written another product's tables. Its
  checkout looks up `products.slug` and `price_cents`; neither column exists on
  the funnel builder's table. `is_staff()` reads `profiles.role`; the billing
  app's `profiles` has no `role`.
- The row-level-security statements would have **enabled RLS on live tables
  belonging to those apps**. Enabling RLS hides every row from any application
  whose policies do not happen to match — an outage in a system unrelated to
  this one.

So every object here is namespaced `ac_` — tables, indexes, constraints,
triggers, functions and policies alike, because in PostgreSQL all of those
share one namespace per schema. Storage buckets are `aviation-assets-draft`
and `aviation-assets-approved`, since bucket ids are global to the instance.

**Nothing in the file reads, alters or drops any object it did not create.**
That is verified, not asserted: the file is applied to a scratch database
seeded with stand-ins for those three foreign tables, and afterwards their
rows, columns, RLS state, policies and triggers are all checked to be
unchanged.

### After it runs

19 tables appear, all prefixed `ac_`, plus two storage buckets. Both buckets
are private; every read is a signed URL.

---

## 2. Correct the Supabase URL in Vercel

`NEXT_PUBLIC_SUPABASE_URL` is currently stored as the bare hostname
`supabase.insightprofit.live`. `supabase-js` rejects that — it requires an
absolute URL — and it is the reason the deployed API has never reached the
database.

Set it to:

```
https://supabase.insightprofit.live
```

Infisical already holds the correct value under `SUPABASE_URL`; only the Vercel
copy is wrong.

`NEXT_PUBLIC_*` variables are inlined at build time, so this needs a
**redeploy**, not just a save.

---

## 3. Set the write token in Vercel

`AVIATION_CLARITY_API_TOKEN` gates every write route — creating topics,
verifying claims, approving units, storing rendered assets. Those routes run
with the Supabase secret key, which bypasses Row Level Security, so an
unauthenticated caller must never reach one. When the variable is unset the
routes **fail closed** with 503 rather than allowing writes, which is why
nothing is currently at risk from it being absent.

Generate one and set it in Vercel (and store it in Infisical alongside the
other secrets):

```bash
openssl rand -base64 32
```

---

## Verifying

```bash
curl -s https://<your-domain>/api/health | jq
```

Expect `"ok": true` and `"detail": "Connected and schema present."`

Until step 1 is done, health reports `Connected, but the schema is not applied.`
Until step 2 is done, it reports the URL as invalid and names the expected
form. Both are deliberate: an operator misconfiguration should be a legible
503, never a 500.

Then, end to end:

```bash
# generate a package (needs OPENAI_API_KEY, already set in Vercel)
curl -s -X POST https://<your-domain>/api/explain \
  -H 'content-type: application/json' \
  -d '{"topic":"Why airplanes stall","sensitivity":"safety"}' | jq '.persistence'

# the catalogue — should be empty until products are seeded, never another app's
curl -s https://<your-domain>/api/products | jq
```

That second check matters: if `/api/products` ever returns rows that look like
funnel-builder records, the prefix has been bypassed somewhere and the schema
should not be trusted.

---

## Still open after this

- No products are seeded, so there is nothing to sell yet.
- Stripe keys are not configured, so checkout returns 503 until they are.
- There is no sign-in UI; buyers can complete Checkout but cannot yet browse
  what they own from a page. `/api/entitlements` and `/api/delivery/{id}` work
  with a Supabase session token today.
