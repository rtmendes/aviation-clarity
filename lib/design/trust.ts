import type { ReviewStateKey } from './tokens';
import type { KnowledgeUnitRow } from '@/lib/supabase/types';

/**
 * How much trust an asset's artwork is allowed to claim.
 *
 * The review band exists so that unverified aviation material cannot look
 * finished. That only holds if the band reflects what a reviewer actually did.
 * Before this, `state` was a query parameter: anyone could render an emergency
 * procedure stamped REVIEWED & APPROVED for content that had never been
 * generated, let alone reviewed.
 *
 * The rule is one-directional. A caller may mark an asset as *less* trusted
 * than the database says — flagging something as blocked is always allowed —
 * but never more. Claiming approval requires a knowledge unit that is
 * genuinely approved.
 */

const RANK: Record<ReviewStateKey, number> = {
  blocked: 0,
  draft: 1,
  review: 2,
  approved: 3,
};

/**
 * The state a unit's artwork has earned.
 *
 * `verified` is deliberately not mapped to anything above `review`: in this
 * schema it means the claims check out, not that a human signed the unit off.
 * Only `approved` carries a name and a certificate number.
 */
export function stateForUnit(status: KnowledgeUnitRow['status']): ReviewStateKey {
  switch (status) {
    case 'approved':
      return 'approved';
    case 'review':
    case 'verified':
      return 'review';
    case 'draft':
    default:
      return 'draft';
  }
}

/**
 * Resolves the band to render.
 *
 * `earned` is what the database supports — `draft` when no unit was named,
 * because an asset unconnected to reviewed content has earned nothing.
 * `requested` is honoured only when it is more cautious.
 */
export function resolveState(
  earned: ReviewStateKey,
  requested: ReviewStateKey | null,
): { state: ReviewStateKey; downgraded: boolean; ignored: boolean } {
  if (!requested) return { state: earned, downgraded: false, ignored: false };
  if (RANK[requested] < RANK[earned]) {
    return { state: requested, downgraded: true, ignored: false };
  }
  return { state: earned, downgraded: false, ignored: RANK[requested] > RANK[earned] };
}
