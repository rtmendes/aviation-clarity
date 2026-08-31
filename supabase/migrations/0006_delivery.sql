-- Aviation Clarity — asset delivery and the storage side of entitlements
--
-- Apply after 0005_commerce.sql:
--   psql "$POSTGRES_URL" -f supabase/migrations/0006_delivery.sql
--
-- 0005 corrected a blanket `authenticated` read on the public schema once
-- customers gained accounts. The same correction was never applied to storage,
-- which is the other half of the same assumption.

-- ---------------------------------------------------------------------------
-- Storage: drafts are staff-only, and nothing is world-readable
-- ---------------------------------------------------------------------------
--
-- 0004 gave `assets-draft` a read policy for `authenticated`, which was sound
-- while staff were the only people with accounts. It is not sound now: a
-- customer who signs in to collect a purchase is `authenticated`, and could
-- read every unreviewed render in the bucket. Drafts become staff-only.
--
-- `assets-approved` was public — served to anyone who has the path. Paths are
-- SHA-256 content hashes and so not guessable, but an unguessable URL is not
-- access control, and approved artwork now includes material people have paid
-- for. Both buckets become private and every read goes out as a signed URL
-- minted by a route that has already checked the entitlement. Nothing is lost
-- publicly: free artwork is served by rendering it at /api/assets/{kind},
-- never by reading the bucket.

do $$
begin
  if to_regclass('storage.buckets') is null then
    raise notice 'storage schema not present; skipping bucket hardening';
    return;
  end if;

  update storage.buckets set public = false where id in ('aviation-assets-draft', 'aviation-assets-approved');
end;
$$;

do $$
begin
  if to_regclass('storage.objects') is null then
    return;
  end if;

  execute 'drop policy if exists ac_assets_draft_read_authenticated on storage.objects';
  execute 'drop policy if exists ac_assets_approved_read_public on storage.objects';
  execute 'drop policy if exists ac_assets_read_staff on storage.objects';

  -- Staff read either bucket directly, for review. Everyone else — including a
  -- paying customer — receives a signed URL instead, which the storage service
  -- honours without consulting these policies.
  execute $p$
    create policy ac_assets_read_staff on storage.objects
      for select to authenticated
      using (bucket_id in ('aviation-assets-draft', 'aviation-assets-approved') and public.ac_is_staff())
  $p$;
end;
$$;

-- ---------------------------------------------------------------------------
-- An asset may not claim more approval than its knowledge unit has
-- ---------------------------------------------------------------------------
--
-- The application derives an asset's review band from the unit it renders, but
-- the application is one route away from being bypassed. This is the database
-- half: a content_asset that names a knowledge unit cannot sit at 'approved'
-- while that unit is not approved.
--
-- Deferred, like the review triggers in 0003, so that a transaction may write
-- the asset and approve the unit in either order and be judged on its result.

create or replace function public.ac_assert_asset_not_overclaiming()
returns trigger
language plpgsql
as $$
declare
  unit_status text;
begin
  if new.knowledge_unit_id is null then
    return new;
  end if;

  if new.status not in ('approved', 'published') then
    return new;
  end if;

  select status into unit_status
    from public.ac_knowledge_units
   where id = new.knowledge_unit_id;

  if unit_status is distinct from 'approved' then
    raise exception
      'content asset % cannot be marked % while knowledge unit % is %',
      new.id, new.status, new.knowledge_unit_id, coalesce(unit_status, 'missing');
  end if;

  return new;
end;
$$;

drop trigger if exists ac_assets_not_overclaiming on public.ac_content_assets;
create constraint trigger ac_assets_not_overclaiming
  after insert or update on public.ac_content_assets
  deferrable initially deferred
  for each row execute function public.ac_assert_asset_not_overclaiming();

-- ---------------------------------------------------------------------------
-- Reproducibility
-- ---------------------------------------------------------------------------
--
-- The unique index from 0004 on (storage_bucket, storage_path) is what makes a
-- re-render of identical bytes resolve to the same row instead of a duplicate.
-- Named here so it can be targeted by an upsert's on-conflict clause, which a
-- partial index cannot be.

drop index if exists public.ac_content_assets_storage_key;
create unique index if not exists ac_content_assets_storage_key
  on public.ac_content_assets (storage_bucket, storage_path);
