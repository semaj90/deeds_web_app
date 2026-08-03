/**
 * Unified Search API Route
 *
 * Entry point: GET/POST /api/retrieval/search-unified?q=...
 *
 * Single canonical endpoint for all retrieval operations.
 * Nothing else handles search. Everything flows through here.
 */

import type { RequestHandler } from '@sveltejs/kit';
import { json } from '@sveltejs/kit';
import { SemanticSearchWorkflowRequestSchema, runSemanticSearchWorkflow } from '$lib/server/retrieval/semantic-search-workflow.js';

export const GET: RequestHandler = async ({ url, locals }) => {
  const q = url.searchParams.get('q');
  const topK = url.searchParams.get('topK') ? parseInt(url.searchParams.get('topK')!) : 20;

  if (!q) {
    return json(
      { error: 'Missing query parameter: q' },
      { status: 400 },
    );
  }

  try {
    const result = await runSemanticSearchWorkflow({
      query: q,
      topK: Math.min(topK, 50),
      userId: locals.user?.id !== undefined ? String(locals.user.id) : undefined,
      includeWorkflowPreamble: false,
      includeAcePacket: true,
      compareRustShadow: false,
      withGraphExpansion: false,
      persistReport: false,
      shadowTopK: 20,
      filters: {
        includeGenerated: false,
        includeLegacy: false,
      },
    }, {
      userId: locals.user?.id !== undefined ? String(locals.user.id) : null,
      caseId: null,
    });

    return json(result);
  } catch (error) {
    console.error('Search error:', error);
    return json(
      {
        error: 'Search failed',
        packets: [],
        metadata: { query: q, candidatesRetrieved: 0, candidatesFused: 0, candidatesReranked: 0, candidatesPostProcessed: 0, durationMs: 0, stages: { retrieve: 0, fuse: 0, score: 0, hydrate: 0, rerank: 0, postProcess: 0 } },
        provenance: { retrievalSources: [], fusionMethod: 'rrf', rerankModel: 'none', rerankerUsed: false, promotionAttempted: false },
        topPacketKeys: [],
        workflowState: 'FAILED',
        workflowDag: [],
        preamble: null,
        ace: null,
        shadow: null,
      },
      { status: 500 },
    );
  }
};

export const POST: RequestHandler = async ({ request, locals }) => {
  try {
    const body = await request.json();
    const query = SemanticSearchWorkflowRequestSchema.parse({
      query: body.query ?? body.text ?? '',
      topK: body.topK ?? 20,
      userId: locals.user?.id !== undefined ? String(locals.user.id) : undefined,
      includeWorkflowPreamble: false,
      includeAcePacket: true,
      compareRustShadow: false,
      withGraphExpansion: Boolean(body.withGraphExpansion),
      caseId: body.caseId ?? undefined,
      traceId: body.traceId ?? undefined,
      shadowTopK: body.shadowTopK ?? 20,
      filters: body.filters ?? {
        includeGenerated: false,
        includeLegacy: false,
      },
    });

    const result = await runSemanticSearchWorkflow(query, {
      userId: locals.user?.id !== undefined ? String(locals.user.id) : null,
      caseId: null,
    });

    return json(result);
  } catch (error) {
    console.error('Search error:', error);
    return json(
      {
        error: 'Search failed',
        packets: [],
        metadata: { query: '', candidatesRetrieved: 0, candidatesFused: 0, candidatesReranked: 0, candidatesPostProcessed: 0, durationMs: 0, stages: { retrieve: 0, fuse: 0, score: 0, hydrate: 0, rerank: 0, postProcess: 0 } },
        provenance: { retrievalSources: [], fusionMethod: 'rrf', rerankModel: 'none', rerankerUsed: false, promotionAttempted: false },
        topPacketKeys: [],
        workflowState: 'FAILED',
        workflowDag: [],
        preamble: null,
        ace: null,
        shadow: null,
      },
      { status: 500 },
    );
  }
};
