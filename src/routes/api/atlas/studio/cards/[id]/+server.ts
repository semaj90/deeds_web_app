import type { RequestHandler } from './$types';
import * as Embeds from '../../../../../../../../sveltekit-frontend/src/lib/server/embedding/embed.js';
import { QdrantManager } from '../../../../../../../../sveltekit-frontend/src/lib/server/vector/qdrant-manager.js';
import * as DbClient from '../../../../../../../../sveltekit-frontend/src/lib/server/db/client.js';

export const GET: RequestHandler = async ({ params }) => {
  const id = params.id;
  // Try to load card from Postgres (rag_cards -> cluster_cards), then find similar via Qdrant
  let getDb: any = DbClient.db ?? DbClient.getDb ?? null;
  let sql: any = DbClient.sql ?? null;
  let embedText: any = (Embeds as any).embedText ?? (Embeds as any).default?.embedText ?? null;
  let QdrantMgrCtor: any = QdrantManager ?? null;

  let row: any = null;
  try {
    if (getDb) {
      // Try rag_cards by id
      try {
        const rr = await getDb().query('SELECT * FROM rag_cards WHERE id = $1 LIMIT 1', [id]);
        if (rr && rr.length) row = rr[0];
      } catch {
        // ignore
      }
      if (!row) {
        try {
          const cr = await getDb().query('SELECT * FROM cluster_cards WHERE cluster_id = $1 LIMIT 1', [id]);
          if (cr && cr.length) row = cr[0];
        } catch {
          // ignore
        }
      }
    }
  } catch (e) {
    // ignore
  }

  const out: any = { card: row ?? null, similar: [] };

  // If we have a card and embedding/qdrant available, fetch similar
  if (row && embedText && QdrantManager) {
    try {
      const seedText = row.summary || row.feature_label || row.description || '';
      if (seedText && seedText.length > 0) {
        const emb = await embedText(seedText);
        const mgr = new QdrantManager();
        const collection = 'document_knowledge';
        const res = await mgr.hybridSearch({ collection, query: '', queryEmbedding: emb, limit: 5 });
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
        out.similar = hits;
      }
    } catch (e) {
      // degrade silently
    }
  }

  return new Response(JSON.stringify(out), { headers: { 'content-type': 'application/json' } });
};
