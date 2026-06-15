import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { z } from 'zod';
import { db } from '$lib/server/db/client';
import { qdrant } from '$lib/server/vector/qdrant-manager';

const searchSchema = z.object({
  query: z.string().min(1, 'Query required'),
  type: z.enum(['content', 'signature', 'fusion']).default('content'),
  limit: z.number().int().min(1).max(100).default(10),
});

type MultiVectorResult = {
  id: string;
  score: number;
  sourceVectors: string[];
  payload: Record<string, any>;
};

async function embedQueryInSpace(query: string, vectorSpace: 'content' | 'signature'): Promise<number[]> {
  // For content space, embed via Ollama embeddinggemma
  // For signature space, extract AST signature and embed
  // Both return 768-dim vectors

  // TODO: Implement actual embedding
  // For now, return placeholder
  return new Array(768).fill(0);
}

async function searchNamedVector(
  query: string,
  vectorName: 'content' | 'signature' | 'encoded_64' | 'error',
  limit: number
): Promise<MultiVectorResult[]> {
  try {
    const vector = await embedQueryInSpace(query, vectorName as 'content' | 'signature');

    const response = await qdrant.post(
      '/collections/codebase_chunks_768/points/search',
      {
        vector: {
          name: vectorName,
          vector: vector,
        },
        limit: limit,
        with_payload: true,
      }
    );

    return (response.result || []).map((hit: any) => ({
      id: hit.id,
      score: hit.score,
      sourceVectors: [vectorName],
      payload: hit.payload,
    }));
  } catch (err) {
    console.error(`Error searching ${vectorName} vector:`, err);
    return [];
  }
}

async function fuseResults(
  contentResults: MultiVectorResult[],
  signatureResults: MultiVectorResult[],
  limit: number
): Promise<MultiVectorResult[]> {
  // RRF (Reciprocal Rank Fusion): score = 1/(k + rank)
  // Weighted blend: content 0.6 + signature 0.3

  const scoreMap = new Map<string, { score: number; sourceVectors: Set<string>; payload: Record<string, any> }>();

  // Content lane (weight 0.6)
  contentResults.forEach((result, rank) => {
    const rrf = 1 / (60 + rank + 1); // k=60 standard
    const weighted = rrf * 0.6;
    const entry = scoreMap.get(result.id) || { score: 0, sourceVectors: new Set(), payload: result.payload };
    entry.score += weighted;
    entry.sourceVectors.add('content');
    scoreMap.set(result.id, entry);
  });

  // Signature lane (weight 0.3)
  signatureResults.forEach((result, rank) => {
    const rrf = 1 / (60 + rank + 1);
    const weighted = rrf * 0.3;
    const entry = scoreMap.get(result.id) || { score: 0, sourceVectors: new Set(), payload: result.payload };
    entry.score += weighted;
    entry.sourceVectors.add('signature');
    scoreMap.set(result.id, entry);
  });

  // Sort by combined score and return top-K
  return Array.from(scoreMap.entries())
    .map(([id, entry]) => ({
      id,
      score: entry.score,
      sourceVectors: Array.from(entry.sourceVectors),
      payload: entry.payload,
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

export const POST: RequestHandler = async ({ request, locals }) => {
  // Auth guard
  if (!locals.user) {
    throw error(401, 'Unauthorized');
  }

  try {
    const body = await request.json();
    const { query, type, limit } = searchSchema.parse(body);

    let results: MultiVectorResult[] = [];

    if (type === 'content') {
      results = await searchNamedVector(query, 'content', limit);
    } else if (type === 'signature') {
      results = await searchNamedVector(query, 'signature', limit);
    } else if (type === 'fusion') {
      // Dual-lane fusion: content + signature, RRF blend
      const [contentResults, signatureResults] = await Promise.all([
        searchNamedVector(query, 'content', limit * 2),
        searchNamedVector(query, 'signature', limit * 2),
      ]);
      results = await fuseResults(contentResults, signatureResults, limit);
    }

    return json({
      query,
      type,
      results,
      total: results.length,
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      throw error(400, `Validation error: ${err.errors[0].message}`);
    }
    console.error('Multi-vector search error:', err);
    return json({ query: '', type: 'content', results: [], total: 0 });
  }
};
