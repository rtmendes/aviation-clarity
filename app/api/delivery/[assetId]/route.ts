import { getSessionUser } from '@/lib/auth/session';
import { signAssetUrl } from '@/lib/design/storage';
import { fail, ok } from '@/lib/http';
import { getContentAsset } from '@/lib/repositories/assets';
import { listEntitlements } from '@/lib/repositories/commerce';

export const dynamic = 'force-dynamic';

/** Long enough to click, short enough that a forwarded link stops working. */
const LINK_LIFETIME_SECONDS = 300;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Hands a purchased asset to the buyer who owns it.
 *
 * Three things have to hold, in this order, and each is checked against the
 * database rather than the request:
 *
 *   1. the session is real — verified with Supabase, so a revoked one fails;
 *   2. the asset belongs to a product;
 *   3. that session's email holds a live entitlement to that product.
 *
 * Only then is a short-lived signed URL minted. The entitlement is read at
 * request time, not baked into a token, so a refund revokes access on the next
 * click rather than whenever a token happens to expire.
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ assetId: string }> },
) {
  const session = await getSessionUser(request);
  if (!session.ok) return fail(session.message, session.status);

  const { assetId } = await context.params;
  if (!UUID.test(assetId)) return fail('"assetId" must be a UUID.', 400);

  const asset = await getContentAsset(assetId);
  if (!asset.ok) {
    if (asset.error.code === 'not_found') return fail('No such asset.', 404);
    return fail(asset.error.message, asset.error.code === 'not_configured' ? 503 : 502);
  }

  if (!asset.data.storage_bucket || !asset.data.storage_path) {
    return fail('That asset has not been rendered to storage yet.', 409);
  }

  // An asset attached to no product cannot be bought, so no entitlement can
  // ever grant it. Refusing is the safe reading; the alternative is handing out
  // unsold artwork to anyone with an account.
  if (!asset.data.product_id) {
    return fail('That asset is not part of a product.', 403);
  }

  const entitlements = await listEntitlements(session.user.email);
  if (!entitlements.ok) {
    return fail(
      entitlements.error.message,
      entitlements.error.code === 'not_configured' ? 503 : 502,
    );
  }

  const entitled = entitlements.data.some(
    (e) => e.product_id === asset.data.product_id && !e.revoked_at,
  );
  // Deliberately the same answer as a missing asset would give a stranger:
  // whether a given asset exists is not something an unentitled caller needs
  // to learn by probing ids.
  if (!entitled) return fail('You do not have access to that asset.', 403);

  const signed = await signAssetUrl(
    asset.data.storage_bucket,
    asset.data.storage_path,
    LINK_LIFETIME_SECONDS,
  );
  if (!signed.ok) {
    return fail(signed.error.message, signed.error.code === 'not_configured' ? 503 : 502);
  }

  return ok({
    asset: {
      id: asset.data.id,
      title: asset.data.title,
      assetType: asset.data.asset_type,
      checksum: asset.data.checksum,
      templateVersion: asset.data.template_version,
    },
    download: {
      url: signed.data.url,
      expiresInSeconds: signed.data.expiresInSeconds,
    },
  });
}
