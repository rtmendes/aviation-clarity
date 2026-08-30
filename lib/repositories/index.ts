/**
 * Data access for Aviation Clarity.
 *
 * Every function returns a discriminated result rather than throwing, so route
 * handlers can map a database problem onto an HTTP status without a try/catch
 * around each call. Supabase errors are normalised here so that PostgREST
 * details (which can name columns and constraints) never leak to a client.
 */

import { getSupabase, getAdminSupabase, type Client } from '@/lib/supabase/server';
import type {
  AgentRunRow,
  AssetType,
  ContentAssetRow,
  KnowledgeUnitRow,
  Sensitivity,
  SourceRow,
  TopicRow,
  TopicStatus,
  Json,
} from '@/lib/supabase/types';

export type RepoError = {
  code: 'not_configured' | 'unavailable' | 'invalid' | 'not_found';
  message: string;
  /** Names of missing environment variables, when code is 'not_configured'. */
  missing?: string[];
  /** Variables that are set but unusable, when code is 'not_configured'. */
  invalid?: string[];
};

export type Result<T> = { ok: true; data: T } | { ok: false; error: RepoError };

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

function unavailable(message: string): Result<never> {
  return { ok: false, error: { code: 'unavailable', message } };
}

/** Runs `fn` against a read client, or reports why one is unavailable. */
async function withClient<T>(
  privileged: boolean,
  fn: (client: Client) => Promise<Result<T>>,
): Promise<Result<T>> {
  const result = privileged ? getAdminSupabase() : getSupabase();
  if (!result.ok) return notConfigured(result.missing, result.invalid);
  try {
    return await fn(result.client);
  } catch (cause) {
    // Network-level failure reaching the self-hosted gateway.
    const message = cause instanceof Error ? cause.message : 'Unknown transport error';
    return unavailable(`Could not reach Supabase: ${message}`);
  }
}

// ---------------------------------------------------------------------------
// Topics
// ---------------------------------------------------------------------------

export type ListTopicsOptions = {
  status?: TopicStatus;
  limit?: number;
};

export async function listTopics(
  options: ListTopicsOptions = {},
): Promise<Result<TopicRow[]>> {
  const limit = Math.min(Math.max(options.limit ?? 50, 1), 200);

  return withClient(false, async (client) => {
    let query = client
      .from('topics')
      .select('*')
      .order('priority', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(limit);

    if (options.status) query = query.eq('status', options.status);

    const { data, error } = await query;
    if (error) return unavailable(error.message);
    return { ok: true, data: data ?? [] };
  });
}

export type CreateTopicInput = {
  title: string;
  audience?: string;
  pillar?: string;
  sensitivity?: Sensitivity;
  priority?: number;
};

export async function createTopic(
  input: CreateTopicInput,
): Promise<Result<TopicRow>> {
  return withClient(true, async (client) => {
    const { data, error } = await client
      .from('topics')
      .insert({
        title: input.title,
        audience: input.audience ?? null,
        pillar: input.pillar ?? null,
        sensitivity: input.sensitivity ?? 'technical',
        priority: input.priority ?? 3,
        status: 'queued',
      })
      .select()
      .single();

    if (error) return unavailable(error.message);
    if (!data) return unavailable('Insert returned no row.');
    return { ok: true, data };
  });
}

// ---------------------------------------------------------------------------
// Sources
// ---------------------------------------------------------------------------

export async function listSources(limit = 50): Promise<Result<SourceRow[]>> {
  const bounded = Math.min(Math.max(limit, 1), 200);
  return withClient(false, async (client) => {
    const { data, error } = await client
      .from('sources')
      .select('*')
      .order('authority_score', { ascending: false })
      .limit(bounded);

    if (error) return unavailable(error.message);
    return { ok: true, data: data ?? [] };
  });
}

// ---------------------------------------------------------------------------
// Content assets
// ---------------------------------------------------------------------------

export async function listContentAssets(
  status?: TopicStatus,
  limit = 50,
): Promise<Result<ContentAssetRow[]>> {
  const bounded = Math.min(Math.max(limit, 1), 200);
  return withClient(false, async (client) => {
    let query = client
      .from('content_assets')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(bounded);

    if (status) query = query.eq('status', status);

    const { data, error } = await query;
    if (error) return unavailable(error.message);
    return { ok: true, data: data ?? [] };
  });
}

// ---------------------------------------------------------------------------
// Knowledge units
// ---------------------------------------------------------------------------

export type CreateKnowledgeUnitInput = {
  summary: string;
  learningModel: Json;
  topicId?: string | null;
  /**
   * 'review' whenever the QA gate flagged anything. A generated unit is never
   * written as 'verified': verification means a qualified human checked it
   * against an authoritative source, which no generation step can assert.
   */
  status: KnowledgeUnitRow['status'];
};

export async function createKnowledgeUnit(
  input: CreateKnowledgeUnitInput,
): Promise<Result<KnowledgeUnitRow>> {
  return withClient(true, async (client) => {
    const { data, error } = await client
      .from('knowledge_units')
      .insert({
        summary: input.summary,
        learning_model: input.learningModel,
        topic_id: input.topicId ?? null,
        status: input.status,
      })
      .select()
      .single();

    if (error) return unavailable(error.message);
    if (!data) return unavailable('Insert returned no row.');
    return { ok: true, data };
  });
}

export async function listKnowledgeUnits(limit = 25): Promise<Result<KnowledgeUnitRow[]>> {
  const bounded = Math.min(Math.max(limit, 1), 100);
  return withClient(false, async (client) => {
    const { data, error } = await client
      .from('knowledge_units')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(bounded);

    if (error) return unavailable(error.message);
    return { ok: true, data: data ?? [] };
  });
}

// ---------------------------------------------------------------------------
// Agent runs (audit trail)
// ---------------------------------------------------------------------------

export type RecordAgentRunInput = {
  agentName: string;
  topicId?: string | null;
  status: AgentRunRow['status'];
  input: Json;
  output?: Json;
  safetyFlags?: string[];
  error?: string | null;
  durationMs?: number;
};

/**
 * Persists an agent invocation.
 *
 * Auditing must never break the request it is auditing: if the write fails,
 * the caller gets an error result and decides, rather than the response being
 * lost. Callers that treat the audit trail as best-effort should ignore it.
 */
export async function recordAgentRun(
  input: RecordAgentRunInput,
): Promise<Result<AgentRunRow>> {
  return withClient(true, async (client) => {
    const { data, error } = await client
      .from('agent_runs')
      .insert({
        agent_name: input.agentName,
        topic_id: input.topicId ?? null,
        status: input.status,
        input: input.input,
        output: input.output ?? null,
        safety_flags: input.safetyFlags ?? [],
        error: input.error ?? null,
        duration_ms: input.durationMs ?? null,
      })
      .select()
      .single();

    if (error) return unavailable(error.message);
    if (!data) return unavailable('Insert returned no row.');
    return { ok: true, data };
  });
}

export async function listAgentRuns(limit = 25): Promise<Result<AgentRunRow[]>> {
  const bounded = Math.min(Math.max(limit, 1), 100);
  return withClient(true, async (client) => {
    const { data, error } = await client
      .from('agent_runs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(bounded);

    if (error) return unavailable(error.message);
    return { ok: true, data: data ?? [] };
  });
}

// ---------------------------------------------------------------------------
// Connectivity
// ---------------------------------------------------------------------------

export type DatabaseProbe = {
  reachable: boolean;
  latencyMs: number | null;
  detail: string;
  schemaReady: boolean;
};

/**
 * Actually queries the database, rather than checking that env vars are set.
 * The deployment acceptance gate in the runbook requires proof of
 * connectivity, which only a real round trip provides.
 */
export async function probeDatabase(): Promise<DatabaseProbe> {
  const client = getSupabase();
  if (!client.ok) {
    const problems = [
      ...client.missing.map((name) => `missing ${name}`),
      ...client.invalid,
    ];
    return {
      reachable: false,
      latencyMs: null,
      schemaReady: false,
      detail: `Not configured: ${problems.join('; ')}`,
    };
  }

  const startedAt = Date.now();
  try {
    // A single-row read, not an exact count: the probe runs on every health
    // check and must not degrade as the table grows.
    const { error } = await client.client.from('topics').select('id').limit(1);

    const latencyMs = Date.now() - startedAt;

    if (error) {
      // PostgREST reports an unmigrated database as an undefined table, which
      // is a different failure from an unreachable one.
      const schemaMissing = /does not exist|schema cache/i.test(error.message);
      return {
        reachable: true,
        latencyMs,
        schemaReady: false,
        detail: schemaMissing
          ? 'Connected, but the schema is not applied. Run supabase/migrations.'
          : `Connected, but the query failed: ${error.message}`,
      };
    }

    return {
      reachable: true,
      latencyMs,
      schemaReady: true,
      detail: 'Connected and schema present.',
    };
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : 'Unknown transport error';
    return {
      reachable: false,
      latencyMs: Date.now() - startedAt,
      schemaReady: false,
      detail: `Unreachable: ${message}`,
    };
  }
}

export type { AssetType, ContentAssetRow, KnowledgeUnitRow, SourceRow, TopicRow, TopicStatus };
