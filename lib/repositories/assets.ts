import 'server-only';

import { getAdminSupabase, getSupabase, type Client } from '@/lib/supabase/server';
import type { AssetType, ContentAssetRow, Json } from '@/lib/supabase/types';
import type { ReviewStateKey } from '@/lib/design/tokens';

import type { Result } from './index';

/**
 * Rendered assets and their provenance.
 *
 * A row here is the record that a specific set of bytes was produced from a
 * specific template version and set of inputs. It is what makes an asset
 * auditable after the fact: which design generation it belongs to, which
 * knowledge unit it is making a claim about, and whether the bytes on disk are
 * still the ones that were reviewed.
 */

function err(
  code: 'not_configured' | 'unavailable' | 'invalid' | 'not_found',
  message: string,
): Result<never> {
  return { ok: false, error: { code, message } };
}

async function withClient<T>(
  privileged: boolean,
  fn: (client: Client) => Promise<Result<T>>,
): Promise<Result<T>> {
  const result = privileged ? getAdminSupabase() : getSupabase();
  if (!result.ok) {
    return {
      ok: false,
      error: {
        code: 'not_configured',
        message:
          result.invalid.length > 0
            ? 'Supabase is misconfigured for this environment.'
            : 'Supabase is not configured for this environment.',
        missing: result.missing,
        invalid: result.invalid,
      },
    };
  }
  try {
    return await fn(result.client);
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : 'Unknown transport error';
    return err('unavailable', `Could not reach Supabase: ${message}`);
  }
}

/**
 * The `content_assets.status` an asset gets from the review state of the
 * content behind it.
 *
 * Never 'published': publication requires a recorded human approval, which the
 * database enforces as a check constraint. Rendering artwork is not that
 * approval — it is a rendering of content someone else already approved.
 */
function statusFor(state: ReviewStateKey): ContentAssetRow['status'] {
  switch (state) {
    case 'approved':
      return 'approved';
    case 'blocked':
      return 'blocked';
    case 'review':
      return 'qa';
    case 'draft':
    default:
      return 'generating';
  }
}

export type RecordRenderedAssetInput = {
  assetType: AssetType;
  knowledgeUnitId: string | null;
  productId: string | null;
  title: string;
  state: ReviewStateKey;
  templateVersion: string;
  renderInput: Json;
  bucket: string;
  path: string;
  checksum: string;
};

/**
 * Writes the provenance row for one stored render.
 *
 * Storage paths are content-addressed, so re-rendering identical artwork
 * targets a row that already exists. That is treated as the same asset rather
 * than a second one: the unique index on (bucket, path) is the authority, and a
 * conflict resolves to an update of the existing row.
 */
export async function recordRenderedAsset(
  input: RecordRenderedAssetInput,
): Promise<Result<ContentAssetRow>> {
  return withClient(true, async (client) => {
    const { data, error } = await client
      .from('ac_content_assets')
      .upsert(
        {
          asset_type: input.assetType,
          knowledge_unit_id: input.knowledgeUnitId,
          product_id: input.productId,
          title: input.title,
          status: statusFor(input.state),
          template_version: input.templateVersion,
          render_input: input.renderInput,
          storage_bucket: input.bucket,
          storage_path: input.path,
          checksum: input.checksum,
        },
        { onConflict: 'storage_bucket,storage_path' },
      )
      .select()
      .single();

    if (error) return err('unavailable', error.message);
    if (!data) return err('unavailable', 'Insert returned no row.');
    return { ok: true, data };
  });
}

/**
 * One asset by id, read privileged.
 *
 * Access is decided by the entitlement check in the delivery route, which is
 * the only gate that can answer "has this person paid for this". Layering an
 * anon read underneath it looked like defence in depth and was the opposite:
 * the `anon` policy admits only assets that are published *and* attached to no
 * product, which is precisely the set nobody buys — so every purchased asset
 * read back as no row, and the buyer got a 404 instead of their download.
 */
export async function getContentAsset(id: string): Promise<Result<ContentAssetRow>> {
  return withClient(true, async (client) => {
    const { data, error } = await client
      .from('ac_content_assets')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error) return err('unavailable', error.message);
    if (!data) return err('not_found', 'No such asset.');
    return { ok: true, data };
  });
}
