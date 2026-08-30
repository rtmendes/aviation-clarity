/**
 * A minimal stand-in for the PostgREST layer of Supabase.
 *
 * It implements only the surface `lib/repositories` actually uses, so the API
 * routes can be exercised end to end without credentials for the live
 * self-hosted instance. It verifies request shape, auth headers, filters and
 * response parsing — not PostgREST semantics, which the SQL migrations are
 * tested against separately.
 *
 * Usage: node scripts/postgrest-stub.mjs [port]
 */
import { createServer } from 'node:http';

const PORT = Number(process.argv[2] ?? 54321);
const PUBLISHABLE = 'stub-publishable-key';
const SECRET = 'stub-secret-key';

/** @type {Record<string, any[]>} */
const tables = {
  ac_topics: [
    {
      id: '11111111-1111-1111-1111-111111111111',
      title: 'Why airplanes stall',
      slug: 'why-airplanes-stall',
      audience: 'student pilots',
      pillar: 'learn',
      sensitivity: 'safety',
      priority: 5,
      status: 'published',
      created_by: null,
      created_at: '2026-08-01T00:00:00Z',
      updated_at: '2026-08-01T00:00:00Z',
    },
  ],
  ac_sources: [
    {
      id: '22222222-2222-2222-2222-222222222222',
      title: 'FAA-H-8083-3 — Airplane Flying Handbook',
      url: 'https://www.faa.gov/',
      source_type: 'faa',
      authority_score: 1,
      published_at: null,
      checked_at: '2026-08-01T00:00:00Z',
      notes: null,
      created_at: '2026-08-01T00:00:00Z',
      updated_at: '2026-08-01T00:00:00Z',
    },
  ],
  ac_content_assets: [],
  ac_agent_runs: [],
  ac_knowledge_units: [],
  ac_claims: [],
  ac_claim_sources: [],
  ac_review_events: [],
  ac_orders: [],
  ac_entitlements: [],
  ac_stripe_events: [],
  ac_products: [
    {
      id: '55555555-5555-5555-5555-555555555555',
      name: 'Checkride Clarity',
      slug: 'checkride-clarity',
      kind: 'toolkit',
      description: 'Concept maps, exam traps and a confidence routine.',
      price_cents: 4900,
      currency: 'usd',
      status: 'live',
      created_at: '2026-08-01T00:00:00Z',
      updated_at: '2026-08-01T00:00:00Z',
    },
    {
      id: '66666666-6666-6666-6666-666666666666',
      name: 'Unreleased Kit',
      slug: 'unreleased-kit',
      kind: 'toolkit',
      price_cents: 9900,
      currency: 'usd',
      status: 'idea',
      created_at: '2026-08-01T00:00:00Z',
      updated_at: '2026-08-01T00:00:00Z',
    },
  ],
  ac_reviewers: [
    {
      id: '33333333-3333-3333-3333-333333333333',
      name: 'Dana Reyes',
      email: null,
      credential: 'CFI',
      credential_ref: 'CFI-1234567',
      profile_id: null,
      active: true,
      created_at: '2026-08-01T00:00:00Z',
      updated_at: '2026-08-01T00:00:00Z',
    },
    {
      id: '44444444-4444-4444-4444-444444444444',
      name: 'Inactive Reviewer',
      email: null,
      credential: 'CFI',
      credential_ref: null,
      profile_id: null,
      active: false,
      created_at: '2026-08-01T00:00:00Z',
      updated_at: '2026-08-01T00:00:00Z',
    },
  ],
};

/**
 * The two database triggers from 0003_review.sql, reproduced.
 *
 * Without these the stub would accept writes the real database refuses, and
 * every API test of the review gate would pass while proving nothing. Returning
 * the real trigger wording also exercises the error mapping the routes rely on.
 */
function triggerRefusal(table, patch, row) {
  if (table === 'ac_claims' && patch.verified === true && row) {
    const cited = tables.ac_claim_sources.some((cs) => cs.claim_id === row.id);
    if (!cited) {
      return `claim ${row.id} cannot be verified without at least one cited source`;
    }
  }
  if (table === 'ac_content_assets' && ['approved', 'published'].includes(patch.status)) {
    const unitId = patch.knowledge_unit_id ?? row?.knowledge_unit_id ?? null;
    if (unitId) {
      const unit = tables.ac_knowledge_units.find((u) => u.id === unitId);
      if (!unit || unit.status !== 'approved') {
        return `content asset cannot be marked ${patch.status} while knowledge unit ${unitId} is ${unit?.status ?? 'missing'}`;
      }
    }
  }
  if (table === 'ac_knowledge_units' && patch.status === 'approved' && row) {
    const unverified = tables.ac_claims.filter(
      (c) => c.knowledge_unit_id === row.id && c.verified === false,
    ).length;
    if (unverified > 0) {
      return `knowledge unit ${row.id} cannot be approved: ${unverified} claim(s) still unverified`;
    }
    if (!patch.approved_by) {
      return 'new row violates check constraint "knowledge_units_approval_is_attributable"';
    }
  }
  return null;
}

/**
 * The `select` policies the publishable key is subject to, from 0002 and 0005.
 *
 * Reproduced because the stub had, three times, accepted a read that the live
 * instance refuses — and so passed a route that returns nothing in production.
 * A read on the publishable key that no policy admits is invisible, exactly as
 * Row Level Security makes it: PostgREST does not report a permission error,
 * it returns no row, and a route that treats "no row" as "does not exist"
 * turns an RLS mistake into a 404 nobody can explain.
 *
 * The secret key bypasses all of this, as it does on the live instance.
 */
const anonPolicies = {
  ac_topics: (r) => r.status === 'published',
  ac_sources: () => true,
  ac_claims: (r) => r.verified === true,
  ac_claim_sources: () => true,
  ac_knowledge_units: (r) => r.status === 'approved',
  ac_content_assets: (r) => r.status === 'published' && !r.product_id,
  ac_products: (r) => r.status === 'live',
  // No policy admits these to anon at all.
  ac_reviewers: () => false,
  ac_review_events: () => false,
  ac_agent_runs: () => false,
  ac_orders: () => false,
  ac_entitlements: () => false,
  ac_stripe_events: () => false,
};

/** Uploaded storage objects, keyed by "bucket/path". */
const objects = new Map();

/** Records what each request presented, so the harness can assert on it. */
export const seen = [];

const server = createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);

  // Supabase serves Auth on the same origin as REST, so session verification
  // resolves against the same base URL the app already has.
  if (url.pathname === '/auth/v1/user') {
    const token = String(req.headers['authorization'] ?? '').replace(/^Bearer\s+/i, '');
    res.writeHead(token === 'valid-buyer-token' || token === 'valid-other-token' ? 200 : 401, {
      'content-type': 'application/json',
    });
    if (token === 'valid-buyer-token') {
      return res.end(JSON.stringify({ id: '11111111-2222-3333-4444-555555555555', email: 'Buyer@Example.com' }));
    }
    if (token === 'valid-other-token') {
      return res.end(JSON.stringify({ id: '99999999-8888-7777-6666-555555555555', email: 'someone@else.com' }));
    }
    return res.end(JSON.stringify({ message: 'invalid token' }));
  }

  const apikey = req.headers['apikey'];
  const auth = String(req.headers['authorization'] ?? '').replace(/^Bearer\s+/i, '');

  // -------------------------------------------------------------------------
  // Storage
  // -------------------------------------------------------------------------
  //
  // Only the two calls lib/design/storage.ts makes: upload an object, and sign
  // a URL for one. Objects are held in memory by "bucket/path" so that a test
  // can assert an upload landed in the bucket the review state chose — which is
  // the whole point of splitting drafts from approved artwork.

  const upload = /^\/storage\/v1\/object\/(aviation-assets-[a-z]+)\/(.+)$/.exec(url.pathname);
  const sign = /^\/storage\/v1\/object\/sign\/(aviation-assets-[a-z]+)\/(.+)$/.exec(url.pathname);

  if (sign) {
    const key = `${sign[1]}/${sign[2]}`;
    let raw = '';
    req.on('data', (chunk) => (raw += chunk));
    req.on('end', () => {
      const { expiresIn } = JSON.parse(raw || '{}');
      res.writeHead(objects.has(key) ? 200 : 404, { 'content-type': 'application/json' });
      if (!objects.has(key)) return res.end(JSON.stringify({ message: 'Object not found' }));
      seen.push({ method: 'SIGN', bucket: sign[1], path: sign[2], expiresIn });
      // The real service returns a path, which supabase-js joins onto the
      // storage base URL. Returning an absolute URL here would hide a join bug.
      res.end(JSON.stringify({
        signedURL: `/object/sign/${key}?token=stub-signature&expires=${expiresIn}`,
      }));
    });
    return;
  }

  if (upload && (req.method === 'POST' || req.method === 'PUT')) {
    // Writes to storage run on the secret key for the same reason writes to
    // PostgREST do: RLS grants no insert to anon on the live instance.
    if (auth !== SECRET) {
      res.writeHead(403, { 'content-type': 'application/json' });
      return res.end(JSON.stringify({ message: 'new row violates row-level security policy' }));
    }
    const key = `${upload[1]}/${upload[2]}`;
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
      const body = Buffer.concat(chunks);
      const upsert = String(req.headers['x-upsert'] ?? '') === 'true';
      if (objects.has(key) && !upsert) {
        res.writeHead(409, { 'content-type': 'application/json' });
        return res.end(JSON.stringify({ message: 'The resource already exists' }));
      }
      objects.set(key, body);
      seen.push({
        method: 'UPLOAD',
        bucket: upload[1],
        path: upload[2],
        bytes: body.length,
        contentType: req.headers['content-type'],
      });
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ Id: key, Key: key }));
    });
    return;
  }

  const match = /^\/rest\/v1\/([a-z_]+)$/.exec(url.pathname);

  const send = (status, body) => {
    const payload = body === undefined ? '' : JSON.stringify(body);
    res.writeHead(status, {
      'content-type': 'application/json',
      'content-range': `0-${Math.max(0, (Array.isArray(body) ? body.length : 1) - 1)}/*`,
    });
    res.end(payload);
  };

  if (!match) return send(404, { message: 'no route' });

  // PostgREST rejects anything without a key, exactly as the live gateway does.
  if (!apikey) return send(401, { message: 'No API key found in request' });
  if (apikey !== PUBLISHABLE && apikey !== SECRET) {
    return send(401, { message: 'Invalid API key' });
  }

  const table = match[1];
  const rows = tables[table];
  if (!rows) return send(404, { message: `relation "public.${table}" does not exist` });

  const privileged = auth === SECRET;
  seen.push({ method: req.method, table, privileged, query: url.search });

  const applyFilters = (input) => {
    let result = input;
    for (const [key, value] of url.searchParams) {
      if (key === 'select' || key === 'order' || key === 'limit') continue;
      const eq = /^eq\.(.*)$/.exec(value);
      if (eq) {
        result = result.filter((row) => String(row[key]) === eq[1]);
        continue;
      }
      const inList = /^in\.\((.*)\)$/.exec(value);
      if (inList) {
        const wanted = inList[1].split(',').map((v) => v.replace(/^"|"$/g, ''));
        result = result.filter((row) => wanted.includes(String(row[key])));
      }
    }
    return result;
  };

  const wantsObject = String(req.headers['accept'] ?? '').includes('vnd.pgrst.object+json');

  if (req.method === 'GET') {
    const visible = privileged ? rows : rows.filter(anonPolicies[table] ?? (() => false));
    const result = applyFilters(visible);
    const limit = Number(url.searchParams.get('limit') ?? result.length);
    const page = result.slice(0, limit);
    // maybeSingle()/single() ask for a bare object.
    if (wantsObject) return send(200, page[0] ?? null);
    return send(200, page);
  }

  if (req.method === 'PATCH') {
    let raw = '';
    req.on('data', (chunk) => (raw += chunk));
    req.on('end', () => {
      const patch = JSON.parse(raw || '{}');
      const targets = applyFilters(rows);

      for (const row of targets) {
        const refusal = triggerRefusal(table, patch, row);
        if (refusal) return send(400, { message: refusal });
      }

      const updated = targets.map((row) => {
        Object.assign(row, patch, { updated_at: new Date().toISOString() });
        return row;
      });

      if (wantsObject) return send(200, updated[0] ?? null);
      return send(200, updated);
    });
    return;
  }

  if (req.method === 'POST') {
    // Writes must arrive on the secret key; the publishable key would be
    // stopped by RLS on the real instance.
    if (!privileged) return send(401, { message: 'new row violates row-level security policy' });

    let raw = '';
    req.on('data', (chunk) => (raw += chunk));
    req.on('end', () => {
      const body = JSON.parse(raw || '{}');
      const inputs = Array.isArray(body) ? body : [body];
      const now = new Date().toISOString();
      const merge = String(req.headers['prefer'] ?? '').includes('merge-duplicates');

      const conflict = inputs.find((input) => {
        if (table === 'ac_stripe_events') return rows.some((r) => r.id === input.id);
        if (table === 'ac_orders' && input.stripe_session_id) {
          return rows.some((r) => r.stripe_session_id === input.stripe_session_id);
        }
        if (table === 'ac_entitlements') {
          return rows.some(
            (r) => r.email === input.email && r.product_id === input.product_id && !r.revoked_at,
          );
        }
        return false;
      });

      if (conflict) {
        const constraint =
          table === 'ac_stripe_events' ? 'stripe_events_pkey'
          : table === 'ac_orders' ? 'orders_stripe_session_id_key'
          : 'entitlements_unique_grant';
        return send(409, {
          message: `duplicate key value violates unique constraint "${constraint}"`,
        });
      }

      for (const input of inputs) {
        const refusal = triggerRefusal(table, input, null);
        if (refusal) return send(400, { message: refusal });
      }

      const written = inputs.map((input) => {
        // claim_sources is a composite-key join table with no surrogate id.
        if (table === 'ac_claim_sources') {
          const existing = rows.find(
            (r) => r.claim_id === input.claim_id && r.source_id === input.source_id,
          );
          if (existing) return existing;
          const link = { ...input };
          rows.push(link);
          return link;
        }

        if (merge && input.url) {
          const existing = rows.find((r) => r.url === input.url);
          if (existing) {
            Object.assign(existing, input, { updated_at: now });
            return existing;
          }
        }

        // supabase-js upsert names its conflict target in ?on_conflict=, so
        // the stub resolves on the same columns the unique index covers.
        const onConflict = url.searchParams.get('on_conflict');
        if (onConflict) {
          const cols = onConflict.split(',');
          const existing = rows.find((r) =>
            cols.every((c) => input[c] !== undefined && r[c] === input[c]),
          );
          if (existing) {
            Object.assign(existing, input, { updated_at: now });
            return existing;
          }
        }

        const row = {
          id: crypto.randomUUID(),
          created_at: now,
          updated_at: now,
          status: 'queued',
          priority: 3,
          sensitivity: 'technical',
          verified: false,
          ...input,
        };
        rows.push(row);
        return row;
      });

      // PostgREST returns a bare object, not an array, when the client asks
      // for one — which is what supabase-js `.single()` does. Returning an
      // array unconditionally made `.single()` hand back the array itself, so
      // `data.id` read as undefined and the stub silently hid it.
      send(201, wantsObject ? written[0] : written);
    });
    return;
  }

  return send(405, { message: 'method not allowed' });
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`postgrest-stub listening on http://127.0.0.1:${PORT}`);
});
