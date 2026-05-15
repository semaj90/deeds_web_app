import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { z } from 'zod';
import { ENV } from '$lib/server/env.server.js';
import { generateEmbeddings } from '$lib/server/grpc/embedding-client.js';
import { ACE_POLICIES, selectACEPolicy } from '$lib/server/types/ace.js';
import type { ACEContextChunk, ACEPolicyTier } from '$lib/server/types/ace.js';

const contextSchema = z.object({
  query: z.string().min(1).max(4000),
  policyTier: z
    .enum(['small', 'medium', 'large', 'authority_heavy', 'web_augmented'])
    .optional(),
  caseId: z.string().uuid().optional(),
});

export const POST: RequestHandler = async ({ request, locals }) => {
  if (!locals.user) {
    return json(
      {
        query: '',
        policy: ACE_POLICIES.small,
        chunks: [],
        cacheHit: 'miss',
        totalTokensEstimated: 0,
        graphNeighborCount: 0,
        durationMs: 0,
      },
      { status: 401 }
    );
  }

  const t0 = performance.now();

  try {
    const raw = await request.json();
    const parsed = contextSchema.safeParse(raw);
    if (!parsed.success) {
      return json(
        {
          query: '',
          policy: ACE_POLICIES.small,
          chunks: [],
          cacheHit: 'miss',
          totalTokensEstimated: 0,
          graphNeighborCount: 0,
          durationMs: 0,
        },
        { status: 400 }
      );
    }
    const { query, policyTier, caseId } = parsed.data;

    // 1. Determine policy
    const policy = policyTier
      ? ACE_POLICIES[policyTier as ACEPolicyTier]
      : selectACEPolicy(query.length);

    // 2. Embed query
    const embResult = await generateEmbeddings([query]);
    const vector = embResult.vectors[0];

    // 3. Search Qdrant for initial candidates (extra headroom for reranking)
    const qdrantLimit = policy.maxChunks * 2;
    const searchResp = await fetch(
      `${ENV.QDRANT_URL}/collections/codebase_chunks_768/points/search`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vector: { name: 'content', vector },
          limit: qdrantLimit,
          with_payload: true,
        }),
        signal: AbortSignal.timeout(8000),
      }
    );

    let qdrantResults: Record<string, unknown>[] = [];
    if (searchResp.ok) {
      const searchData = await searchResp.json();
      qdrantResults = searchData?.result ?? [];
    } else {
      console.warn('[ace/context] Qdrant search failed:', searchResp.status);
    }

    // 4. Optionally fetch Neo4j graph neighbors when policy requires it
    let graphNeighborCount = 0;
    const neighborFilePaths = new Set<string>();
    if (policy.includeGraphNeighbors && caseId) {
      try {
        const { getNeo4jDriver } = await import('$lib/server/neo4j-driver.js');
        const driver = getNeo4jDriver();
        const session = driver.session();
        try {
          const result = await session.run(
            `MATCH (f:CodebaseFile)-[:IMPORTS|IMPORTED_BY]->(neighbor:CodebaseFile)
             WHERE f.case_id = $caseId OR neighbor.case_id = $caseId
             RETURN DISTINCT neighbor.file_path AS filePath
             LIMIT 20`,
            { caseId }
          );
          for (const record of result.records) {
            const fp = record.get('filePath');
            if (fp) neighborFilePaths.add(String(fp));
          }
          graphNeighborCount = neighborFilePaths.size;
        } finally {
          await session.close();
        }
      } catch (err) {
        console.warn('[ace/context] Neo4j neighbor fetch failed (non-fatal):', err);
      }
    }

    // 5. Build ACEContextChunk array — trim content to policy max chars
    const chunks: ACEContextChunk[] = qdrantResults
      .slice(0, policy.maxChunks)
      .map((r) => {
        const payload = (r.payload as Record<string, unknown>) ?? {};
        const rawContent = String(payload.content ?? payload.text ?? '');
        const content = rawContent.slice(0, policy.maxCharsPerChunk);
        const filePath = String(payload.file_path ?? '');
        const isGraphNeighbor = neighborFilePaths.has(filePath);
        return {
          id: String(r.id),
          score: Number(r.score ?? 0),
          source: 'qdrant' as const,
          file_path: filePath || undefined,
          content,
          summary: payload.summary ? String(payload.summary) : undefined,
          tags: Array.isArray(payload.tags) ? (payload.tags as string[]) : [],
          som_cluster: payload.som_cluster != null ? Number(payload.som_cluster) : null,
          graph_distance: isGraphNeighbor ? 1 : null,
          authority_score: null,
        };
      });

    // Rough token estimate: ~4 chars per token
    const totalChars = chunks.reduce((sum, c) => sum + c.content.length, 0);
    const totalTokensEstimated = Math.ceil(totalChars / 4);

    return json({
      query,
      policy,
      chunks,
      cacheHit: 'miss',
      totalTokensEstimated,
      graphNeighborCount,
      durationMs: Math.round(performance.now() - t0),
    });
  } catch (err) {
    console.error('[ace/context] Error:', err);
    return json({
      query: '',
      policy: ACE_POLICIES.small,
      chunks: [],
      cacheHit: 'miss',
      totalTokensEstimated: 0,
      graphNeighborCount: 0,
      durationMs: Math.round(performance.now() - t0),
    });
  }
};
