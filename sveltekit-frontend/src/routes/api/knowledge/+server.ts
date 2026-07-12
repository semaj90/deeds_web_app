import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { JSDOM } from 'jsdom';
import pdfParse from 'pdf-parse';
import { pool } from '$lib/server/db/client';
import { ENV } from '$lib/server/env.server.js';
import { z } from 'zod';
import { ollamaFetch } from '$lib/server/ollama.js';
import { generateSparseVector } from '$lib/server/vector/bm42-sparse.js';
import { cacheControl, checkETag, notModified } from '$lib/server/middleware/cache-headers.js';
import { recordSearchQuery } from '$lib/server/analytics/search-analytics.js';
import { getQdrantClient } from '$lib/server/vector/qdrant-singleton.js';

const qdrant = getQdrantClient();
let knowledgeBaseTableAvailable: boolean | null = null;
let knowledgeBaseSupportsSparse: boolean | null = null;

/** Scored point returned by Qdrant search/query */
interface QdrantScoredPoint {
  id: number | string;
  score: number;
  payload?: Record<string, unknown>;
}

// Qdrant client with extended methods (query/upsert with named vectors)
// beyond what @qdrant/js-client-rest types currently expose
/** Qdrant query response wrapper */
interface QdrantQueryResponse { points: QdrantScoredPoint[] }

const qd = qdrant as ReturnType<typeof getQdrantClient> & {
  query(collection: string, params: Record<string, unknown>): Promise<QdrantQueryResponse>;
  upsert(collection: string, params: Record<string, unknown>): Promise<void>;
};

const OLLAMA_URL_VAR = ENV.OLLAMA_BASE_URL;

const EMBEDDING_MODEL = 'embeddinggemma:latest';
const LOCAL_LLM = 'gemma4-rotorquant:latest';

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MB
const MAX_CHUNKS = 500;

/**
 * Extract text from various document formats
 */
async function extractDocumentText(file: File): Promise<string> {
  if (file.size > MAX_FILE_SIZE) {
    throw new Error(
      `File too large: ${(file.size / 1024 / 1024).toFixed(1)}MB exceeds ${MAX_FILE_SIZE / 1024 / 1024}MB limit`
    );
  }
  const buffer = await file.arrayBuffer();
  const ext = file.name.split('.').pop()?.toLowerCase();

  if (ext === 'pdf') {
    const pdf = await pdfParse(Buffer.from(buffer));
    return pdf.text;
  } else if (ext === 'txt') {
    return new TextDecoder().decode(buffer);
  } else if (ext === 'html' || ext === 'htm') {
    const html = new TextDecoder().decode(buffer);
    const dom = new JSDOM(html);
    return dom.window.document.body?.textContent ?? '';
  } else if (ext === 'md' || ext === 'markdown') {
    return new TextDecoder().decode(buffer);
  } else {
    throw new Error(`Unsupported file format: ${ext}`);
  }
}

/**
 * Split text into chunks with overlap for better context
 */
function chunkText(text: string, chunkSize = 500, overlap = 100): string[] {
  const chunks: string[] = [];
  for (let i = 0; i < text.length; i += chunkSize - overlap) {
    chunks.push(text.slice(i, i + chunkSize));
  }
  const filtered = chunks.filter((c) => c.trim().length > 0);
  if (filtered.length > MAX_CHUNKS) {
    console.warn(
      `[Knowledge] Document produced ${filtered.length} chunks, capping at ${MAX_CHUNKS}`
    );
    return filtered.slice(0, MAX_CHUNKS);
  }
  return filtered;
}

/**
 * Generate embedding for text via Ollama
 */
async function generateEmbedding(text: string): Promise<number[]> {
  try {
    const response = await ollamaFetch(`${OLLAMA_URL_VAR}/api/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: EMBEDDING_MODEL,
        prompt: text.substring(0, 8000),
      }),
      signal: AbortSignal.timeout(30_000),
    });

    if (!response.ok) {
      throw new Error(`Ollama returned ${response.status}`);
    }

    const data = await response.json();
    const embedding = data?.embedding;
    if (!Array.isArray(embedding) || embedding.length === 0) {
      throw new Error('Empty embedding returned');
    }
    return embedding;
  } catch (err) {
    console.error('[Knowledge] Embedding failed:', err instanceof Error ? err.message : err);
    throw new Error(
      `Failed to generate embedding: ${err instanceof Error ? err.message : 'unknown'}`
    );
  }
}

/**
 * Ensure Qdrant collection exists
 */
async function ensureQdrantCollection() {
  try {
    const collection = await qdrant.getCollection('knowledge_base');
    const sparseConfig = (collection as { config?: { sparse_vectors?: Record<string, unknown> } })
      ?.config?.sparse_vectors;
    knowledgeBaseSupportsSparse = Boolean(
      sparseConfig && typeof sparseConfig === 'object' && Object.keys(sparseConfig).length > 0
    );
    if (!knowledgeBaseSupportsSparse) {
      try {
        await qdrant.updateCollection('knowledge_base', {
          sparse_vectors: { bm25: {} },
        });
        knowledgeBaseSupportsSparse = true;
      } catch {
        console.warn(
          '[Knowledge] Sparse vectors not supported on existing collection; using dense-only'
        );
      }
    }
  } catch (err) {
    console.warn(
      '[Knowledge] Collection not found, creating...',
      err instanceof Error ? err.message : err
    );
    try {
      await qdrant.createCollection('knowledge_base', {
        vectors: {
          size: 768,
          distance: 'Cosine',
        },
        sparse_vectors: {
          bm25: {},
        },
      });
      knowledgeBaseSupportsSparse = true;
    } catch (createErr) {
      console.error(
        '[Knowledge] Failed to create Qdrant collection:',
        createErr instanceof Error ? createErr.message : createErr
      );
      throw new Error('Qdrant collection unavailable');
    }
  }
}

async function upsertKnowledgePoint(
  pointId: string,
  embedding: number[],
  sparse: ReturnType<typeof generateSparseVector>,
  payload: Record<string, unknown>
): Promise<void> {
  if (knowledgeBaseSupportsSparse !== false) {
    try {
      await qd.upsert('knowledge_base', {
        points: [
          {
            id: pointId,
            vector: {
              '': embedding,
              bm25: sparse,
            },
            payload: {
              ...payload,
              text: String(payload.content ?? '').slice(0, 500),
            },
          },
        ],
      });
      knowledgeBaseSupportsSparse = true;
      return;
    } catch (error) {
      knowledgeBaseSupportsSparse = false;
      console.warn(
        '[Knowledge] Sparse upsert unavailable for knowledge_base; retrying dense-only.',
        error
      );
    }
  }

  await qdrant.upsert('knowledge_base', {
    points: [
      {
        id: pointId,
        vector: embedding,
        payload: {
          ...payload,
          text: String(payload.content ?? '').slice(0, 500),
        },
      },
    ],
  });
}

async function persistKnowledgeChunkMetadata(
  fileName: string,
  chunkIndex: number,
  chunk: string,
  source: string,
  pointId: string
): Promise<boolean> {
  if (knowledgeBaseTableAvailable === false) {
    return false;
  }

  try {
    await pool.query(
      `INSERT INTO knowledge_base (doc_name, chunk_idx, content, source, embedding_id)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (embedding_id) DO UPDATE SET content = $3`,
      [fileName, chunkIndex, chunk, source, pointId]
    );
    knowledgeBaseTableAvailable = true;
    return true;
  } catch (error) {
    knowledgeBaseTableAvailable = false;
    console.warn(
      '[Knowledge] PostgreSQL metadata persistence unavailable; continuing with Qdrant-only ingestion.',
      error
    );
    return false;
  }
}

/**
 * POST /api/knowledge - Upload documents for ingestion
 */
export const POST: RequestHandler = async ({ request, locals }) => {
  if (!locals.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const formData = await request.formData();
    const files = formData.getAll('files') as File[];
    const source = formData.get('source') as string ?? 'user-upload';

    if (!files || files.length === 0) {
      return json({ error: 'No files provided' }, { status: 400 });
    }

    await ensureQdrantCollection();

    const results = [];

    for (const file of files) {
      try {
        // Extract text
        const text = await extractDocumentText(file);
        const chunks = chunkText(text);
        let metadataRows = 0;

        // Process chunks
        const pointIds = [];
        for (const [idx, chunk] of chunks.entries()) {
          const embedding = await generateEmbedding(chunk);

          const pointId = `${file.name}:${idx}:${Date.now()}`;
          const payload = {
            document_name: file.name,
            content: chunk,
            source,
            uploaded_at: new Date().toISOString(),
            chunk_count: chunks.length,
            chunk_index: idx,
          };

          // Generate BM42 sparse vector for hybrid search
          const sparse = generateSparseVector(chunk);

          await upsertKnowledgePoint(pointId, embedding, sparse, payload);

          pointIds.push(pointId);

          const persisted = await persistKnowledgeChunkMetadata(
            file.name,
            idx,
            chunk,
            source,
            pointId
          );
          if (persisted) {
            metadataRows += 1;
          }
        }

        results.push({
          file: file.name,
          chunks: chunks.length,
          points: pointIds.length,
          metadata_store: metadataRows > 0 ? 'postgres+qdrant' : 'qdrant-only',
          status: 'success',
        });

      } catch (err) {
        results.push({
          file: file.name,
          error: 'Processing failed',
          status: 'failed'
        });
      }
    }

    return json({
      success: true,
      message: `Processed ${files.length} file(s)`,
      results
    });
  } catch (err) {
    console.error('Upload error:', err);
    return json(
      { error: 'Upload failed' },
      { status: 500 }
    );
  }
};

const knowledgeSearchSchema = z.object({
  q: z.string().min(1, 'Query parameter required').max(5000),
  limit: z.coerce.number().int().min(1).max(50).default(5),
});

/**
 * GET /api/knowledge - Search knowledge base with RAG
 */
export const GET: RequestHandler = async ({ url, locals, request }) => {
  if (!locals.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });
  const parsed = knowledgeSearchSchema.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success) {
    return json({ error: parsed.error.issues[0]?.message ?? 'Invalid query' }, { status: 400 });
  }
  const { q: query, limit } = parsed.data;
  recordSearchQuery({ query, pipeline: 'rag', cacheHit: false, userId: locals.user.id });

  try {
    await ensureQdrantCollection();

    // Generate embedding for query
    const queryEmbedding = await generateEmbedding(query);

    // Hybrid search: dense + BM42 sparse with RRF fusion
    const querySparse = generateSparseVector(query);
    let results: QdrantScoredPoint[];
    try {
      const queryRes = await qd.query('knowledge_base', {
        prefetch: [
          { query: queryEmbedding, using: '', limit: limit * 2 },
          { query: querySparse, using: 'bm25', limit: limit * 2 },
        ],
        query: { fusion: 'rrf' },
        limit,
        score_threshold: 0.4,
      });
      results = queryRes.points;
    } catch (hybridErr) {
      console.warn('[Knowledge] RRF fusion unavailable, falling back to dense-only:', hybridErr instanceof Error ? hybridErr.message : hybridErr);
      results = await qd.search('knowledge_base', {
        vector: queryEmbedding,
        limit,
        score_threshold: 0.6,
      });
    }

    const matches = results.map(r => ({
      id: r.id,
      score: r.score,
      document: r.payload?.document_name,
      chunk: r.payload?.chunk_index,
      content: r.payload?.content,
      source: r.payload?.source
    }));

    const responseData = {
      success: true,
      query: matches,
      count: matches.length,
      avg_similarity: matches.length > 0
        ? (matches.reduce((sum, m) => sum + m.score, 0) / matches.length).toFixed(2)
        : 0
    };

    const { etag, isMatch } = checkETag(responseData, request.headers);
    if (isMatch) return notModified(etag);

    return json(responseData, {
      headers: { ...cacheControl.short, ETag: etag }
    });
  } catch (err) {
    console.error('Search error:', err);
    return json({
      success: false,
      query: [],
      count: 0,
      avg_similarity: 0,
    }, {
      headers: cacheControl.short
    });
  }
};

const knowledgeQuerySchema = z.object({
  prompt: z.string().min(1, 'Prompt required').max(10000),
  max_context_chunks: z.number().int().min(1).max(50).optional().default(5),
});

/**
 * PATCH /api/knowledge - Generate response using RAG + LLM
 */
export const PATCH: RequestHandler = async ({ request, locals }) => {
  if (!locals.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const raw = await request.json();
    const parsed = knowledgeQuerySchema.safeParse(raw);
    if (!parsed.success) {
      return json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 });
    }
    const { prompt, max_context_chunks } = parsed.data;

    await ensureQdrantCollection();

    // 1. Hybrid search knowledge base for context (dense + BM42)
    const queryEmbedding = await generateEmbedding(prompt);
    const promptSparse = generateSparseVector(prompt);
    let searchResults: QdrantScoredPoint[];
    try {
      const searchRes = await qd.query('knowledge_base', {
        prefetch: [
          { query: queryEmbedding, using: '', limit: max_context_chunks * 2 },
          { query: promptSparse, using: 'bm25', limit: max_context_chunks * 2 },
        ],
        query: { fusion: 'rrf' },
        limit: max_context_chunks,
        score_threshold: 0.4,
      });
      searchResults = searchRes.points;
    } catch (hybridErr) {
      console.warn('[Knowledge] PATCH RRF fusion unavailable, falling back to dense-only:', hybridErr instanceof Error ? hybridErr.message : hybridErr);
      searchResults = await qd.search('knowledge_base', {
        vector: queryEmbedding,
        limit: max_context_chunks,
        score_threshold: 0.6,
      });
    }

    const contextText = searchResults
      .map(r => `[${r.payload?.document_name}] ${r.payload?.content}`)
      .join('\n\n');

    const avgScore = searchResults.length > 0
      ? searchResults.reduce((sum, r) => sum + r.score, 0) / searchResults.length
      : 0;

    // 2. Build augmented prompt
    const augmentedPrompt = `KNOWLEDGE BASE CONTEXT:
${contextText || 'No matching documents found in knowledge base.'}

---

USER QUESTION:
${prompt}

---

Provide a clear, detailed answer based on the knowledge base. If the knowledge base doesn't contain relevant information, say so explicitly.`;

    // 3. Route to LLM (Gemini for complex, Gemma for simple)
    let response = '';
    const llmUsed = 'gemma4-rotorquant:latest';
    const ollamaRes = await ollamaFetch(`${OLLAMA_URL_VAR}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: LOCAL_LLM,
        prompt: augmentedPrompt,
        stream: false,
      }),
      signal: AbortSignal.timeout(60_000),
    });

    if (!ollamaRes.ok) {
      console.error(`[Knowledge] Ollama generate returned ${ollamaRes.status}`);
    }
    const ollamaData = await ollamaRes.json();
    response = ollamaData?.response ?? '';

    return json({
      success: true,
      response,
      llm_used: llmUsed,
      rag_context: {
        matches: searchResults.length,
        avg_similarity: avgScore.toFixed(2),
        documents: searchResults.map(r => r.payload?.document_name)
      }
    });
  } catch (err) {
    console.error('Generation error:', err);
    return json(
      { error: 'Generation failed' },
      { status: 500 }
    );
  }
};
