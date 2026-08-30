import 'server-only';

import { createHash } from 'node:crypto';

import { getAdminSupabase } from '@/lib/supabase/server';
import type { AssetType } from '@/lib/supabase/types';
import type { Result } from '@/lib/repositories';

import type { TemplateKind } from './templates';
import type { ReviewStateKey } from './tokens';

/**
 * Where a rendered asset goes, and how it is handed back out.
 *
 * The bucket is chosen by review state, not by a flag on the row. A public
 * bucket serves anything to anyone who guesses a path, so "is this approved"
 * has to be the question that decides which bucket the object lives in —
 * otherwise a mistake in one query is enough to publish unreviewed aviation
 * material. Moving between buckets is then the publish step, and it is
 * explicit.
 */

/*
 * Bucket ids are global to the Supabase instance, and this one is shared with
 * several other InsightProfit applications, so they are namespaced like the
 * tables are.
 */
export const APPROVED_BUCKET = 'aviation-assets-approved';
export const DRAFT_BUCKET = 'aviation-assets-draft';

export function bucketFor(state: ReviewStateKey): string {
  return state === 'approved' ? APPROVED_BUCKET : DRAFT_BUCKET;
}

/** The `content_assets.asset_type` each template kind is stored as. */
const ASSET_TYPES: Record<TemplateKind, AssetType> = {
  cover: 'lead_magnet',
  social: 'social',
  worksheet: 'worksheet',
};

export function assetTypeFor(kind: TemplateKind): AssetType {
  return ASSET_TYPES[kind];
}

export type StoredAsset = {
  bucket: string;
  path: string;
  checksum: string;
  bytes: number;
};

function notConfigured(missing: string[], invalid: string[]): Result<never> {
  return {
    ok: false,
    error: {
      code: 'not_configured',
      message:
        invalid.length > 0
          ? 'Supabase is misconfigured for this environment.'
          : 'Supabase is not configured for this environment.',
      missing,
      invalid,
    },
  };
}

/**
 * Uploads the rendered bytes and returns where they went.
 *
 * The object path is the SHA-256 of the bytes themselves, so the same render
 * always lands on the same path and re-storing it is a no-op rather than a
 * duplicate. It also means the stored path is a verifiable claim about the
 * content: anyone holding the file can recompute it.
 */
export async function storeRenderedAsset(input: {
  kind: TemplateKind;
  state: ReviewStateKey;
  png: Uint8Array;
}): Promise<Result<StoredAsset>> {
  const client = getAdminSupabase();
  if (!client.ok) return notConfigured(client.missing, client.invalid);

  const checksum = createHash('sha256').update(input.png).digest('hex');
  const bucket = bucketFor(input.state);
  const path = `${input.kind}/${checksum}.png`;

  try {
    const { error } = await client.client.storage.from(bucket).upload(path, input.png, {
      contentType: 'image/png',
      // Content-addressed, so an existing object at this path holds these exact
      // bytes. Overwriting is safe and makes a retried request idempotent.
      upsert: true,
      cacheControl: '3600',
    });

    if (error) {
      return { ok: false, error: { code: 'unavailable', message: `Could not store the asset: ${error.message}` } };
    }
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : 'Unknown transport error';
    return { ok: false, error: { code: 'unavailable', message: `Could not reach storage: ${message}` } };
  }

  return { ok: true, data: { bucket, path, checksum, bytes: input.png.byteLength } };
}

/**
 * A short-lived URL for one stored object.
 *
 * Signed rather than public even for the approved bucket, because delivery is
 * gated on an entitlement: the link is the thing a buyer receives, and it has
 * to expire so that forwarding it does not hand over the purchase permanently.
 */
export async function signAssetUrl(
  bucket: string,
  path: string,
  expiresInSeconds = 300,
): Promise<Result<{ url: string; expiresInSeconds: number }>> {
  const client = getAdminSupabase();
  if (!client.ok) return notConfigured(client.missing, client.invalid);

  try {
    const { data, error } = await client.client.storage
      .from(bucket)
      .createSignedUrl(path, expiresInSeconds);

    if (error || !data?.signedUrl) {
      const message = error?.message ?? 'Storage returned no signed URL.';
      return { ok: false, error: { code: 'unavailable', message: `Could not sign the asset URL: ${message}` } };
    }

    return { ok: true, data: { url: data.signedUrl, expiresInSeconds } };
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : 'Unknown transport error';
    return { ok: false, error: { code: 'unavailable', message: `Could not reach storage: ${message}` } };
  }
}
