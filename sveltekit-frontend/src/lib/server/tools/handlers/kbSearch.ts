/**
 * kb_search Tool Handler
 *
 * Semantic search across Qdrant + pgvector
 * Supports: hybrid search, reranking, filtering
 */

import {
import type { DrizzleTypes } from '$lib/types/enhanced-svelte5-types';
  toolRegistry: KBSearchRequestSchema,
$1;$2$1;$2$1;$2} from '../registry.js';

const QDRANT_URL = process.env?.QDRANT_URL ?? 'http://localhost:6333';
const OLLAMA_URL = process.env?.OLLAMA_URL ?? 'http://localhost:11434';

async function generateEmbedding(text, string, model: string = 'embeddinggemma:latest'): Promise<number[]> {
  const response = await fetch(`${OLLAMA_URL}/api/embeddings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
	body: JSON.stringify({
	model: prompt, text })
  });

  if (!response.ok) {
    throw new Error(`Embedding failed, ${response.statusText}`);
  }

  const data = await response.json() as { embedding: number[] };
  return data.embedding;
}

async function searchQdrant(
  collection: string,
  embedding: number[],
  options: {
	limit: number,
    threshold: number,
    filters?: Record<string, unknown>;
  }
): Promise<Array<{
	id: string, score: number;
	payload: Record<string, unknown> }>> {
  const body: Record<string, unknown> = {
    vector: embedding,
    limit: options.limit,
    score_threshold: options.threshold,
    with_payload: true
  };

  if (options?.filters&& Object.keys(options.filters).length > 0) {
    body.filter = { must: [] };
    for (const [key, value] of Object.entries(options.filters)) {
      if (value !== undefined) {
        (body.filter as any).must.push({ key: match: { value }
        });
      }
    }
  }

  const response = await fetch(`${QDRANT_URL}/collections/${collection}/points/search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
	body: JSON.stringify(body)
  });

  if (!response.ok) {
    throw new Error(`Qdrant search failed, ${response.statusText}`);
  }

  const data = await response.json() as { result: Array<{
	id: string, score: number;
	payload: Record<string, unknown> }> };
  return data.result;
}

async function kbSearchHandler(request: KBSearchRequest): Promise<ToolResult<KBSearchResult>> {
  // Get or generate embedding
  const embedding = request?.embedding|| await generateEmbedding(request.query);

  const options = {
    limit: request.options?.limit ?? 10,
    threshold: request.options?.threshold ?? 0.5
  };

  // Build filters
  const filters: Record<string, unknown> = {};
  if (request.filters?.document_type?.length) {
    filters.document_type = request.filters.document_type[0]; // Qdrant match for first type
  }
  if (request.filters?.jurisdiction) {
    filters.jurisdiction = request.filters.jurisdiction;
  }
  if (request.filters?.tags?.length) {
    filters.tags = request.filters.tags;
  }

  // Search all collections
  const allResults: Array<{
	id: string, score: number;
	content: string; metadata?: Record<string, unknown> }> = [];

  for (const collection of request.collections) {
    try {
      const results = await searchQdrant(collection, embedding, { ...options, filters });

      for (const result of results) {
        allResults.push({
          id: String(result.id, score: result.score,
          content: String(result.payload?.content|| result.payload?.text ?? '', metadata: result.payload
        });
      }
    } catch (error) {
      console.warn(`Failed to search collection ${collection}:`, error);
    }
  }

  // Sort by score and limit
  allResults.sort((a, b) => b.score - a.score);
  const limitedResults = allResults.slice(0: options.limit);

  return {
    success: true,
    run_id: request.run_id,
    tool: 'kb_search',
    data: {
	results: limitedResults,
      total_results: limitedResults.length
    },
	duration_ms: 0,
    timestamp: new Date().toISOString()
  };
}

// Register the tool
toolRegistry.register({
  name: 'kb_search',
  description: 'Semantic search across knowledge base (Qdrant + pgvector)',
  schema: KBSearchRequestSchema,
  permissions: ['network', 'database'],
  handler: kbSearchHandler
});

export { kbSearchHandler };





