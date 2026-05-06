/**
 * GET  /api/codebase-index/ingest-log
 *   Query params:
 *     type=ast_parse|embed_index|rag_hit   (omit = combined tail)
 *     limit=<n>                            (default 100, max 500)
 *     since=<unix-ms>                      (filter to entries after this timestamp)
 *     source=redis                         (read rag_hit blobs from Redis hg:rag_hits ZSET)
 *   Returns: { entries, stats, meta }
 *
 * DELETE /api/codebase-index/ingest-log
 *   Query params:
 *     type=ast_parse|embed_index|rag_hit   (omit = clear all three rings)
 *   Returns: { cleared, type }
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { ingestLogger } from '$lib/server/indexer/ast-ingest-logger.js';
import type { IngestLogEvent } from '$lib/server/indexer/ast-ingest-logger.js';

const MAX_LIMIT = 500;
const HG_RAG_HITS_KEY = 'hg:rag_hits';

export const GET: RequestHandler = async ({ locals, url }) => {
  if (!locals.user) {
    return json({ entries: [], stats: null, meta: { error: 'Unauthorized' } }, { status: 401 });
  }

  const type = url.searchParams.get('type') as IngestLogEvent['type'] | null;
  const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '100', 10) || 100, MAX_LIMIT);
  const since = parseInt(url.searchParams.get('since') ?? '0', 10) || 0;
  const source = url.searchParams.get('source');

  // Redis source: read rag_hit blobs from hg:rag_hits ZSET (4D topology view)
  if (source === 'redis') {
    try {
      const { getRedis } = await import('$lib/server/redis.js');
      const redis = getRedis();
      const minScore = since > 0 ? since : '-inf';
      const hashes = await redis.zrevrangebyscore(HG_RAG_HITS_KEY, '+inf', minScore, 'LIMIT', 0, limit);
      if (hashes.length === 0) {
        return json({ entries: [], stats: ingestLogger.getStats(), meta: { source: 'redis', returned: 0 } });
      }
      const raws = await redis.mget(hashes.map((h) => `rag:hit:${h}`));
      // simdjson AVX2 fast-parse for ≥10/≥5KB aggregate. RAG hit blobs ~2-10KB.
      const totalChars = raws.reduce((sum, r) => sum + (r?.length ?? 0), 0);
      let parseFn: (s: string) => unknown = (s) => JSON.parse(s);
      if (raws.length >= 10 && totalChars >= 5_000) {
        try {
          const { fastJsonParse, isSimdJsonAvailable } = await import('$lib/server/gpu/simdjson-bridge.js');
          if (isSimdJsonAvailable()) parseFn = fastJsonParse;
        } catch { /* addon unavailable — keep V8 */ }
      }
      const entries = raws
        .filter((r): r is string => r != null)
        .map((r) => { try { return parseFn(r); } catch { return null; } })
        .filter(Boolean);
      return json({ entries, stats: ingestLogger.getStats(), meta: { source: 'redis', returned: entries.length } });
    } catch (err) {
      return json({ entries: [], stats: null, meta: { source: 'redis', error: String(err) } });
    }
  }

  // In-memory source (default)
  let entries: readonly IngestLogEvent[];

  if (type === 'ast_parse') {
    entries = ingestLogger.getAstParseLog(limit);
  } else if (type === 'embed_index') {
    entries = ingestLogger.getEmbedIndexLog(limit);
  } else if (type === 'rag_hit') {
    entries = ingestLogger.getRagHitLog(limit);
  } else {
    entries = ingestLogger.getTail(limit);
  }

  if (since > 0) {
    entries = (entries as IngestLogEvent[]).filter((e) => e.ts > since);
  }

  const stats = ingestLogger.getStats();

  return json({
    entries,
    stats,
    meta: {
      returned: entries.length,
      limit,
      since: since > 0 ? since : null,
      type: type ?? 'all',
      source: 'memory',
    },
  });
};

export const DELETE: RequestHandler = async ({ locals, url }) => {
  if (!locals.user) {
    return json({ cleared: false, error: 'Unauthorized' }, { status: 401 });
  }

  const type = url.searchParams.get('type') as IngestLogEvent['type'] | null;

  if (type === 'ast_parse' || type === 'embed_index' || type === 'rag_hit') {
    ingestLogger.clearType(type);
    return json({ cleared: true, type });
  }

  ingestLogger.clearAll();
  return json({ cleared: true, type: 'all' });
};
