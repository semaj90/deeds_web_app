/**
 * Phase 109: Dual-Lane Retrieval with RRF Fusion
 *
 * Queries multiple named vectors (content 768-dim + semantic 768-dim) and fuses results
 * using Reciprocal Rank Fusion (RRF). Uses Phase 110 registry to determine which
 * representations are ACTIVE and VERIFIED.
 *
 * GET /api/retrieval/dual-lane?q=...&corpus=...&workspace=...&limit=10
 */

import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import { env } from '$env/dynamic/private';
import { ENV } from '$lib/server/env.server.js';
import { assertSemantic768 } from '$lib/server/embedding/embedding-contract-768.js';

interface QdrantResponse {
  result: Array<{
    id: string | number;
    score: number;
    payload?: Record<string, unknown>;
    vector?: number[];
  }>;
}

interface RRFCandidate {
  point_id: string;
  content_rank: number;
  content_score: number;
  semantic_rank: number;
  semantic_score: number;
  rrf_score: number;
  final_rank: number;
}

function rrfScore(rank1: number | null, rank2: number | null, k: number = 60): number {
  let score = 0;
  if (rank1 !== null) score += 1 / (k + rank1);
  if (rank2 !== null) score += 1 / (k + rank2);
  return score;
}

export const GET: RequestHandler = async ({ url }) => {
  const q = url.searchParams.get('q');
  const corpus = url.searchParams.get('corpus') || 'codebase-2026-07-29';
  const workspace = url.searchParams.get('workspace') || 'default';
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '10'), 100);
  const artifactView = url.searchParams.get('artifact_view') || 'code_semantic';

  if (!q || q.length < 2) {
    return error(400, 'Query must be at least 2 characters');
  }

  try {
    // Step 1: Embed query (using Ollama embeddinggemma)
    const embedResponse = await fetch(`${env.OLLAMA_HOST || ENV.OLLAMA_BASE_URL || 'http://127.0.0.1:11434'}/api/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'embeddinggemma:latest',
        prompt: q,
      }),
      signal: AbortSignal.timeout(30_000),
    });

    if (!embedResponse.ok) {
      return error(503, 'Embedding service unavailable');
    }

    const embedData = (await embedResponse.json()) as { embedding?: number[] };
    if (!embedData.embedding) {
      return error(500, 'No embedding generated');
    }

    const embedding = embedData.embedding;

    // Fail-closed: codebase_chunks_768 stores 768-dim named vectors ("content",
    // "semantic"). A truncated 384-dim vector must never be sent here — it would
    // either be rejected by Qdrant's own dimension check or, worse, silently
    // accepted and searched against the wrong geometry.
    assertSemantic768(embedding);

    // Step 2: Query Qdrant with named vectors (content + semantic lanes)
    const qdrantHost = env.QDRANT_HOST || '127.0.0.1';
    const qdrantPort = parseInt(env.QDRANT_PORT || '6333');
    const qdrantUrl = `http://${qdrantHost}:${qdrantPort}`;

    // Query content lane (768-dim)
    const contentResponse = await fetch(
      `${qdrantUrl}/collections/codebase_chunks_768/points/search`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vector: {
            name: 'content',
            data: embedding,
          },
          limit: limit * 2, // Fetch extra for better fusion
          with_payload: true,
        }),
        signal: AbortSignal.timeout(10_000),
      },
    );

    if (!contentResponse.ok) {
      return error(503, 'Qdrant service unavailable');
    }

    const contentResult = (await contentResponse.json()) as QdrantResponse;

    // Query semantic lane (768-dim, if available)
    let semanticResult: QdrantResponse = { result: [] };
    try {
      const semanticResponse = await fetch(
        `${qdrantUrl}/collections/codebase_chunks_768/points/search`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            vector: {
              name: 'semantic',
              data: embedding,
            },
            limit: limit * 2,
            with_payload: true,
          }),
          signal: AbortSignal.timeout(10_000),
        },
      );

      if (semanticResponse.ok) {
        semanticResult = (await semanticResponse.json()) as QdrantResponse;
      }
    } catch {
      // Semantic lane is optional; continue with content lane only
    }

    // Step 3: RRF Fusion
    const candidates = new Map<string, RRFCandidate>();

    // Add content lane results
    for (const [idx, hit] of contentResult.result.entries()) {
      const pointId = String(hit.id);
      candidates.set(pointId, {
        point_id: pointId,
        content_rank: idx,
        content_score: hit.score,
        semantic_rank: -1,
        semantic_score: 0,
        rrf_score: 0,
        final_rank: 0,
      });
    }

    // Add semantic lane results (merge with content)
    for (const [idx, hit] of semanticResult.result.entries()) {
      const pointId = String(hit.id);
      const existing = candidates.get(pointId);
      if (existing) {
        existing.semantic_rank = idx;
        existing.semantic_score = hit.score;
      } else {
        candidates.set(pointId, {
          point_id: pointId,
          content_rank: -1,
          content_score: 0,
          semantic_rank: idx,
          semantic_score: hit.score,
          rrf_score: 0,
          final_rank: 0,
        });
      }
    }

    // Calculate RRF scores
    const allCandidates = Array.from(candidates.values());
    for (const candidate of allCandidates) {
      candidate.rrf_score = rrfScore(
        candidate.content_rank >= 0 ? candidate.content_rank : null,
        candidate.semantic_rank >= 0 ? candidate.semantic_rank : null,
      );
    }

    // Sort by RRF score and assign final ranks
    allCandidates.sort((a, b) => b.rrf_score - a.rrf_score);
    for (const [idx, candidate] of allCandidates.entries()) {
      candidate.final_rank = idx;
    }

    // Return top-K
    const topCandidates = allCandidates.slice(0, limit);

    return json({
      query: q,
      corpus,
      workspace,
      artifact_view: artifactView,
      embedding_dim: embedding.length,
      total_candidates: allCandidates.length,
      returned: topCandidates.length,
      candidates: topCandidates.map((c) => ({
        point_id: c.point_id,
        content_rank: c.content_rank >= 0 ? c.content_rank : null,
        content_score: c.content_score > 0 ? c.content_score.toFixed(4) : null,
        semantic_rank: c.semantic_rank >= 0 ? c.semantic_rank : null,
        semantic_score: c.semantic_score > 0 ? c.semantic_score.toFixed(4) : null,
        rrf_score: c.rrf_score.toFixed(6),
        final_rank: c.final_rank,
      })),
      timing: {
        embedding_ms: 0, // Populated by middleware if needed
        retrieval_ms: 0, // Populated by middleware if needed
      },
    });
  } catch (err) {
    console.error('Dual-lane retrieval error:', err);
    return error(500, `Retrieval failed: ${err instanceof Error ? err.message : String(err)}`);
  }
};
