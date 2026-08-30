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
  topics: [
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
  sources: [
    {
      id: '22222222-2222-2222-2222-222222222222',
      title: 'FAA Airplane Flying Handbook',
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
  content_assets: [],
  agent_runs: [],
};

/** Records what each request presented, so the harness can assert on it. */
export const seen = [];

const server = createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const match = /^\/rest\/v1\/([a-z_]+)$/.exec(url.pathname);

  const apikey = req.headers['apikey'];
  const auth = String(req.headers['authorization'] ?? '').replace(/^Bearer\s+/i, '');

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

  if (req.method === 'GET') {
    let result = rows;
    for (const [key, value] of url.searchParams) {
      if (key === 'select' || key === 'order' || key === 'limit') continue;
      const eq = /^eq\.(.*)$/.exec(value);
      if (eq) result = result.filter((row) => String(row[key]) === eq[1]);
    }
    const limit = Number(url.searchParams.get('limit') ?? result.length);
    return send(200, result.slice(0, limit));
  }

  if (req.method === 'POST') {
    // Writes must arrive on the secret key; the publishable key would be
    // stopped by RLS on the real instance.
    if (!privileged) return send(401, { message: 'new row violates row-level security policy' });

    let raw = '';
    req.on('data', (chunk) => (raw += chunk));
    req.on('end', () => {
      const body = JSON.parse(raw || '{}');
      const input = Array.isArray(body) ? body[0] : body;
      const now = new Date().toISOString();
      const row = {
        id: crypto.randomUUID(),
        created_at: now,
        updated_at: now,
        status: 'queued',
        priority: 3,
        sensitivity: 'technical',
        ...input,
      };
      rows.push(row);
      send(201, [row]);
    });
    return;
  }

  return send(405, { message: 'method not allowed' });
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`postgrest-stub listening on http://127.0.0.1:${PORT}`);
});
