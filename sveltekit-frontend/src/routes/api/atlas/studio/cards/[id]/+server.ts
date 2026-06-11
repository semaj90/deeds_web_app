import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';
import { withRetry, getDb } from '$lib/db/pool.js';
import { sql } from 'drizzle-orm';

const SAMPLE_DETAIL = {
  id: 'sample-rag-1',
  kind: 'rag',
  title: 'Sample RAG Card — Evidence Chunk',
  summary: 'This is a sample card detail shown when Postgres is unavailable.',
  sourceRef: 'sample://atlas',
  feature_label: 'sample',
  tags: ['sample'],
  versionHash: null,
  createdAt: null,
  updatedAt: null,
  degraded: true,
  similar: []
};

import { requireUser } from '$lib/server/auth-utils.js';

function normalizeRowToCard(row: any, kindHint?: 'rag' | 'cluster') {
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

export const GET: RequestHandler = async (event) => {
  requireUser(event);
  const { params } = event;
  const id = params.id;
  if (!id) return json({ ok: false, error: 'missing id' }, { status: 400 });

  try {
    // 1. Try rag_cards by id/card_id
    const ragRows = await withRetry(async () =>
      getDb().execute(sql`
        SELECT id, card_id, title, summary, source_ref, feature_label, tags, version_hash, created_at, updated_at
        FROM rag_cards
        WHERE id = ${id} OR card_id = ${id}
        LIMIT 1
      `)
    );
    if (ragRows && ragRows.length > 0) {
      const card = normalizeRowToCard(ragRows[0], 'rag');
      return json({ ok: true, card, similar: [] });
    }

    // 2. Try cluster_cards by id/cluster_id
    const clusterRows = await withRetry(async () =>
      getDb().execute(sql`
        SELECT id, cluster_id, name as title, description as summary, source_ref, feature_label, tags, version_hash, created_at, updated_at
        FROM cluster_cards
        WHERE id = ${id} OR cluster_id = ${id}
        LIMIT 1
      `)
    );
    if (clusterRows && clusterRows.length > 0) {
      const card = normalizeRowToCard(clusterRows[0], 'cluster');
      return json({ ok: true, card, similar: [] });
    }

    return json({ ok: false, error: 'not_found' }, { status: 404 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[atlas/studio/cards/[id]] Postgres error:', msg);
    return json({ ok: true, degraded: true, reason: 'postgres_unavailable', card: SAMPLE_DETAIL }, { status: 200 });
  }
};
