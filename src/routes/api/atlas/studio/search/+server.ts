import type { RequestHandler } from './$types';
import * as Embeds from '../../../../../../sveltekit-frontend/src/lib/server/embedding/embed.js';
import { QdrantManager } from '../../../../../../sveltekit-frontend/src/lib/server/vector/qdrant-manager.js';
import * as DbClient from '../../../../../../sveltekit-frontend/src/lib/server/db/client.js';

export const GET: RequestHandler = async ({ url }) => {
  const q = (url.searchParams.get('q') || '').trim();
  const limitParam = Number(url.searchParams.get('limit') || '10');
  const limit = Math.min(25, Math.max(1, Number.isNaN(limitParam) ? 10 : limitParam));

  if (!q) {
    return new Response(
      JSON.stringify({ query: q, hits: [], note: 'query parameter `q` is required' }),
      {
        status: 400,
        headers: { 'content-type': 'application/json' },
      }
    );
  }

  // Canonical imports are static; preserve degraded behavior at runtime if functions are absent.
  let embedText: ((text: string) => Promise<number[]>) | null =
    (Embeds as any).embedText ?? (Embeds as any).default?.embedText ?? null;
  let getDb: any = DbClient.db ?? DbClient.getDb ?? null;
  let sql: any = DbClient.sql ?? null;

  if (!embedText || !QdrantManager) {
    return new Response(
      JSON.stringify({
        query: q,
        hits: [],
        note: 'degraded: embeddings or Qdrant client not available',
      }),
      { status: 503, headers: { 'content-type': 'application/json' } }
    );
  }

  try {
    const embedding = await embedText(q);
    const mgr = new QdrantManager();

    // Search collection used for cards/document knowledge
    const collection = 'document_knowledge';
    const res = await mgr.hybridSearch({ collection, query: '', queryEmbedding: embedding, limit });

    const hits = (res.results ?? []).map((r: any) => {
      const p = r.payload ?? {};
      return {
        qdrant_id: r.id,
        score: r.score,
        card_id: p.cardId ?? p.card_id ?? null,
        sourceRef: p.sourceRefs?.[0] ?? p.sourceRef ?? null,
        payload: p,
      };
    });

    // Hydrate Postgres rows where possible (read-only)
    if (getDb) {
      const cardIds = hits.filter((h: any) => h.card_id).map((h: any) => h.card_id);
      const sourceRefs = hits.filter((h: any) => h.sourceRef).map((h: any) => h.sourceRef);
      const rowsByCardId: Record<string, any> = {};
      const rowsBySourceRef: Record<string, any> = {};

      if (cardIds.length > 0) {
        try {
          const qText = `SELECT id as card_id, feature_label, summary, tags, 'rag' as kind FROM rag_cards WHERE id = ANY($1)
                        UNION ALL
                        SELECT cluster_id as card_id, feature_label, description as summary, tags, 'cluster' as kind FROM cluster_cards WHERE cluster_id = ANY($1)`;
          const resRows: any[] = await getDb().query(qText, [cardIds]);
          for (const r of resRows) rowsByCardId[String(r.card_id)] = r;
        } catch {
          // ignore hydration errors
        }
      }

      if (sourceRefs.length > 0) {
        try {
          const qText = `SELECT id as card_id, source_ref, feature_label, summary, tags, 'rag' as kind FROM rag_cards WHERE source_ref = ANY($1)
                        UNION ALL
                        SELECT cluster_id as card_id, source_ref, feature_label, description as summary, tags, 'cluster' as kind FROM cluster_cards WHERE source_ref = ANY($1)`;
          const resRows: any[] = await getDb().query(qText, [sourceRefs]);
          for (const r of resRows) rowsBySourceRef[String(r.source_ref ?? r.sourceRef ?? '')] = r;
        } catch {
          // ignore
        }
      }

      // merge hydration
      for (const h of hits) {
        if (h.card_id && rowsByCardId[h.card_id]) h.row = rowsByCardId[h.card_id];
        else if (h.sourceRef && rowsBySourceRef[h.sourceRef]) h.row = rowsBySourceRef[h.sourceRef];
      }
    }

    return new Response(JSON.stringify({ query: q, hits }), {
      headers: { 'content-type': 'application/json' },
    });
  } catch (err: any) {
    console.warn('[atlas search] degraded:', err?.message || err);
    return new Response(
      JSON.stringify({ query: q, hits: [], note: 'qdrant search failed or returned no results' }),
      {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }
    );
  }
};
