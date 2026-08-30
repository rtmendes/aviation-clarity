-- Aviation Clarity — rendered asset storage and provenance (Phase 03)
--
-- Apply after 0003_review.sql:
--   psql "$POSTGRES_URL" -f supabase/migrations/0004_assets.sql
--
-- Two things: somewhere to put rendered artwork, split by whether the content
-- behind it has been approved; and a record of how each asset was made.

-- ---------------------------------------------------------------------------
-- content_assets: how this artwork was produced
-- ---------------------------------------------------------------------------
--
-- The same reasoning as PROMPT_VERSION on generated text. Without the template
-- version there is no way to tell which assets predate a design change, and so
-- no way to decide what needs re-rendering. Without the inputs, an asset cannot
-- be reproduced at all.

alter table public.content_assets
  add column if not exists template_version text;

alter table public.content_assets
  add column if not exists render_input jsonb;

alter table public.content_assets
  add column if not exists storage_bucket text;

alter table public.content_assets
  add column if not exists storage_path text;

/* SHA-256 of the rendered bytes: lets a re-render be compared against what
   was published without downloading it. */
alter table public.content_assets
  add column if not exists checksum text;

alter table public.content_assets
  add column if not exists knowledge_unit_id uuid
    references public.knowledge_units(id) on delete set null;

create index if not exists content_assets_unit_idx
  on public.content_assets (knowledge_unit_id);

create unique index if not exists content_assets_storage_key
  on public.content_assets (storage_bucket, storage_path)
  where storage_bucket is not null and storage_path is not null;

-- A stored asset must say how it was made, or it cannot be reproduced or
-- audited later.
alter table public.content_assets drop constraint if exists content_assets_render_is_traceable;
alter table public.content_assets add constraint content_assets_render_is_traceable
  check (
    storage_path is null
    or (template_version is not null and render_input is not null and checksum is not null)
  );

-- ---------------------------------------------------------------------------
-- Storage buckets
-- ---------------------------------------------------------------------------
--
-- Two buckets, mirroring the review workflow rather than one bucket with a
-- flag: a public bucket is served to anyone who guesses a path, so approval
-- has to be the thing that decides which bucket an object lives in. Moving an
-- object between buckets is then the publish step, and it is explicit.
--
-- Guarded because the storage schema belongs to the Supabase platform: on a
-- bare PostgreSQL (the migration test harness) it is absent, and this
-- migration must still apply cleanly.

do $$
begin
  if to_regclass('storage.buckets') is null then
    raise notice 'storage schema not present; skipping bucket creation';
    return;
  end if;

  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values
    ('assets-draft',    'assets-draft',    false, 10485760, array['image/png', 'image/svg+xml', 'application/pdf']),
    ('assets-approved', 'assets-approved', true,  10485760, array['image/png', 'image/svg+xml', 'application/pdf'])
  on conflict (id) do update set
    public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;
end;
$$;

-- Policies on storage.objects: drafts are readable only by authenticated
-- staff; approved artwork is public. Writes are server-side only, so no insert
-- or update policy is granted to either role.

do $$
begin
  if to_regclass('storage.objects') is null then
    return;
  end if;

  execute 'drop policy if exists assets_draft_read_authenticated on storage.objects';
  execute $p$
    create policy assets_draft_read_authenticated on storage.objects
      for select to authenticated
      using (bucket_id = 'assets-draft')
  $p$;

  execute 'drop policy if exists assets_approved_read_public on storage.objects';
  execute $p$
    create policy assets_approved_read_public on storage.objects
      for select to anon, authenticated
      using (bucket_id = 'assets-approved')
  $p$;
end;
$$;
