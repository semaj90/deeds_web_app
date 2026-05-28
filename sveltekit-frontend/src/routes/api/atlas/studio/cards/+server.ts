import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';
import { withRetry, getDb } from '$lib/db/pool.js';
import { sql } from 'drizzle-orm';

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

function clampLimit(raw?: string | null) {
  const n = raw ? parseInt(raw, 10) : DEFAULT_LIMIT;
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_LIMIT;
  return Math.min(n, MAX_LIMIT);
}

function validateKind(k?: string | null) {
  if (!k || k === 'all') return 'all';
  if (k === 'rag' || k === 'cluster') return k;
  return null;
}

function normalizeRowToCard(row: any, kindHint?: 'rag' | 'cluster') {
  // Map likely column names from rag_cards or cluster_cards to normalized shape
  const kind = kindHint ?? (row.kind ?? (row.cluster_id ? 'cluster' : 'rag'));
  return {
    id: row.id ?? row.card_id ?? row.cluster_id ?? String(row.id ?? ''),
    kind,
    title: row.title ?? row.name ?? row.display_name ?? '',
    summary: row.summary ?? row.description ?? row.excerpt ?? '',
    sourceRef: row.source_ref ?? row.sourceRef ?? null,
    feature_label: row.feature_label ?? row.feature ?? null,
    tags: row.tags ?? row.payload_tags ?? row.tags_json ?? null,
    versionHash: row.version_hash ?? row.versionHash ?? null,
    createdAt: row.created_at ?? row.createdAt ?? null,
    updatedAt: row.updated_at ?? row.updatedAt ?? null
  };
}

const SAMPLE_CARDS = [
  {
    id: 'sample-rag-1',
    kind: 'rag',
    title: 'Sample RAG Card — Evidence Chunk',
    summary: 'This is a sample card shown when Postgres is unavailable.',
    sourceRef: 'sample://atlas',
    feature_label: 'sample',
    tags: ['sample'],
    versionHash: null,
    createdAt: null,
    updatedAt: null,
    degraded: true
  }
];

export const GET: RequestHandler = async ({ url }) => {
  const kindParam = url.searchParams.get('kind');
  const q = url.searchParams.get('q') ?? '';
  const limit = clampLimit(url.searchParams.get('limit'));
  const offset = Number(url.searchParams.get('offset') ?? '0') || 0;

  const kind = validateKind(kindParam);
  if (kind === null) {
    return json({ ok: false, error: 'invalid kind param' }, { status: 400 });
  }

  // Simple search clause for q (ILIKE wildcard on title/summary)
  const hasQ = q.trim().length > 0 && q.trim().length <= 200;
  const qParam = `%${q.replace(/%/g, '\\%')}%`;

  try {
    const results: any[] = [];

    // Build queries depending on kind
    if (kind === 'all' || kind === 'rag') {
      const rows = await withRetry(async () =>
        getDb().execute(sql`
          SELECT id, card_id, title, summary, source_ref, feature_label, tags, version_hash, created_at, updated_at
          FROM rag_cards
          ${hasQ ? sql`WHERE (title ILIKE ${qParam} OR summary ILIKE ${qParam})` : sql``}
          ORDER BY created_at DESC NULLS LAST
          LIMIT ${limit}
          OFFSET ${offset}
        `)
      );
      for (const r of rows) results.push(normalizeRowToCard(r, 'rag'));
    }

    if (kind === 'all' || kind === 'cluster') {
      const rows = await withRetry(async () =>
        getDb().execute(sql`
          SELECT id, cluster_id, name as title, description as summary, source_ref, feature_label, tags, version_hash, created_at, updated_at
          FROM cluster_cards
          ${hasQ ? sql`WHERE (name ILIKE ${qParam} OR description ILIKE ${qParam})` : sql``}
          ORDER BY created_at DESC NULLS LAST
          LIMIT ${limit}
          OFFSET ${offset}
        `)
      );
      for (const r of rows) results.push(normalizeRowToCard(r, 'cluster'));
    }

    return json({ ok: true, count: results.length, cards: results });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[atlas/studio/cards] Postgres error:', msg);
    return json({ ok: true, degraded: true, reason: 'postgres_unavailable', cards: SAMPLE_CARDS }, { status: 200 });
  }
};
