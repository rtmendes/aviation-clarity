import { fail } from '@/lib/http';
import { renderAsset } from '@/lib/design/render';
import type { TemplateKind } from '@/lib/design/templates';
import { TEMPLATE_VERSION, type ReviewStateKey } from '@/lib/design/tokens';

export const dynamic = 'force-dynamic';
// Rasterising a 1275×1650 worksheet takes longer than a JSON response.
export const maxDuration = 30;

const KINDS: readonly TemplateKind[] = ['cover', 'social', 'worksheet'];
const STATES: readonly ReviewStateKey[] = ['approved', 'review', 'draft', 'blocked'];

/**
 * Renders one asset to PNG.
 *
 * Everything comes from query parameters, so an asset is a pure function of its
 * URL — the same URL always produces the same image, which is what makes the
 * output cacheable and reproducible.
 *
 * `state` defaults to `draft`. An asset whose review state is unknown is not
 * approved, and the artwork says so; defaulting the other way would let an
 * unreviewed worksheet render as if it were finished.
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ kind: string }> },
) {
  const { kind } = await context.params;

  if (!KINDS.includes(kind as TemplateKind)) {
    return fail(`Unknown asset kind. Expected one of: ${KINDS.join(', ')}.`, 404);
  }

  const params = new URL(request.url).searchParams;

  const title = params.get('title')?.trim();
  if (!title) return fail('"title" is required.', 400);
  if (title.length > 200) return fail('"title" must be at most 200 characters.', 400);

  const stateParam = params.get('state') ?? 'draft';
  if (!STATES.includes(stateParam as ReviewStateKey)) {
    return fail(`"state" must be one of: ${STATES.join(', ')}.`, 400);
  }

  const eyebrow = params.get('eyebrow')?.trim();
  const subtitle = params.get('subtitle')?.trim();
  const sourceNote = params.get('sourceNote')?.trim();
  // Repeated ?q= for worksheet questions, capped so one URL cannot ask for an
  // unbounded render.
  const questions = params.getAll('q').map((q) => q.trim()).filter(Boolean).slice(0, 6);

  try {
    const result = await renderAsset(kind as TemplateKind, {
      title,
      state: stateParam as ReviewStateKey,
      ...(eyebrow ? { eyebrow } : {}),
      ...(subtitle ? { subtitle } : {}),
      ...(sourceNote ? { sourceNote } : {}),
      ...(questions.length > 0 ? { questions } : {}),
    });

    return new Response(result.png as BodyInit, {
      status: 200,
      headers: {
        'content-type': result.contentType,
        // Deterministic output keyed by URL, so it is safe to cache hard.
        'cache-control': 'public, max-age=3600, stale-while-revalidate=86400',
        'x-template-version': result.templateVersion,
        'x-asset-dimensions': `${result.width}x${result.height}`,
      },
    });
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : 'Unknown render error';
    return fail(`Could not render the asset: ${message}`, 500, {
      templateVersion: TEMPLATE_VERSION,
    });
  }
}
