import 'server-only';

import { getAdminSupabase, getSupabase, type Client } from '@/lib/supabase/server';
import type {
  ClaimRow,
  KnowledgeUnitRow,
  ReviewerRow,
  SourceRow,
} from '@/lib/supabase/types';

import type { Result } from './index';

/**
 * The verification pipeline.
 *
 * Reads go through the publishable key; every write goes through the secret
 * key because review decisions are staff actions, not user actions.
 *
 * The two rules that make review meaningful — a claim needs a citation, and a
 * unit needs all its claims verified — are enforced by database triggers, not
 * here. These functions surface those refusals as legible errors rather than
 * re-implementing the checks, so there is exactly one place the rule lives.
 */

type RepoError = {
  code: 'not_configured' | 'unavailable' | 'invalid' | 'not_found';
  message: string;
  missing?: string[];
  invalid?: string[];
};

function err(code: RepoError['code'], message: string): Result<never> {
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
 * Turns a database refusal into something a reviewer can act on.
 *
 * The trigger messages are precise but read as database errors; a reviewer
 * needs to know what to do next, not which constraint fired.
 */
function explainWriteFailure(message: string): Result<never> {
  if (/without at least one cited source/i.test(message)) {
    return err('invalid', 'Cite at least one source before verifying this claim.');
  }
  if (/still unverified/i.test(message)) {
    return err(
      'invalid',
      'This unit still has unverified claims. Verify every claim before approving it.',
    );
  }
  if (/approval_is_attributable/i.test(message)) {
    return err('invalid', 'An approval must record which reviewer made it.');
  }
  if (/violates foreign key.*reviewer/i.test(message)) {
    return err('not_found', 'No such reviewer.');
  }
  return err('unavailable', message);
}

// ---------------------------------------------------------------------------
// Reviewers
// ---------------------------------------------------------------------------

export async function listReviewers(): Promise<Result<ReviewerRow[]>> {
  return withClient(true, async (client) => {
    const { data, error } = await client
      .from('reviewers')
      .select('*')
      .eq('active', true)
      .order('name');
    if (error) return err('unavailable', error.message);
    return { ok: true, data: data ?? [] };
  });
}

export async function getReviewer(id: string): Promise<Result<ReviewerRow>> {
  return withClient(true, async (client) => {
    const { data, error } = await client.from('reviewers').select('*').eq('id', id).maybeSingle();
    if (error) return err('unavailable', error.message);
    if (!data) return err('not_found', 'No such reviewer.');
    if (!data.active) return err('invalid', 'That reviewer is no longer active.');
    return { ok: true, data };
  });
}

// ---------------------------------------------------------------------------
// Claims
// ---------------------------------------------------------------------------

export type NewClaim = {
  body: string;
  risk: 'low' | 'medium' | 'high';
  knowledgeUnitId: string;
  topicId?: string | null;
};

/** Records what a generated package asserted that a human still has to check. */
export async function createClaims(claims: NewClaim[]): Promise<Result<ClaimRow[]>> {
  if (claims.length === 0) return { ok: true, data: [] };

  return withClient(true, async (client) => {
    const { data, error } = await client
      .from('claims')
      .insert(
        claims.map((c) => ({
          body: c.body,
          risk: c.risk,
          knowledge_unit_id: c.knowledgeUnitId,
          topic_id: c.topicId ?? null,
          verified: false,
        })),
      )
      .select();

    if (error) return err('unavailable', error.message);
    return { ok: true, data: data ?? [] };
  });
}

export type ReviewQueueEntry = {
  unit: KnowledgeUnitRow;
  claims: ClaimRow[];
  unverifiedCount: number;
  readyToApprove: boolean;
};

/**
 * What is waiting for a human, hardest first.
 *
 * Ordered by unverified high-risk claims descending: the units carrying the
 * most regulatory or operational exposure surface at the top, because that is
 * where a reviewer's time is worth most.
 */
export async function listReviewQueue(limit = 25): Promise<Result<ReviewQueueEntry[]>> {
  const bounded = Math.min(Math.max(limit, 1), 100);

  return withClient(true, async (client) => {
    const { data: units, error: unitError } = await client
      .from('knowledge_units')
      .select('*')
      .in('status', ['review', 'draft'])
      .order('created_at', { ascending: false })
      .limit(bounded);

    if (unitError) return err('unavailable', unitError.message);
    if (!units || units.length === 0) return { ok: true, data: [] };

    const { data: claims, error: claimError } = await client
      .from('claims')
      .select('*')
      .in('knowledge_unit_id', units.map((u) => u.id));

    if (claimError) return err('unavailable', claimError.message);

    const byUnit = new Map<string, ClaimRow[]>();
    for (const claim of claims ?? []) {
      if (!claim.knowledge_unit_id) continue;
      const list = byUnit.get(claim.knowledge_unit_id) ?? [];
      list.push(claim);
      byUnit.set(claim.knowledge_unit_id, list);
    }

    const entries: ReviewQueueEntry[] = units.map((unit) => {
      const unitClaims = byUnit.get(unit.id) ?? [];
      const unverifiedCount = unitClaims.filter((c) => !c.verified).length;
      return {
        unit,
        claims: unitClaims,
        unverifiedCount,
        readyToApprove: unverifiedCount === 0 && unit.status !== 'approved',
      };
    });

    const riskWeight = { high: 3, medium: 2, low: 1 } as const;
    entries.sort((a, b) => {
      const score = (e: ReviewQueueEntry) =>
        e.claims.filter((c) => !c.verified).reduce((n, c) => n + riskWeight[c.risk], 0);
      return score(b) - score(a);
    });

    return { ok: true, data: entries };
  });
}

// ---------------------------------------------------------------------------
// Review decisions
// ---------------------------------------------------------------------------

export type VerifyClaimInput = {
  claimId: string;
  reviewerId: string;
  sourceIds: string[];
  note?: string;
};

/**
 * Verifies one claim against the sources a reviewer cites.
 *
 * The citations are written first so that, if the claim update is then refused,
 * nothing has been marked verified. The reverse order would leave a verified
 * claim standing on whatever citations happened to land.
 */
export async function verifyClaim(input: VerifyClaimInput): Promise<Result<ClaimRow>> {
  if (input.sourceIds.length === 0) {
    return err('invalid', 'Cite at least one source before verifying this claim.');
  }

  return withClient(true, async (client) => {
    const { data: sources, error: sourceError } = await client
      .from('sources')
      .select('id')
      .in('id', input.sourceIds);

    if (sourceError) return err('unavailable', sourceError.message);
    if ((sources ?? []).length !== input.sourceIds.length) {
      return err('not_found', 'One or more cited sources do not exist.');
    }

    const { error: linkError } = await client
      .from('claim_sources')
      .upsert(input.sourceIds.map((source_id) => ({ claim_id: input.claimId, source_id })));

    if (linkError) return err('unavailable', linkError.message);

    const { data, error } = await client
      .from('claims')
      .update({
        verified: true,
        verified_at: new Date().toISOString(),
        reviewer_id: input.reviewerId,
        review_note: input.note ?? null,
      })
      .eq('id', input.claimId)
      .select()
      .maybeSingle();

    if (error) return explainWriteFailure(error.message);
    if (!data) return err('not_found', 'No such claim.');

    await client.from('review_events').insert({
      reviewer_id: input.reviewerId,
      entity_type: 'claim',
      entity_id: input.claimId,
      action: 'verified',
      note: input.note ?? null,
      source_ids: input.sourceIds,
    });

    return { ok: true, data };
  });
}

export type ApproveUnitInput = {
  unitId: string;
  reviewerId: string;
  note?: string;
};

/**
 * Approves a knowledge unit. Refused by the database while any of its claims
 * is unverified, which is the point of the phase.
 */
export async function approveKnowledgeUnit(
  input: ApproveUnitInput,
): Promise<Result<KnowledgeUnitRow>> {
  return withClient(true, async (client) => {
    const { data, error } = await client
      .from('knowledge_units')
      .update({
        status: 'approved',
        approved_by: input.reviewerId,
        approved_at: new Date().toISOString(),
      })
      .eq('id', input.unitId)
      .select()
      .maybeSingle();

    if (error) return explainWriteFailure(error.message);
    if (!data) return err('not_found', 'No such knowledge unit.');

    await client.from('review_events').insert({
      reviewer_id: input.reviewerId,
      entity_type: 'knowledge_unit',
      entity_id: input.unitId,
      action: 'approved',
      note: input.note ?? null,
    });

    return { ok: true, data };
  });
}

// ---------------------------------------------------------------------------
// Sources
// ---------------------------------------------------------------------------

export type NewSource = {
  title: string;
  url: string;
  sourceType: SourceRow['source_type'];
  notes?: string;
};

export async function createSource(input: NewSource): Promise<Result<SourceRow>> {
  return withClient(true, async (client) => {
    // Authority follows the kind of document, not the caller's opinion of it.
    const authority =
      input.sourceType === 'faa' || input.sourceType === 'regulation' || input.sourceType === 'government'
        ? 1.0
        : 0.7;

    const { data, error } = await client
      .from('sources')
      .insert({
        title: input.title,
        url: input.url,
        source_type: input.sourceType,
        authority_score: authority,
        notes: input.notes ?? null,
      })
      .select()
      .maybeSingle();

    if (error) {
      if (/duplicate key|sources_url_key/i.test(error.message)) {
        return err('invalid', 'That source URL is already registered.');
      }
      return err('unavailable', error.message);
    }
    if (!data) return err('unavailable', 'Insert returned no row.');
    return { ok: true, data };
  });
}
