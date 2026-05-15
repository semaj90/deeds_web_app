/**
 * GET /api/couchdb/view?db=karpathy_wiki&design=wiki&view=by_cluster&startkey=[42]&endkey=[42,{}]&limit=20
 *
 * Auth-guarded proxy for CouchDB MapReduce view queries.
 * Prevents direct CouchDB credential exposure to the browser.
 *
 * Allowed databases (allowlist — add others as needed):
 *   karpathy_wiki
 *
 * Passes through: startkey, endkey, key, group, group_level, reduce, include_docs, skip, limit
 */

import { json, type RequestHandler } from '@sveltejs/kit';
import { ENV } from '$lib/server/env.server.js';

const ALLOWED_DBS = new Set(['karpathy_wiki', 'graph_recommendations']);

const PASS_THROUGH_PARAMS = new Set([
  'startkey', 'endkey', 'key', 'keys',
  'group', 'group_level', 'reduce',
  'include_docs', 'skip', 'limit',
  'descending', 'stale',
]);

const MAX_LIMIT = 200;

export const GET: RequestHandler = async ({ url, locals }) => {
  if (!locals.user) {
    return json({ error: 'Unauthorized' }, { status: 401 });
  }

  const db     = url.searchParams.get('db')     ?? 'karpathy_wiki';
  const design = url.searchParams.get('design') ?? 'wiki';
  const view   = url.searchParams.get('view');

  if (!view) {
    return json({ error: 'Missing required param: view' }, { status: 400 });
  }
  if (!ALLOWED_DBS.has(db)) {
    return json({ error: `Database not in allowlist: ${db}` }, { status: 403 });
  }

  // Build upstream query string — only forward safe pass-through params
  const upstream = new URLSearchParams();
  for (const [k, v] of url.searchParams.entries()) {
    if (!PASS_THROUGH_PARAMS.has(k)) continue;
    if (k === 'limit') {
      upstream.set('limit', String(Math.min(Number(v) || 20, MAX_LIMIT)));
    } else {
      upstream.set(k, v);
    }
  }
  if (!upstream.has('limit')) upstream.set('limit', '20');

  const couchUrl  = ENV.COUCHDB_URL ?? 'http://admin:legal_ai_pass@127.0.0.1:5984';
  const viewPath  = `${couchUrl}/${db}/_design/${design}/_view/${view}?${upstream.toString()}`;

  try {
    const res = await fetch(viewPath, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) {
      const body = await res.text();
      return json({ error: `CouchDB ${res.status}`, detail: body }, { status: res.status >= 500 ? 502 : res.status });
    }
    const data = await res.json();
    return json(data);
  } catch (err) {
    return json({ error: 'CouchDB unreachable', detail: String(err) }, { status: 503 });
  }
};
