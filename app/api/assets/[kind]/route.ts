import { authorizeWrite } from '@/lib/auth';
import { fail, ok } from '@/lib/http';
import { renderAsset } from '@/lib/design/render';
import { resolveState, stateForUnit } from '@/lib/design/trust';
import type { TemplateKind } from '@/lib/design/templates';
import { TEMPLATE_VERSION, type ReviewStateKey } from '@/lib/design/tokens';
import { getKnowledgeUnit } from '@/lib/repositories';
import { recordRenderedAsset } from '@/lib/repositories/assets';
import { assetTypeFor, storeRenderedAsset } from '@/lib/design/storage';

export const dynamic = 'force-dynamic';
// Rasterising a 1275×1650 worksheet takes longer than a JSON response.
export const maxDuration = 30;

const KINDS: readonly TemplateKind[] = ['cover', 'social', 'worksheet'];
const STATES: readonly ReviewStateKey[] = ['approved', 'review', 'draft', 'blocked'];

type Parsed =
  | { ok: true; kind: TemplateKind; input: RenderInput; unitId: string | null; requested: ReviewStateKey | null }
  | { ok: false; response: Response };

type RenderInput = {
  title: string;
  eyebrow?: string;
  subtitle?: string;
  sourceNote?: string;
  questions?: string[];
};

/**
 * Reads everything an asset render needs out of the URL.
 *
 * Shared by GET and POST so that a stored asset is byte-identical to the one a
 * reader can fetch: same parser, same inputs, same template.
 */
function parseRequest(kind: string, url: URL): Parsed {
  if (!KINDS.includes(kind as TemplateKind)) {
    return { ok: false, response: fail(`Unknown asset kind. Expected one of: ${KINDS.join(', ')}.`, 404) };
  }

  const params = url.searchParams;

  const title = params.get('title')?.trim();
  if (!title) return { ok: false, response: fail('"title" is required.', 400) };
  if (title.length > 200) {
    return { ok: false, response: fail('"title" must be at most 200 characters.', 400) };
  }

  const stateParam = params.get('state');
  if (stateParam !== null && !STATES.includes(stateParam as ReviewStateKey)) {
    return { ok: false, response: fail(`"state" must be one of: ${STATES.join(', ')}.`, 400) };
  }

  const unitId = params.get('unitId')?.trim() || null;
  if (unitId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(unitId)) {
    return { ok: false, response: fail('"unitId" must be a UUID.', 400) };
  }

  const eyebrow = params.get('eyebrow')?.trim();
  const subtitle = params.get('subtitle')?.trim();
  const sourceNote = params.get('sourceNote')?.trim();
  // Repeated ?q= for worksheet questions, capped so one URL cannot ask for an
  // unbounded render.
  const questions = params.getAll('q').map((q) => q.trim()).filter(Boolean).slice(0, 6);

  return {
    ok: true,
    kind: kind as TemplateKind,
    unitId,
    requested: stateParam as ReviewStateKey | null,
    input: {
      title,
      ...(eyebrow ? { eyebrow } : {}),
      ...(subtitle ? { subtitle } : {}),
      ...(sourceNote ? { sourceNote } : {}),
      ...(questions.length > 0 ? { questions } : {}),
    },
  };
}

/**
 * Works out how much trust this render is allowed to claim.
 *
 * With a `unitId`, the band comes from that unit's status in the database.
 * Without one, the ceiling is `draft`: an asset whose provenance is unknown is
 * not approved, whatever the caller says. Either way a caller may ask for
 * *less* trust than is earned, and never more.
 */
async function earnedState(
  unitId: string | null,
  requested: ReviewStateKey | null,
): Promise<
  | { ok: true; state: ReviewStateKey; earned: ReviewStateKey; downgraded: boolean; ignored: boolean }
  | { ok: false; response: Response }
> {
  if (!unitId) {
    const resolved = resolveState('draft', requested);
    return { ok: true, earned: 'draft', ...resolved };
  }

  const unit = await getKnowledgeUnit(unitId);
  if (!unit.ok) {
    if (unit.error.code === 'not_found') {
      return { ok: false, response: fail('No knowledge unit with that id.', 404) };
    }
    const status = unit.error.code === 'not_configured' ? 503 : 502;
    return { ok: false, response: fail(unit.error.message, status) };
  }

  const earned = stateForUnit(unit.data.status);
  const resolved = resolveState(earned, requested);
  return { ok: true, earned, ...resolved };
}

/**
 * Renders one asset to PNG.
 *
 * Apart from the review band, everything comes from query parameters, so an
 * asset is a pure function of its URL — the same URL always produces the same
 * image, which is what makes the output cacheable and reproducible. The band is
 * the exception on purpose: it is a claim about human review, so it is read
 * from the database rather than accepted from the caller.
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ kind: string }> },
) {
  const { kind } = await context.params;
  const parsed = parseRequest(kind, new URL(request.url));
  if (!parsed.ok) return parsed.response;

  const trust = await earnedState(parsed.unitId, parsed.requested);
  if (!trust.ok) return trust.response;

  try {
    const result = await renderAsset(parsed.kind, { ...parsed.input, state: trust.state });

    return new Response(result.png as BodyInit, {
      status: 200,
      headers: {
        'content-type': result.contentType,
        // Deterministic output keyed by URL, so it is safe to cache hard. Never
        // shared: the band depends on a database read, and one reader's cached
        // "approved" must not be served after the unit is unapproved.
        'cache-control': parsed.unitId
          ? 'private, max-age=60'
          : 'public, max-age=3600, stale-while-revalidate=86400',
        'x-template-version': result.templateVersion,
        'x-asset-dimensions': `${result.width}x${result.height}`,
        'x-review-state': trust.state,
        // Says plainly when a caller asked for a band it had not earned, so a
        // forged link is visible in logs rather than silently downgraded.
        ...(trust.ignored ? { 'x-review-state-requested-ignored': String(parsed.requested) } : {}),
      },
    });
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : 'Unknown render error';
    return fail(`Could not render the asset: ${message}`, 500, {
      templateVersion: TEMPLATE_VERSION,
    });
  }
}

/**
 * Renders the same asset and keeps it.
 *
 * A published asset outlives the request that made it, so it needs a home and a
 * record of how it was produced: which template version, which inputs, and the
 * checksum of the bytes. Approval decides the bucket — approved artwork is
 * public, everything else is not — so an unreviewed worksheet cannot be handed
 * out by guessing a URL.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ kind: string }> },
) {
  const authorized = authorizeWrite(request);
  if (!authorized.ok) return fail(authorized.message, authorized.status);

  const { kind } = await context.params;
  const url = new URL(request.url);
  const parsed = parseRequest(kind, url);
  if (!parsed.ok) return parsed.response;

  const trust = await earnedState(parsed.unitId, parsed.requested);
  if (!trust.ok) return trust.response;

  const productId = url.searchParams.get('productId')?.trim() || null;

  let rendered;
  try {
    rendered = await renderAsset(parsed.kind, { ...parsed.input, state: trust.state });
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : 'Unknown render error';
    return fail(`Could not render the asset: ${message}`, 500, { templateVersion: TEMPLATE_VERSION });
  }

  const stored = await storeRenderedAsset({
    kind: parsed.kind,
    state: trust.state,
    png: rendered.png,
  });
  if (!stored.ok) {
    const status = stored.error.code === 'not_configured' ? 503 : 502;
    return fail(stored.error.message, status);
  }

  const record = await recordRenderedAsset({
    assetType: assetTypeFor(parsed.kind),
    knowledgeUnitId: parsed.unitId,
    productId,
    title: parsed.input.title,
    state: trust.state,
    templateVersion: rendered.templateVersion,
    renderInput: { kind: parsed.kind, state: trust.state, ...parsed.input },
    bucket: stored.data.bucket,
    path: stored.data.path,
    checksum: stored.data.checksum,
  });
  if (!record.ok) {
    const status = record.error.code === 'not_configured' ? 503 : 502;
    return fail(record.error.message, status);
  }

  return ok(
    {
      asset: {
        id: record.data.id,
        kind: parsed.kind,
        state: trust.state,
        bucket: stored.data.bucket,
        path: stored.data.path,
        checksum: stored.data.checksum,
        bytes: stored.data.bytes,
        templateVersion: rendered.templateVersion,
        dimensions: `${rendered.width}x${rendered.height}`,
      },
      trust: {
        earned: trust.earned,
        requested: parsed.requested,
        downgraded: trust.downgraded,
        requestIgnored: trust.ignored,
      },
    },
    201,
  );
}
