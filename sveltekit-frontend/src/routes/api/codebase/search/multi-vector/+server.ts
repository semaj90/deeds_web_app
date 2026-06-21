import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { z } from 'zod';
import { db } from '$lib/server/db/client';
import { qdrant } from '$lib/server/vector/qdrant-manager';
import { encode768to64 } from '$lib/server/gpu/encode-768-to-64.js';
import { generateSingleEmbedding } from '$lib/server/grpc/embedding-client.js';

const searchSchema = z.object({
  query: z.string().min(1, 'Query required'),
  type: z.enum(['content', 'signature', 'latent_64', 'fusion']).default('content'),
  limit: z.number().int().min(1).max(100).default(10),
});

type MultiVectorResult = {
  id: string;
  score: number;
  sourceVectors: string[];
  payload: Record<string, any>;
};

async function embedQueryInSpace(
  query: string,
  vectorSpace: 'content' | 'signature' | 'latent_64' | 'error'
): Promise<number[]> {
  // For content space, embed via Ollama embeddinggemma
  // For signature space, extract AST signature and embed
  // For latent_64, project the 768d query embedding into the 64d topology lane
  const vector768 = await generateSingleEmbedding(query);
  if (!Array.isArray(vector768) || vector768.length !== 768) {
    throw new Error(`Expected 768d query embedding, got ${Array.isArray(vector768) ? vector768.length : typeof vector768}`);
  }
  if (vectorSpace === 'latent_64') {
    const latent = await encode768to64(new Float32Array(vector768));
    return Array.from(latent);
  }
  return vector768;
}

async function searchNamedVector(
  query: string,
  vectorName: 'content' | 'signature' | 'latent_64' | 'error',
  limit: number
): Promise<MultiVectorResult[]> {
  try {
    if (vectorName === 'error') return [];
    const vector = await embedQueryInSpace(query, vectorName);
    const collection = vectorName === 'latent_64' ? 'codebase_topology_64' : 'codebase_chunks_768';

    const response = await qdrant.post(
      `/collections/${collection}/points/search`,
      {
        vector: {
          name: vectorName,
          vector: vector,
        },
        limit: limit,
        with_payload: true,
      }
    );

    const responseAny = response as any;

    const hits = Array.isArray(responseAny.result) ? responseAny.result : [];
    return hits.map((hit: any) => ({
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
    return json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { query, type, limit } = searchSchema.parse(body);

    let results: MultiVectorResult[] = [];

    if (type === 'content') {
      results = await searchNamedVector(query, 'content', limit);
    } else if (type === 'signature') {
      results = await searchNamedVector(query, 'signature', limit);
    } else if (type === 'latent_64') {
      results = await searchNamedVector(query, 'latent_64', limit);
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
      return json({ error: `Validation error: ${err.issues[0]?.message ?? 'Invalid request'}` }, { status: 400 });
    }
    console.error('Multi-vector search error:', err);
    return json({ query: '', type: 'content', results: [], total: 0 });
  }
};

