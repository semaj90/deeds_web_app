// @vitest-environment node
import { fail } from '@sveltejs/kit';
import { superValidate } from 'sveltekit-superforms/server';
import { zod4 as zod } from 'sveltekit-superforms/adapters';
import { z } from 'zod';
import type { Actions, PageServerLoad } from './$types';

const searchSchema = z.object({
  query: z.string().min(1, 'Enter a search query').max(1000),
  limit: z.number().int().min(1).max(100).default(30),
  case_id: z.string().optional(),
  collection: z.enum(['evidence', 'legal_documents', 'kb_notecards']).default('evidence'),
});

export type SearchResult = {
  evidence_id: string;
  file_name: string;
  case_id: string | null;
  chunk_count: number;
  top_score: number;
  chunks: Array<{
    chunk_index: number;
    score: number;
    content: string;
    heading: string;
    section_type: string;
  }>;
};

// Map form collection enum values to actual Qdrant collection names
const QDRANT_COLLECTION: Record<string, string> = {
  evidence:        'evidence_items',
  legal_documents: 'legal_documents',
};

export const load: PageServerLoad = async ({ locals }) => {
  if (!locals.user) return { form: await superValidate(zod(searchSchema)) };
  return { form: await superValidate(zod(searchSchema)) };
};

export const actions: Actions = {
  search: async ({ request, locals }) => {
    if (!locals.user) return fail(401, { results: [], error: 'Unauthorized' });

    const form = await superValidate(request, zod(searchSchema));
    if (!form.valid) return fail(400, { form, results: [] });

    const { query, limit, case_id, collection } = form.data;
    const t0 = Date.now();

    try {
      // ── KB notecards: JSONL lexical search (not Qdrant) ────────────────────
      if (collection === 'kb_notecards') {
        const { searchNotecards } = await import('$lib/server/kb/search-logic.js');
        const hits = await searchNotecards({ query, limit });
        const results: SearchResult[] = hits.map((r) => ({
          evidence_id: r.card_id,
          file_name:   r.source_path,
          case_id:     null,
          chunk_count: 1,
          top_score:   r.score,
          chunks: [{
            chunk_index:  0,
            score:        r.score,
            content:      r.context_text.slice(0, 400),
            heading:      r.card_id,
            section_type: r.kind,
          }],
        }));
        return { form, results, query, collection, elapsedMs: Date.now() - t0 };
      }

      // ── Qdrant vector search (evidence_items / legal_documents) ────────────
      const { generateEmbedding } = await import('$lib/server/grpc/embedding-client.js');
      const { QdrantClient }      = await import('@qdrant/js-client-rest');
      const { ENV }               = await import('$lib/server/env.server.js');

      const vector = await generateEmbedding(query);
      if (!vector?.length) {
        return fail(503, { form, results: [], error: 'Embedding service unavailable' });
      }

      const qdrantCollection = QDRANT_COLLECTION[collection] ?? collection;
      const { getQdrantClient } = await import('$lib/server/vector/qdrant-singleton.js');
      const qdrant = getQdrantClient();

      const searchOpts: Record<string, unknown> = {
        vector,
        limit,
        with_payload: true,
        score_threshold: 0.45,
      };
      if (case_id) {
        searchOpts.filter = { must: [{ key: 'case_id', match: { value: case_id } }] };
      }

      const searchRes = await qdrant.search(qdrantCollection, searchOpts as Parameters<typeof qdrant.search>[1]);

      // Group chunks by document (evidence_id / source_path)
      const docMap = new Map<string, SearchResult>();

      for (const hit of searchRes) {
        const p = hit.payload ?? {};
        const docKey  = String(p.evidence_id ?? p.source_path ?? p.card_id ?? hit.id);
        const fileName = String(p.file_name ?? p.source_path ?? p.title ?? docKey);
        const caseId  = p.case_id ? String(p.case_id) : null;

        if (!docMap.has(docKey)) {
          docMap.set(docKey, {
            evidence_id: docKey,
            file_name:   fileName,
            case_id:     caseId,
            chunk_count: 0,
            top_score:   hit.score,
            chunks:      [],
          });
        }

        const doc = docMap.get(docKey)!;
        doc.chunk_count += 1;
        if (hit.score > doc.top_score) doc.top_score = hit.score;
        doc.chunks.push({
          chunk_index:  Number(p.chunk_index ?? p.section_index ?? 0),
          score:        hit.score,
          content:      String(p.content_preview ?? p.content ?? p.context_text ?? '').slice(0, 400),
          heading:      String(p.heading ?? p.title ?? ''),
          section_type: String(p.section_type ?? p.kind ?? ''),
        });
      }

      const results: SearchResult[] = Array.from(docMap.values())
        .map((d) => ({ ...d, chunks: d.chunks.sort((a, b) => b.score - a.score).slice(0, 3) }))
        .sort((a, b) => b.top_score - a.top_score);

      return { form, results, query, collection, elapsedMs: Date.now() - t0 };
    } catch (err: unknown) {
      console.error('[document-search]', err);
      const msg = err instanceof Error ? err.message : String(err);
      return fail(500, { form, results: [], error: msg });
    }
  },
};
